"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Service = { id: string; name: string };

type WorkingHour = { weekday: number; startMin: number; endMin: number; active: boolean };

type TimeOff = { id: string; startsAt: string; endsAt: string; reason: string | null };

type Barber = {
  id: string;
  name: string;
  bio: string | null;
  active: boolean;
  ghlUserId: string | null;
  serviceIds: string[];
  workingHours: WorkingHour[];
  timeOff: TimeOff[];
};

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const pad = (n: number) => String(n).padStart(2, "0");
const minToTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const timeToMin = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function BarbersManager({
  services,
  timezone,
}: {
  services: Service[];
  timezone: string;
}) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [activeBarber, setActiveBarber] = useState(true);

  const [newName, setNewName] = useState("");
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");

  const load = useCallback(
    async (keepId?: string | null) => {
      const res = await fetch("/api/admin/barbers");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudieron cargar los barberos");
        return;
      }
      const list: Barber[] = data.barbers ?? [];
      setBarbers(list);
      const nextId = keepId && list.some((b) => b.id === keepId) ? keepId : list[0]?.id ?? null;
      setSelectedId(nextId);
    },
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => barbers.find((b) => b.id === selectedId) ?? null,
    [barbers, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    const filled: WorkingHour[] = [];
    for (let weekday = 0; weekday <= 6; weekday++) {
      const existing = selected.workingHours.find((w) => w.weekday === weekday);
      filled.push(
        existing
          ? { ...existing }
          : { weekday, startMin: weekday === 6 ? 600 : 540, endMin: weekday === 6 ? 1020 : 1140, active: weekday !== 0 }
      );
    }
    setHours(filled);
    setServiceIds([...selected.serviceIds]);
    setName(selected.name);
    setActiveBarber(selected.active);
  }, [selected]);

  async function saveSchedule() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/barbers/${selected.id}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo guardar el horario");
        return;
      }
      setNotice("Horario guardado");
      await load(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function saveBarber() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/barbers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), active: activeBarber, serviceIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo guardar el barbero");
        return;
      }
      setNotice("Barbero guardado");
      await load(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function createBarber(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim().length < 2) {
      setError("El nombre es obligatorio");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/barbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), serviceIds: services.map((s) => s.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo crear el barbero");
        return;
      }
      setNewName("");
      await load(data?.barber?.id ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function addTimeOff(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!offStart || !offEnd) {
      setError("Indica la fecha de inicio y de fin");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/barbers/${selected.id}/time-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: `${offStart}T00:00:00`,
          endsAt: `${offEnd}T23:59:00`,
          reason: offReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo registrar el día libre");
        return;
      }
      setOffStart("");
      setOffEnd("");
      setOffReason("");
      setNotice("Día libre registrado");
      await load(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeTimeOff(timeOffId: string) {
    if (!selected) return;
    await fetch(`/api/admin/barbers/${selected.id}/time-off?timeOffId=${timeOffId}`, {
      method: "DELETE",
    });
    await load(selected.id);
  }

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: timezone, dateStyle: "medium" }).format(
      new Date(iso)
    );

  return (
    <div className="space-y-6">
      {error ? (
        <p data-testid="admin-error" role="alert" className="rounded-lg border border-[#e5b5b0] bg-[#fdecea] px-3 py-2 text-sm text-[#8a231b]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p data-testid="admin-notice" className="rounded-lg border border-[#bcd9b6] bg-[#e4f0e2] px-3 py-2 text-sm text-[#2f6b28]">
          {notice}
        </p>
      ) : null}

      <section className="card space-y-3">
        <h2 className="font-bold">Barberos</h2>
        <div className="flex flex-wrap gap-2" data-testid="barber-list">
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid="barber-item"
              data-barber-id={b.id}
              aria-pressed={b.id === selectedId}
              className={b.id === selectedId ? "btn bg-[#14110f] text-white" : "btn-secondary"}
              onClick={() => setSelectedId(b.id)}
            >
              {b.name}
              {b.active ? "" : " (inactivo)"}
            </button>
          ))}
        </div>
        <form onSubmit={createBarber} data-testid="barber-create-form" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="new-barber-name">
              Nuevo barbero
            </label>
            <input
              id="new-barber-name"
              data-testid="new-barber-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button type="submit" data-testid="create-barber" className="btn-primary" disabled={busy}>
            Agregar
          </button>
        </form>
      </section>

      {selected ? (
        <>
          <section className="card space-y-3" data-testid="barber-editor" data-barber-id={selected.id}>
            <h2 className="font-bold">
              Editar barbero:{" "}
              <span data-testid="selected-barber-name">{selected.name}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="barber-name">
                  Nombre
                </label>
                <input
                  id="barber-name"
                  data-testid="barber-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    data-testid="barber-active"
                    checked={activeBarber}
                    onChange={(e) => setActiveBarber(e.target.checked)}
                  />
                  Activo
                </label>
              </div>
            </div>

            <div data-testid="barber-services">
              <p className="label">Servicios que ofrece</p>
              <div className="flex flex-wrap gap-3">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid="barber-service-checkbox"
                      data-service-id={s.id}
                      checked={serviceIds.includes(s.id)}
                      onChange={(e) =>
                        setServiceIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <button type="button" data-testid="save-barber" className="btn-primary" onClick={saveBarber} disabled={busy}>
              Guardar barbero
            </button>
          </section>

          <section className="card space-y-3">
            <h2 className="font-bold">Horario semanal</h2>
            <div className="space-y-2">
              {hours.map((h) => (
                <div
                  key={h.weekday}
                  data-testid={`schedule-row-${h.weekday}`}
                  data-weekday={h.weekday}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[#efe8dc] px-3 py-2"
                >
                  <span className="w-24 text-sm font-semibold">{WEEKDAYS[h.weekday]}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid={`schedule-active-${h.weekday}`}
                      checked={h.active}
                      onChange={(e) =>
                        setHours((prev) =>
                          prev.map((row) =>
                            row.weekday === h.weekday ? { ...row, active: e.target.checked } : row
                          )
                        )
                      }
                    />
                    Activo
                  </label>
                  <input
                    type="time"
                    data-testid={`schedule-start-${h.weekday}`}
                    className="input w-32"
                    value={minToTime(h.startMin)}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((row) =>
                          row.weekday === h.weekday
                            ? { ...row, startMin: timeToMin(e.target.value) }
                            : row
                        )
                      )
                    }
                  />
                  <input
                    type="time"
                    data-testid={`schedule-end-${h.weekday}`}
                    className="input w-32"
                    value={minToTime(h.endMin)}
                    onChange={(e) =>
                      setHours((prev) =>
                        prev.map((row) =>
                          row.weekday === h.weekday
                            ? { ...row, endMin: timeToMin(e.target.value) }
                            : row
                        )
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              data-testid="save-schedule"
              className="btn-primary"
              onClick={saveSchedule}
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar horario"}
            </button>
          </section>

          <section className="card space-y-3">
            <h2 className="font-bold">Días libres</h2>
            <form onSubmit={addTimeOff} data-testid="timeoff-form" className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="timeoff-start">
                  Desde
                </label>
                <input
                  id="timeoff-start"
                  data-testid="timeoff-start"
                  type="date"
                  className="input"
                  value={offStart}
                  onChange={(e) => setOffStart(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="timeoff-end">
                  Hasta
                </label>
                <input
                  id="timeoff-end"
                  data-testid="timeoff-end"
                  type="date"
                  className="input"
                  value={offEnd}
                  onChange={(e) => setOffEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="timeoff-reason">
                  Motivo
                </label>
                <input
                  id="timeoff-reason"
                  data-testid="timeoff-reason"
                  className="input"
                  value={offReason}
                  onChange={(e) => setOffReason(e.target.value)}
                />
              </div>
              <button type="submit" data-testid="timeoff-submit" className="btn-primary" disabled={busy}>
                Agregar día libre
              </button>
            </form>

            <ul className="space-y-1 text-sm" data-testid="timeoff-list">
              {selected.timeOff.length === 0 ? (
                <li className="text-[#6b6157]">Sin días libres registrados.</li>
              ) : (
                selected.timeOff.map((t) => (
                  <li key={t.id} data-testid="timeoff-item" className="flex items-center gap-3">
                    <span>
                      {fmtDate(t.startsAt)} → {fmtDate(t.endsAt)}
                      {t.reason ? ` · ${t.reason}` : ""}
                    </span>
                    <button
                      type="button"
                      data-testid="timeoff-delete"
                      className="badge border border-[#d8cfc0] bg-white"
                      onClick={() => removeTimeOff(t.id)}
                    >
                      Eliminar
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
