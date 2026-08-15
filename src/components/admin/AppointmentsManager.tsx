"use client";

import { useCallback, useEffect, useState } from "react";

type Appointment = {
  id: string;
  startsAt: string;
  status: string;
  statusLabel: string;
  source: string;
  priceCents: number;
  priceLabel: string;
  paymentStatus: string;
  ghlSyncStatus: string;
  ghlSyncError: string | null;
  service: { id: string; name: string; durationMin: number };
  barber: { id: string; name: string };
  customer: { name: string; phone: string; email: string | null };
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "confirmed", label: "Confirmada" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No asistió" },
];

function fmtDateTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(iso));
}

export default function AppointmentsManager({
  barbers,
  defaultFrom,
  defaultTo,
  timezone,
}: {
  barbers: Array<{ id: string; name: string }>;
  defaultFrom: string;
  defaultTo: string;
  timezone: string;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [barberId, setBarberId] = useState("all");
  const [status, setStatus] = useState("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (barberId !== "all") params.set("barberId", barberId);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/appointments?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudieron cargar las citas");
        setAppointments([]);
        return;
      }
      setAppointments(data.appointments ?? []);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }, [from, to, barberId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.message ?? "No se pudo actualizar la cita");
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-4" data-testid="appointment-filters">
        <div>
          <label className="label" htmlFor="filter-from">
            Desde
          </label>
          <input
            id="filter-from"
            data-testid="filter-from"
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="filter-to">
            Hasta
          </label>
          <input
            id="filter-to"
            data-testid="filter-to"
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="filter-barber">
            Barbero
          </label>
          <select
            id="filter-barber"
            data-testid="filter-barber"
            className="input"
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
          >
            <option value="all">Todos</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="filter-status">
            Estado
          </label>
          <select
            id="filter-status"
            data-testid="filter-status"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <p data-testid="admin-error" role="alert" className="rounded-lg border border-[#6B2A24] bg-[#2E1613] px-3 py-2 text-sm text-[#E2897E]">
          {error}
        </p>
      ) : null}

      <div className="card overflow-x-auto p-0">
        <table data-testid="appointments-table" className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Servicio</th>
              <th>Barbero</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Pago</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr data-testid="appointments-loading">
                <td colSpan={8}>Cargando…</td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr data-testid="appointments-empty">
                <td colSpan={8}>No hay citas en este rango.</td>
              </tr>
            ) : (
              appointments.map((a) => (
                <tr key={a.id} data-testid="appointment-row" data-appointment-id={a.id}>
                  <td>{fmtDateTime(a.startsAt, timezone)}</td>
                  <td>
                    <span data-testid="row-customer-name">{a.customer.name}</span>
                    <span data-testid="row-customer-phone" className="block text-xs text-[#9C8A6F]">
                      {a.customer.phone}
                    </span>
                  </td>
                  <td>
                    {a.service.name}
                    <span className="block text-xs text-[#9C8A6F]">{a.priceLabel}</span>
                  </td>
                  <td>{a.barber.name}</td>
                  <td>{a.source}</td>
                  <td>
                    <span data-testid="row-status">{a.statusLabel}</span>
                    {a.ghlSyncStatus === "failed" ? (
                      <button
                        type="button"
                        data-testid="sync-warning"
                        title={a.ghlSyncError ?? ""}
                        className="ml-2 badge bg-[#3A2C12] text-[#E0B95E]"
                        onClick={() => patch(a.id, { action: "resync" })}
                      >
                        Sin sincronizar · reintentar
                      </button>
                    ) : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      data-testid="toggle-paid"
                      className="badge border border-[#4A3B29] bg-[#211B15]"
                      onClick={() =>
                        patch(a.id, {
                          paymentStatus: a.paymentStatus === "paid_onsite" ? "unpaid" : "paid_onsite",
                        })
                      }
                    >
                      {a.paymentStatus === "paid_onsite" ? "Pagado en local" : "Sin pagar"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        data-testid="status-completed"
                        className="badge border border-[#4A3B29] bg-[#211B15]"
                        onClick={() => patch(a.id, { status: "completed" })}
                      >
                        Completada
                      </button>
                      <button
                        type="button"
                        data-testid="status-no-show"
                        className="badge border border-[#4A3B29] bg-[#211B15]"
                        onClick={() => patch(a.id, { status: "no_show" })}
                      >
                        No asistió
                      </button>
                      <button
                        type="button"
                        data-testid="status-cancelled"
                        className="badge border border-[#4A3B29] bg-[#211B15]"
                        onClick={() => patch(a.id, { status: "cancelled" })}
                      >
                        Cancelada
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
