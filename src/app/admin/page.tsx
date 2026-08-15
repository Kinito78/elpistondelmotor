import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { getActiveBranch, prisma } from "@/lib/db";
import { formatMoney, sourceLabel, statusLabel } from "@/lib/format";
import { occupancyReport } from "@/lib/reports";
import { endOfLocalDayUtc, labelHHmm, labelShort, startOfLocalDayUtc, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdminPage("/admin");
  const branch = await getActiveBranch();

  const today = toLocalDateString();
  const dayStart = startOfLocalDayUtc(today);
  const dayEnd = endOfLocalDayUtc(today);
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const include = { barber: true, service: true, customer: true } as const;

  const [todayAppointments, upcoming, occupancy] = await Promise.all([
    prisma.appointment.findMany({
      where: { branchId: branch.id, startsAt: { gte: dayStart, lt: dayEnd } },
      include,
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        branchId: branch.id,
        startsAt: { gte: now, lt: in7Days },
        status: { in: ["confirmed", "completed"] },
      },
      include,
      orderBy: { startsAt: "asc" },
    }),
    occupancyReport(today, today),
  ]);

  const activeToday = todayAppointments.filter((a) => a.status !== "cancelled");
  const revenueToday = todayAppointments
    .filter((a) => a.status === "completed")
    .reduce((acc, a) => acc + a.priceCents, 0);

  const totals = occupancy.byBarber.reduce(
    (acc, b) => ({
      booked: acc.booked + b.bookedMinutes,
      available: acc.available + b.availableMinutes,
    }),
    { booked: 0, available: 0 }
  );
  const occupancyToday =
    totals.available === 0 ? 0 : Math.round((totals.booked / totals.available) * 100);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
        <span className="text-sm text-[#9C8A6F]">{today}</span>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-[#9C8A6F]">Citas de hoy</p>
          <p data-testid="kpi-citas-hoy" className="mt-1 text-3xl font-black">
            {activeToday.length}
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-[#9C8A6F]">Ingresos de hoy</p>
          <p data-testid="kpi-ingresos-hoy" className="mt-1 text-3xl font-black">
            {formatMoney(revenueToday)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-[#9C8A6F]">Ocupación de hoy</p>
          <p data-testid="kpi-ocupacion-hoy" className="mt-1 text-3xl font-black">
            {occupancyToday}%
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Agenda de hoy</h2>
        {todayAppointments.length === 0 ? (
          <p data-testid="today-empty" className="card text-sm text-[#9C8A6F]">
            No hay citas para hoy.
          </p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table data-testid="today-table" className="table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Barbero</th>
                  <th>Origen</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {todayAppointments.map((a) => (
                  <tr key={a.id} data-testid="appointment-row" data-appointment-id={a.id}>
                    <td>{labelHHmm(a.startsAt)}</td>
                    <td>
                      {a.customer.name}
                      <span className="block text-xs text-[#9C8A6F]">{a.customer.phone}</span>
                    </td>
                    <td>{a.service.name}</td>
                    <td>{a.barber.name}</td>
                    <td>{sourceLabel(a.source)}</td>
                    <td>
                      {statusLabel(a.status)}
                      {a.ghlSyncStatus === "failed" ? (
                        <span
                          data-testid="sync-warning"
                          title={a.ghlSyncError ?? ""}
                          className="ml-2 badge bg-[#3A2C12] text-[#E0B95E]"
                        >
                          Sin sincronizar
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Próximos 7 días</h2>
        <div className="card overflow-x-auto p-0">
          <table data-testid="upcoming-table" className="table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Barbero</th>
                <th>Origen</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr data-testid="upcoming-empty">
                  <td colSpan={6}>No hay citas próximas.</td>
                </tr>
              ) : (
                upcoming.map((a) => (
                  <tr key={a.id} data-testid="appointment-row" data-appointment-id={a.id}>
                    <td>{labelShort(a.startsAt)}</td>
                    <td>
                      {a.customer.name}
                      <span className="block text-xs text-[#9C8A6F]">{a.customer.phone}</span>
                    </td>
                    <td>{a.service.name}</td>
                    <td>{a.barber.name}</td>
                    <td>{sourceLabel(a.source)}</td>
                    <td>{statusLabel(a.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm">
          <Link href="/admin/citas" className="font-semibold underline">
            Ver todas las citas
          </Link>
        </p>
      </section>
    </div>
  );
}
