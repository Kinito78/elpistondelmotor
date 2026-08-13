import { getActiveBranch, prisma } from "./db";
import {
  dateRangeList,
  endOfLocalDayUtc,
  localDateTimeToUtc,
  startOfLocalDayUtc,
  toLocalDateString,
  weekdayOfLocalDate,
} from "./time";

export type SalesReport = {
  from: string;
  to: string;
  totalRevenueCents: number;
  totalAppointments: number;
  byService: Array<{ serviceId: string; name: string; count: number; revenueCents: number }>;
  byBarber: Array<{ barberId: string; name: string; count: number; revenueCents: number }>;
  byDay: Array<{ date: string; count: number; revenueCents: number }>;
};

export type OccupancyReport = {
  from: string;
  to: string;
  byBarber: Array<{
    barberId: string;
    name: string;
    bookedMinutes: number;
    availableMinutes: number;
    occupancyPct: number;
    appointments: number;
  }>;
};

/** Ingresos: solo citas `completed`. */
export async function salesReport(from: string, to: string): Promise<SalesReport> {
  const branch = await getActiveBranch();
  const gte = startOfLocalDayUtc(from);
  const lt = endOfLocalDayUtc(to);

  const appointments = await prisma.appointment.findMany({
    where: {
      branchId: branch.id,
      status: "completed",
      startsAt: { gte, lt },
    },
    include: { service: true, barber: true },
    orderBy: { startsAt: "asc" },
  });

  const byService = new Map<string, { serviceId: string; name: string; count: number; revenueCents: number }>();
  const byBarber = new Map<string, { barberId: string; name: string; count: number; revenueCents: number }>();
  const byDay = new Map<string, { date: string; count: number; revenueCents: number }>();

  let totalRevenueCents = 0;
  for (const appt of appointments) {
    totalRevenueCents += appt.priceCents;

    const s = byService.get(appt.serviceId) ?? {
      serviceId: appt.serviceId,
      name: appt.service.name,
      count: 0,
      revenueCents: 0,
    };
    s.count += 1;
    s.revenueCents += appt.priceCents;
    byService.set(appt.serviceId, s);

    const b = byBarber.get(appt.barberId) ?? {
      barberId: appt.barberId,
      name: appt.barber.name,
      count: 0,
      revenueCents: 0,
    };
    b.count += 1;
    b.revenueCents += appt.priceCents;
    byBarber.set(appt.barberId, b);

    const day = toLocalDateString(appt.startsAt);
    const d = byDay.get(day) ?? { date: day, count: 0, revenueCents: 0 };
    d.count += 1;
    d.revenueCents += appt.priceCents;
    byDay.set(day, d);
  }

  return {
    from,
    to,
    totalRevenueCents,
    totalAppointments: appointments.length,
    byService: [...byService.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    byBarber: [...byBarber.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Ocupación: cuenta citas `confirmed` + `completed` sobre las ventanas laborales. */
export async function occupancyReport(from: string, to: string): Promise<OccupancyReport> {
  const branch = await getActiveBranch();
  const gte = startOfLocalDayUtc(from);
  const lt = endOfLocalDayUtc(to);
  const dates = dateRangeList(from, to);

  const barbers = await prisma.barber.findMany({
    where: { branchId: branch.id },
    include: { workingHours: true, timeOff: true },
    orderBy: { name: "asc" },
  });

  const appointments = await prisma.appointment.findMany({
    where: {
      branchId: branch.id,
      status: { in: ["confirmed", "completed"] },
      startsAt: { gte, lt },
    },
    select: { barberId: true, startsAt: true, endsAt: true },
  });

  const byBarber = barbers.map((barber) => {
    const appts = appointments.filter((a) => a.barberId === barber.id);
    const bookedMinutes = appts.reduce(
      (acc, a) => acc + Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
      0
    );

    let availableMinutes = 0;
    for (const date of dates) {
      const weekday = weekdayOfLocalDate(date);
      const wh = barber.workingHours.find((w) => w.weekday === weekday);
      if (!wh || !wh.active || wh.endMin <= wh.startMin) continue;

      const windowStart = localDateTimeToUtc(date, wh.startMin).getTime();
      const windowEnd = localDateTimeToUtc(date, wh.endMin).getTime();
      let minutes = Math.round((windowEnd - windowStart) / 60_000);

      for (const off of barber.timeOff) {
        const overlapStart = Math.max(windowStart, off.startsAt.getTime());
        const overlapEnd = Math.min(windowEnd, off.endsAt.getTime());
        if (overlapEnd > overlapStart) {
          minutes -= Math.round((overlapEnd - overlapStart) / 60_000);
        }
      }
      availableMinutes += Math.max(0, minutes);
    }

    const occupancyPct =
      availableMinutes === 0 ? 0 : Math.round((bookedMinutes / availableMinutes) * 100);

    return {
      barberId: barber.id,
      name: barber.name,
      bookedMinutes,
      availableMinutes,
      occupancyPct: Math.min(100, Math.max(0, occupancyPct)),
      appointments: appts.length,
    };
  });

  return { from, to, byBarber };
}
