"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { start: string; end: string; label: string; barberId: string };

export default function AppointmentActions({
  token,
  serviceId,
  barberId,
  today,
  maxDate,
  currentDate,
}: {
  token: string;
  serviceId: string;
  barberId: string;
  today: string;
  maxDate: string;
  currentDate: string;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">("idle");
  const [date, setDate] = useState(currentDate < today ? today : currentDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSlots([]);
    try {
      const res = await fetch(
        `/api/availability?barberId=${encodeURIComponent(barberId)}&serviceId=${encodeURIComponent(
          serviceId
        )}&date=${encodeURIComponent(date)}`
      );
      const data = await res.json();
      setSlots(res.ok ? (data.slots ?? []) : []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [barberId, serviceId, date]);

  useEffect(() => {
    if (mode === "reschedule") void loadSlots();
  }, [mode, loadSlots]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo completar la acción");
        if (res.status === 409 && body.action === "reschedule") void loadSlots();
        return false;
      }
      setMode("idle");
      setSelected(null);
      router.refresh();
      return true;
    } catch {
      setError("No se pudo conectar con el servidor");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          data-testid="action-error"
          role="alert"
          className="rounded-lg border border-[#e5b5b0] bg-[#fdecea] px-3 py-2 text-sm font-medium text-[#8a231b]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="reschedule-button"
          className="btn-secondary"
          onClick={() => {
            setMode(mode === "reschedule" ? "idle" : "reschedule");
            setError(null);
          }}
        >
          Reprogramar
        </button>
        <button
          type="button"
          data-testid="cancel-button"
          className="btn-danger"
          onClick={() => {
            setMode("cancel");
            setError(null);
          }}
        >
          Cancelar cita
        </button>
      </div>

      {mode === "reschedule" ? (
        <section data-testid="reschedule-panel" className="card space-y-3">
          <h3 className="font-bold">Elige un nuevo horario</h3>
          <div>
            <label className="label" htmlFor="date-input">
              Fecha
            </label>
            <input
              id="date-input"
              data-testid="date-input"
              type="date"
              className="input max-w-xs"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => {
                setDate(e.target.value);
                setSelected(null);
              }}
            />
          </div>

          {loadingSlots ? (
            <p data-testid="slots-loading" className="text-sm text-[#6b6157]">
              Buscando horarios disponibles…
            </p>
          ) : slots.length === 0 ? (
            <p data-testid="no-slots" className="text-sm">
              No hay horarios disponibles para este día
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  data-testid="slot-button"
                  data-start={s.start}
                  onClick={() => setSelected(s)}
                  className={
                    selected?.start === s.start
                      ? "btn bg-[#b08542] text-white"
                      : "btn-secondary"
                  }
                  aria-pressed={selected?.start === s.start}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            data-testid="confirm-reschedule"
            className="btn-primary"
            disabled={!selected || busy}
            onClick={() => selected && patch({ action: "reschedule", startsAt: selected.start })}
          >
            {busy ? "Guardando…" : "Confirmar nuevo horario"}
          </button>
        </section>
      ) : null}

      {mode === "cancel" ? (
        <section data-testid="cancel-modal" className="card space-y-3 border-[#e5b5b0]">
          <h3 className="font-bold">¿Seguro que quieres cancelar tu cita?</h3>
          <p className="text-sm text-[#6b6157]">
            Esta acción libera tu horario y no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-cancel"
              className="btn-danger"
              disabled={busy}
              onClick={() => patch({ action: "cancel" })}
            >
              {busy ? "Cancelando…" : "Sí, cancelar cita"}
            </button>
            <button
              type="button"
              data-testid="dismiss-cancel"
              className="btn-secondary"
              onClick={() => setMode("idle")}
            >
              No, mantener cita
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
