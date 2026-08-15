import { requireAdminPage } from "@/lib/admin-guard";
import { formatMoney, formatDuration } from "@/lib/format";
import { occupancyReport, salesReport } from "@/lib/reports";
import { addDaysToDateString, isValidDateString, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdminPage("/admin/reportes");
  const { from: fromParam, to: toParam } = await searchParams;

  const today = toLocalDateString();
  const from = isValidDateString(fromParam) ? fromParam : addDaysToDateString(today, -29);
  const to = isValidDateString(toParam) ? toParam : today;

  const [sales, occupancy] = await Promise.all([salesReport(from, to), occupancyReport(from, to)]);
  const occupancyByBarber = new Map(occupancy.byBarber.map((b) => [b.barberId, b]));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Reportes</h1>

      <form data-testid="report-range-form" method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="from">
            Desde
          </label>
          <input id="from" data-testid="report-from" type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">
            Hasta
          </label>
          <input id="to" data-testid="report-to" type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button type="submit" data-testid="report-apply" className="btn-primary">
          Aplicar
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-[#9C8A6F]">
            Ingresos del periodo (citas completadas)
          </p>
          <p data-testid="report-total-revenue" className="mt-1 text-3xl font-black">
            {formatMoney(sales.totalRevenueCents)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-[#9C8A6F]">Citas completadas</p>
          <p data-testid="report-total-appointments" className="mt-1 text-3xl font-black">
            {sales.totalAppointments}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Por servicio</h2>
        <div className="card overflow-x-auto p-0">
          <table data-testid="report-by-service" className="table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Citas</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {sales.byService.length === 0 ? (
                <tr data-testid="report-by-service-empty">
                  <td colSpan={3}>Sin datos en este rango.</td>
                </tr>
              ) : (
                sales.byService.map((row) => (
                  <tr key={row.serviceId} data-testid="report-service-row" data-service-id={row.serviceId}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>{formatMoney(row.revenueCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Por barbero</h2>
        <div className="card overflow-x-auto p-0">
          <table data-testid="report-by-barber" className="table">
            <thead>
              <tr>
                <th>Barbero</th>
                <th>Citas</th>
                <th>Ingresos</th>
                <th>Minutos ocupados</th>
                <th>Minutos disponibles</th>
                <th>% ocupación</th>
              </tr>
            </thead>
            <tbody>
              {occupancy.byBarber.map((row) => {
                const sale = sales.byBarber.find((s) => s.barberId === row.barberId);
                const occ = occupancyByBarber.get(row.barberId);
                return (
                  <tr key={row.barberId} data-testid="report-barber-row" data-barber-id={row.barberId}>
                    <td>{row.name}</td>
                    <td>{row.appointments}</td>
                    <td>{formatMoney(sale?.revenueCents ?? 0)}</td>
                    <td>{formatDuration(row.bookedMinutes)}</td>
                    <td>{formatDuration(row.availableMinutes)}</td>
                    <td data-testid="report-barber-occupancy">{occ?.occupancyPct ?? 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Por día</h2>
        <div className="card overflow-x-auto p-0">
          <table data-testid="report-by-day" className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Citas</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {sales.byDay.length === 0 ? (
                <tr>
                  <td colSpan={3}>Sin datos en este rango.</td>
                </tr>
              ) : (
                sales.byDay.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.count}</td>
                    <td>{formatMoney(row.revenueCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
