import { randomUUID } from "crypto";
import type { Appointment } from "@prisma/client";
import { computeAvailability, resolveFreeSlot } from "./availability";
import { getActiveBranch, prisma } from "./db";
import { env } from "./env";
import { HttpError, notFound, slotTaken } from "./errors";
import { getGhlClient } from "./ghl/client";
import { normalizePhone } from "./format";
import { createPendingVisit } from "./loyalty";
import { toLocalDateString } from "./time";
import { createAppointmentSchema, zodFields } from "./validation";

/** El slot queda ocupado mientras la cita está vigente; se libera al cancelar. */
export function slotKeyFor(barberId: string, startsAt: Date, status: string): string | null {
  return status === "confirmed" || status === "completed"
    ? `${barberId}|${startsAt.toISOString()}`
    : null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

export type CreateBookingInput = {
  payload: unknown;
  source?: "web" | "admin" | "whatsapp";
  ignoreLead?: boolean;
};

export async function createBooking({
  payload,
  source = "web",
  ignoreLead = false,
}: CreateBookingInput): Promise<Appointment> {
  // 1. Validación
  const parsed = createAppointmentSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(
      422,
      "VALIDATION_ERROR",
      "Revisa los datos del formulario",
      zodFields(parsed.error)
    );
  }
  const data = parsed.data;
  const startsAt = new Date(data.startsAt);

  const branch = await getActiveBranch();
  const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
  if (!service) throw notFound("El servicio no existe");
  if (!service.active) throw notFound("El servicio no está disponible");

  // 3. Recalcular disponibilidad del slot exacto
  const date = toLocalDateString(startsAt);
  const slot = await resolveFreeSlot({
    barberId: data.barberId,
    serviceId: data.serviceId,
    startsAt,
    date,
    ignoreLead,
  });
  if (!slot) throw slotTaken();

  const barber = await prisma.barber.findUnique({ where: { id: slot.barberId } });
  if (!barber) throw notFound("El barbero no existe");

  // 2. Cliente por teléfono normalizado (E.164)
  const phone = normalizePhone(data.customer.phone, env.DEFAULT_COUNTRY_CODE);
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {
      name: data.customer.name,
      ...(data.customer.email ? { email: data.customer.email } : {}),
    },
    create: {
      name: data.customer.name,
      phone,
      email: data.customer.email ?? null,
    },
  });

  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

  // 4. Alta local (el índice único de slotKey impide doble reserva confirmada)
  let appointment: Appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        branchId: branch.id,
        barberId: barber.id,
        serviceId: service.id,
        customerId: customer.id,
        startsAt,
        endsAt,
        status: "confirmed",
        source,
        priceCents: service.priceCents,
        paymentStatus: "unpaid",
        notes: data.notes ?? null,
        manageToken: randomUUID(),
        slotKey: slotKeyFor(barber.id, startsAt, "confirmed"),
        ghlSyncStatus: "pending",
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw slotTaken();
    throw err;
  }

  // 5-6. Sincronización con GHL fuera de la transacción; nunca bloquea la reserva.
  await syncAppointmentToGhl(appointment.id);
  return (await prisma.appointment.findUnique({ where: { id: appointment.id } }))!;
}

/** Crea (o recrea) el evento en GHL y guarda el estado de sincronización. */
export async function syncAppointmentToGhl(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { barber: true, service: true, customer: true, branch: true },
  });
  if (!appointment) return;

  const ghl = getGhlClient(appointment.branch);
  const calendarId = appointment.barber.ghlCalendarId || appointment.branch.ghlCalendarId;

  try {
    if (!calendarId) throw new Error("La sucursal no tiene ghlCalendarId configurado");

    const { contactId } = await ghl.upsertContact({
      name: appointment.customer.name,
      phone: appointment.customer.phone,
      email: appointment.customer.email ?? undefined,
    });

    if (appointment.customer.ghlContactId !== contactId) {
      await prisma.customer.update({
        where: { id: appointment.customerId },
        data: { ghlContactId: contactId },
      });
    }

    if (appointment.ghlEventId) {
      await ghl.updateAppointment({
        ghlEventId: appointment.ghlEventId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
      });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { ghlSyncStatus: "synced", ghlSyncError: null },
      });
      return;
    }

    const { ghlEventId } = await ghl.createAppointment({
      calendarId,
      contactId,
      assignedUserId: appointment.barber.ghlUserId ?? undefined,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      title: `${appointment.service.name} - ${appointment.customer.name}`,
      notes: appointment.notes ?? undefined,
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { ghlEventId, ghlSyncStatus: "synced", ghlSyncError: null },
    });

    if (ghl.mode === "mock") {
      await prisma.ghlEvent.updateMany({
        where: { ghlEventId },
        data: { barberId: appointment.barberId, origin: appointment.source },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GHL] sincronización fallida:", message);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { ghlSyncStatus: "failed", ghlSyncError: message.slice(0, 500) },
    });
  }
}

const ACTIVE_STATUSES = new Set(["confirmed"]);

function assertMutable(appointment: Appointment, ignoreLead = false) {
  if (!ACTIVE_STATUSES.has(appointment.status)) {
    throw new HttpError(
      409,
      appointment.status === "cancelled" ? "ALREADY_CANCELLED" : "NOT_MODIFIABLE",
      "Esta cita ya no puede modificarse"
    );
  }
  if (!ignoreLead) {
    const leadMs = env.MIN_LEAD_MINUTES * 60_000;
    if (appointment.startsAt.getTime() - Date.now() < leadMs) {
      throw new HttpError(
        409,
        "TOO_LATE",
        `Faltan menos de ${env.MIN_LEAD_MINUTES} minutos para la cita`
      );
    }
  }
}

export async function cancelBooking(
  appointment: Appointment,
  opts: { ignoreLead?: boolean } = {}
): Promise<Appointment> {
  assertMutable(appointment, opts.ignoreLead);

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "cancelled", slotKey: null },
  });

  if (appointment.ghlEventId) {
    try {
      const branch = await prisma.branch.findUniqueOrThrow({ where: { id: appointment.branchId } });
      await getGhlClient(branch).cancelAppointment({ ghlEventId: appointment.ghlEventId });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { ghlSyncStatus: "synced", ghlSyncError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[GHL] cancelación fallida:", message);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { ghlSyncStatus: "failed", ghlSyncError: message.slice(0, 500) },
      });
    }
  }

  return (await prisma.appointment.findUnique({ where: { id: updated.id } }))!;
}

export async function rescheduleBooking(
  appointment: Appointment,
  newStartsAtIso: string,
  opts: { ignoreLead?: boolean } = {}
): Promise<Appointment> {
  assertMutable(appointment, opts.ignoreLead);

  const startsAt = new Date(newStartsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    throw new HttpError(422, "VALIDATION_ERROR", "Horario inválido", { startsAt: "Horario inválido" });
  }

  const service = await prisma.service.findUnique({ where: { id: appointment.serviceId } });
  if (!service) throw notFound("El servicio no existe");

  const date = toLocalDateString(startsAt);
  const slot = await resolveFreeSlot({
    barberId: appointment.barberId,
    serviceId: appointment.serviceId,
    startsAt,
    date,
    excludeAppointmentId: appointment.id,
    ignoreLead: opts.ignoreLead,
  });
  if (!slot) throw slotTaken();

  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

  let updated: Appointment;
  try {
    updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        startsAt,
        endsAt,
        slotKey: slotKeyFor(appointment.barberId, startsAt, "confirmed"),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw slotTaken();
    throw err;
  }

  if (appointment.ghlEventId) {
    try {
      const branch = await prisma.branch.findUniqueOrThrow({ where: { id: appointment.branchId } });
      await getGhlClient(branch).updateAppointment({
        ghlEventId: appointment.ghlEventId,
        startsAt,
        endsAt,
      });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { ghlSyncStatus: "synced", ghlSyncError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[GHL] reprogramación fallida:", message);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { ghlSyncStatus: "failed", ghlSyncError: message.slice(0, 500) },
      });
    }
  } else {
    await syncAppointmentToGhl(appointment.id);
  }

  return (await prisma.appointment.findUnique({ where: { id: updated.id } }))!;
}

/** Cambio de estado desde el panel admin (completada, no asistió, cancelada...). */
export async function setAppointmentStatus(
  appointment: Appointment,
  status: string
): Promise<Appointment> {
  const allowed = ["confirmed", "cancelled", "completed", "no_show"];
  if (!allowed.includes(status)) {
    throw new HttpError(422, "VALIDATION_ERROR", "Estado inválido", { status: "Estado inválido" });
  }

  let slotKey: string | null = slotKeyFor(appointment.barberId, appointment.startsAt, status);
  if (slotKey) {
    // Si otra cita ya ocupa ese slotKey, se deja en null para no colisionar.
    const clash = await prisma.appointment.findFirst({
      where: { slotKey, id: { not: appointment.id } },
      select: { id: true },
    });
    if (clash) slotKey = null;
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status, slotKey },
  });

  if (status === "cancelled" && appointment.ghlEventId) {
    try {
      const branch = await prisma.branch.findUniqueOrThrow({ where: { id: appointment.branchId } });
      await getGhlClient(branch).cancelAppointment({ ghlEventId: appointment.ghlEventId });
    } catch (err) {
      console.error("[GHL] cancelación (admin) fallida:", err);
    }
  }

  // Alta automática de fidelidad: una visita pendiente por cita completada,
  // solo al transicionar (evita duplicar si ya estaba completada).
  if (status === "completed" && appointment.status !== "completed") {
    await createPendingVisit({
      branchId: appointment.branchId,
      customerId: appointment.customerId,
      appointmentId: appointment.id,
      source: "auto",
    });
  }

  return updated;
}

export { computeAvailability };
