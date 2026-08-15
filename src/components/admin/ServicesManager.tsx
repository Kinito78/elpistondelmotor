"use client";

import { useCallback, useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  active: boolean;
  appointmentCount: number;
};

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

export default function ServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [priceMxn, setPriceMxn] = useState("250");
  const [active, setActive] = useState(true);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [editPrice, setEditPrice] = useState("0");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/services");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setServices(data.services ?? []);
    else setError(data?.message ?? "No se pudieron cargar los servicios");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          durationMin: Number(durationMin),
          priceCents: Math.round(Number(priceMxn.replace(",", ".")) * 100),
          active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.fields
            ? Object.values(data.fields as Record<string, string>)[0]
            : (data?.message ?? "No se pudo crear el servicio")
        );
        return;
      }
      setName("");
      setPriceMxn("250");
      setDurationMin(30);
      setActive(true);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.message ?? "No se pudo actualizar el servicio");
    }
    await load();
  }

  function startEdit(service: Service) {
    setEditing(service.id);
    setEditName(service.name);
    setEditDuration(service.durationMin);
    setEditPrice((service.priceCents / 100).toString());
  }

  async function saveEdit(id: string) {
    await patch(id, {
      name: editName.trim(),
      durationMin: Number(editDuration),
      priceCents: Math.round(Number(editPrice.replace(",", ".")) * 100),
    });
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p data-testid="admin-error" role="alert" className="rounded-lg border border-[#6B2A24] bg-[#2E1613] px-3 py-2 text-sm text-[#E2897E]">
          {error}
        </p>
      ) : null}

      <form onSubmit={create} data-testid="service-form" className="card grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="service-name">
            Nombre
          </label>
          <input
            id="service-name"
            data-testid="service-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="service-duration">
            Duración (min)
          </label>
          <select
            id="service-duration"
            data-testid="service-duration"
            className="input"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="service-price">
            Precio (MXN)
          </label>
          <input
            id="service-price"
            data-testid="service-price"
            className="input"
            inputMode="decimal"
            value={priceMxn}
            onChange={(e) => setPriceMxn(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="service-active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Activo
          </label>
        </div>
        <div className="sm:col-span-5">
          <button type="submit" data-testid="service-submit" className="btn-primary" disabled={busy}>
            {busy ? "Guardando…" : "Agregar servicio"}
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table data-testid="services-table" className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Duración</th>
              <th>Precio</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} data-testid="service-row" data-service-id={s.id}>
                {editing === s.id ? (
                  <>
                    <td>
                      <input
                        className="input"
                        data-testid="edit-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        data-testid="edit-duration"
                        value={editDuration}
                        onChange={(e) => setEditDuration(Number(e.target.value))}
                      >
                        {DURATIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        data-testid="edit-price"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                      />
                    </td>
                    <td>{s.active ? "Activo" : "Inactivo"}</td>
                    <td className="flex gap-2">
                      <button
                        type="button"
                        data-testid="save-service"
                        className="btn-primary"
                        onClick={() => saveEdit(s.id)}
                      >
                        Guardar
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td data-testid="service-row-name">{s.name}</td>
                    <td>{s.durationMin} min</td>
                    <td>
                      $
                      {(s.priceCents / 100).toLocaleString("es-MX", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td data-testid="service-row-status">{s.active ? "Activo" : "Inactivo"}</td>
                    <td className="whitespace-nowrap">
                      <span className="flex gap-2">
                        <button
                          type="button"
                          data-testid="edit-service"
                          className="btn-secondary"
                          onClick={() => startEdit(s)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          data-testid="toggle-service-active"
                          className="btn-secondary"
                          onClick={() => patch(s.id, { active: !s.active })}
                        >
                          {s.active ? "Desactivar" : "Activar"}
                        </button>
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
