import { getActiveBranch, prisma } from "./db";
import { env } from "./env";
import { HttpError, notFound } from "./errors";
import { getGhlClient } from "./ghl/client";
import {
  endOfLocalDayUtc,
  isValidDateString,
  labelHHmm,
  localDateTimeToUtc,
  overlaps,
  startOfLocalDayUtc,
  weekdayOfLocalDate,
} from "./time";

export type Slot = {
  start: string;
  end: string;
  label: string;
  barberId: string;
};

export type AvailabilityResult = {
  date: string;
  timezone: string;
  durationMin: number;
  slots: Slot[];
};

export type AvailabilityInput = {
  barberId: string;
  serviceId: string;
  date: string;
  /** No considerar esta cita como ocupada (usado al reprogramar). */
  excludeAppointmentId?: string;
  /** Ignorar la antelación mínima (altas walk-in desde admin). */
  ignoreLead?: boolean;
};

type Interval = { start: number; end: number };

/**
 * Única implementación del cálculo de disponibilidad.
 * La usan `GET /api/availability` y la validación del alta de citas.
 */
export async function computeAvailability(input: AvailabilityInput): Promise<AvailabilityResult> {
  const { barberId, serviceId, date } = input;

  if (!barberId || !serviceId || !isValidDateString(date)) {
    throw new HttpError(400, "INVALID_PARAMS", "Parámetros inválidos: barberId, serviceId y date (YYYY-MM-DD) son obligatorios");
  }

  const branch = await getActiveBranch();

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw notFound("El servicio no existe");

  let barbers;
  if (barberId === "any") {
    barbers = await prisma.barber.findMany({
      where: {
        branchId: branch.id,
        active: true,
        services: { some: { serviceId } },
      },
      orderBy: { name: "asc" },
    });
  } else {
    const barber = await prisma.barber.findUnique({ where: { id: barberId } });
    if (!barber) throw notFound("El barbero no existe");
    barbers = barber.active ? [barber] : [];
  }

  const result: AvailabilityResult = {
    date,
    timezone: env.BUSINESS_TIMEZONE,
    durationMin: service.durationMin,
    slots: [],
  };
  if (barbers.length === 0) return result;

  const dayStart = startOfLocalDayUtc(date);
  const dayEnd = endOfLocalDayUtc(date);
  const weekday = weekdayOfLocalDate(date);
  const barberIds = barbers.map((b) => b.id);

  const [workingHours, timeOff, appointments] = await Promise.all([
    prisma.workingHour.findMany({ where: { barberId: { in: barberIds }, weekday } }),
    prisma.timeOff.findMany({
      where: { barberId: { in: barberIds }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    }),
    prisma.appointment.findMany({
      where: {
        barberId: { in: barberIds },
        status: "confirmed",
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
      },
      select: { id: true, barberId: true, startsAt: true, endsAt: true, ghlEventId: true },
    }),
  ]);

  const excludedGhlEventIds = new Set<string>();
  if (input.excludeAppointmentId) {
    const excluded = await prisma.appointment.findUnique({
      where: { id: input.excludeAppointmentId },
      select: { ghlEventId: true },
    });
    if (excluded?.ghlEventId) excludedGhlEventIds.add(excluded.ghlEventId);
  }

  // Ocupados según el calendario externo (GHL): en modo mock, la tabla GhlEvent.
  const ghl = getGhlClient();
  const busyByBarber = new Map<string, Interval[]>();
  await Promise.all(
    barbers.map(async (barber) => {
      const calendarId = barber.ghlCalendarId || branch.ghlCalendarId;
      if (!calendarId) {
        busyByBarber.set(barber.id, []);
        return;
      }
      try {
        const busy = await ghl.getBusySlots({
          calendarId,
          assignedUserId: barber.ghlUserId ?? undefined,
          from: dayStart,
          to: dayEnd,
        });
        busyByBarber.set(
          barber.id,
          busy
            .filter((b) => !excludedGhlEventIds.has(b.ghlEventId))
            .map((b) => ({ start: b.startsAt.getTime(), end: b.endsAt.getTime() }))
        );
      } catch (err) {
        // El calendario externo no debe tumbar la disponibilidad: se usa el
        // estado local como respaldo.
        console.error("[GHL] getBusySlots falló, usando solo datos locales:", err);
        busyByBarber.set(barber.id, []);
      }
    })
  );

  const now = Date.now();
  const leadMs = input.ignoreLead ? 0 : env.MIN_LEAD_MINUTES * 60_000;
  const step = env.SLOT_STEP_MINUTES;

  // Conteo de citas del día por barbero (para el reparto de "cualquier barbero").
  const dayCount = new Map<string, number>();
  for (const b of barbers) dayCount.set(b.id, 0);
  for (const appt of appointments) {
    dayCount.set(appt.barberId, (dayCount.get(appt.barberId) ?? 0) + 1);
  }

  // start(ms) → barberos disponibles
  const byStart = new Map<number, string[]>();

  for (const barber of barbers) {
    const wh = workingHours.find((w) => w.barberId === barber.id);
    if (!wh || !wh.active || wh.endMin <= wh.startMin) continue;

    const barberTimeOff = timeOff.filter((t) => t.barberId === barber.id);
    const barberAppts = appointments.filter((a) => a.barberId === barber.id);
    const barberBusy = busyByBarber.get(barber.id) ?? [];

    for (let m = wh.startMin; m + service.durationMin <= wh.endMin; m += step) {
      const start = localDateTimeToUtc(date, m);
      const end = new Date(start.getTime() + service.durationMin * 60_000);

      if (start.getTime() < now + leadMs) continue;

      const blocked =
        barberTimeOff.some((t) => overlaps(start, end, t.startsAt, t.endsAt)) ||
        barberAppts.some((a) => overlaps(start, end, a.startsAt, a.endsAt)) ||
        barberBusy.some((b) => overlaps(start, end, new Date(b.start), new Date(b.end)));
      if (blocked) continue;

      const list = byStart.get(start.getTime()) ?? [];
      list.push(barber.id);
      byStart.set(start.getTime(), list);
    }
  }

  const orderedBarbers = [...barbers].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const slots: Slot[] = [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMs, candidates]) => {
      // Asignación determinista: menos citas ese día, desempate por nombre asc.
      const chosen = orderedBarbers
        .filter((b) => candidates.includes(b.id))
        .sort((a, b) => {
          const diff = (dayCount.get(a.id) ?? 0) - (dayCount.get(b.id) ?? 0);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, "es");
        })[0];
      const start = new Date(startMs);
      const end = new Date(startMs + service.durationMin * 60_000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        label: labelHHmm(start),
        barberId: chosen.id,
      };
    });

  result.slots = slots;
  return result;
}

/**
 * Resuelve el barbero concreto para un `startsAt` y verifica que el slot esté libre.
 * Devuelve `null` si el horario no está disponible.
 */
export async function resolveFreeSlot(input: {
  barberId: string;
  serviceId: string;
  startsAt: Date;
  date: string;
  excludeAppointmentId?: string;
  ignoreLead?: boolean;
}): Promise<Slot | null> {
  const availability = await computeAvailability({
    barberId: input.barberId,
    serviceId: input.serviceId,
    date: input.date,
    excludeAppointmentId: input.excludeAppointmentId,
    ignoreLead: input.ignoreLead,
  });
  const target = input.startsAt.toISOString();
  return availability.slots.find((s) => s.start === target) ?? null;
}
