"use client";

import { useCallback, useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
};

type Barber = { id: string; name: string; bio: string | null; serviceIds: string[] };

type Slot = { start: string; end: string; label: string; barberId: string };

const ANY = "any";

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

function digitCount(value: string) {
  return value.replace(/\D/g, "").length;
}

export default function BookingWizard({
  today,
  maxDate,
}: {
  today: string;
  maxDate: string;
}) {

  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [service, setService] = useState<Service | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [barberName, setBarberName] = useState<string>("");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .catch(() => setServices([]));
  }, []);

  useEffect(() => {
    if (!service) return;
    fetch(`/api/barbers?serviceId=${encodeURIComponent(service.id)}`)
      .then((r) => r.json())
      .then((d) => setBarbers(d.barbers ?? []))
      .catch(() => setBarbers([]));
  }, [service]);

  const loadSlots = useCallback(async () => {
    if (!service || !barberId || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    try {
      const res = await fetch(
        `/api/availability?barberId=${encodeURIComponent(barberId)}&serviceId=${encodeURIComponent(
          service.id
        )}&date=${encodeURIComponent(date)}`
      );
      const data = await res.json();
      setSlots(res.ok ? (data.slots ?? []) : []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [service, barberId, date]);

  useEffect(() => {
    if (step === 3) void loadSlots();
  }, [step, loadSlots]);

  function chooseService(next: Service) {
    setService(next);
    setBarberId(null);
    setSlot(null);
    setErrors([]);
    setStep(2);
  }

  function chooseBarber(id: string, label: string) {
    setBarberId(id);
    setBarberName(label);
    setSlot(null);
    setErrors([]);
    setStep(3);
  }

  function chooseSlot(next: Slot) {
    setSlot(next);
    setErrors([]);
    setStep(4);
  }

  function validate(): string[] {
    const found: string[] = [];
    if (name.trim().length === 0) found.push("El nombre es obligatorio");
    else if (name.trim().length < 2) found.push("El nombre debe tener al menos 2 caracteres");
    if (digitCount(phone) < 10) found.push("Teléfono inválido");
    if (email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      found.push("Email inválido");
    if (notes.length > 300) found.push("Las notas no pueden exceder 300 caracteres");
    return found;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors = validate();
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }
    if (!service || !barberId || !slot) {
      setErrors(["Selecciona servicio, barbero y horario"]);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: slot.barberId || barberId,
          serviceId: service.id,
          startsAt: slot.start,
          customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data?.appointment?.manageToken) {
        // Navegación dura a propósito: la confirmación debe cargar siempre, sin
        // depender de que la transición del router del cliente se complete.
        window.location.assign(`/cita/${data.appointment.manageToken}?nuevo=1`);
        return;
      }

      if (res.status === 409) {
        setErrors(["Ese horario ya fue reservado, elige otro"]);
        setSlot(null);
        setStep(3);
        void loadSlots();
        return;
      }

      if (data?.fields) {
        const messages = Object.entries(data.fields as Record<string, string>)
          .filter(([key]) => !key.includes("."))
          .map(([, message]) => message);
        setErrors(messages.length > 0 ? [...new Set(messages)] : [data.message ?? "Revisa los datos"]);
        return;
      }

      setErrors([data?.message ?? "No se pudo crear la cita"]);
    } catch {
      setErrors(["No se pudo conectar con el servidor"]);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ["Servicio", "Barbero", "Fecha y hora", "Tus datos"];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <ol className="flex flex-wrap gap-2 text-xs font-semibold">
          {steps.map((label, index) => {
            const n = index + 1;
            const state = n === step ? "bg-[#14110f] text-white" : n < step ? "bg-[#e5dccb]" : "bg-white";
            return (
              <li
                key={label}
                className={`rounded-full border border-[#e2d9c9] px-3 py-1 ${state}`}
                data-testid={`wizard-step-${n}`}
                data-active={n === step ? "true" : "false"}
              >
                {n}. {label}
              </li>
            );
          })}
        </ol>

        {errors.length > 0 ? (
          <div className="space-y-2">
            {errors.map((message, i) => (
              <p
                key={`${message}-${i}`}
                data-testid="form-error"
                role="alert"
                className="rounded-lg border border-[#e5b5b0] bg-[#fdecea] px-3 py-2 text-sm font-medium text-[#8a231b]"
              >
                {message}
              </p>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">1. Elige tu servicio</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-testid="service-card"
                  data-service-id={s.id}
                  onClick={() => chooseService(s)}
                  className="card text-left hover:border-[#b08542]"
                >
                  <span className="block text-base font-semibold">{s.name}</span>
                  {s.description ? (
                    <span className="mt-1 block text-sm text-[#6b6157]">{s.description}</span>
                  ) : null}
                  <span className="mt-3 flex items-baseline justify-between">
                    <span className="text-sm text-[#6b6157]">{s.durationMin} min</span>
                    <span className="font-bold">{formatPrice(s.priceCents)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">2. Elige tu barbero</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                data-testid="barber-any"
                data-barber-id={ANY}
                onClick={() => chooseBarber(ANY, "Cualquier barbero disponible")}
                className="card text-left hover:border-[#b08542]"
              >
                <span className="block text-base font-semibold">Cualquier barbero disponible</span>
                <span className="mt-1 block text-sm text-[#6b6157]">
                  Te asignamos al barbero con mayor disponibilidad.
                </span>
              </button>
              {barbers.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  data-testid="barber-card"
                  data-barber-id={b.id}
                  onClick={() => chooseBarber(b.id, b.name)}
                  className="card text-left hover:border-[#b08542]"
                >
                  <span className="block text-base font-semibold">{b.name}</span>
                  {b.bio ? <span className="mt-1 block text-sm text-[#6b6157]">{b.bio}</span> : null}
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-4" onClick={() => setStep(1)}>
              Volver
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">3. Elige fecha y hora</h2>
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
                setSlot(null);
              }}
            />

            <div className="mt-4">
              {loadingSlots ? (
                <p data-testid="slots-loading" className="text-sm text-[#6b6157]">
                  Buscando horarios disponibles…
                </p>
              ) : slots.length === 0 ? (
                <p
                  data-testid="no-slots"
                  className="rounded-lg border border-[#e2d9c9] bg-white px-3 py-2 text-sm"
                >
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
                      data-barber-id={s.barberId}
                      onClick={() => chooseSlot(s)}
                      className="btn-secondary"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="btn-secondary mt-4" onClick={() => setStep(2)}>
              Volver
            </button>
          </section>
        ) : null}

        {step === 4 ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">4. Tus datos</h2>
            <form onSubmit={submit} noValidate className="max-w-md space-y-3">
              <div>
                <label className="label" htmlFor="input-name">
                  Nombre completo *
                </label>
                <input
                  id="input-name"
                  data-testid="input-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="label" htmlFor="input-phone">
                  Teléfono (WhatsApp) *
                </label>
                <input
                  id="input-phone"
                  data-testid="input-phone"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                />
              </div>
              <div>
                <label className="label" htmlFor="input-email">
                  Email (opcional)
                </label>
                <input
                  id="input-email"
                  data-testid="input-email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="input-notes">
                  Notas (opcional)
                </label>
                <textarea
                  id="input-notes"
                  data-testid="input-notes"
                  className="input"
                  rows={3}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setStep(3)}>
                  Volver
                </button>
                <button
                  type="submit"
                  data-testid="submit-booking"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Reservando…" : "Confirmar reserva"}
                </button>
              </div>
              <p className="text-xs text-[#6b6157]">
                No se cobra nada en línea. El pago es en el local.
              </p>
            </form>
          </section>
        ) : null}
      </div>

      <aside className="card h-fit" data-testid="booking-summary">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#6b6157]">Tu reserva</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[#6b6157]">Servicio</dt>
            <dd data-testid="summary-service" className="font-semibold">
              {service ? `${service.name} · ${formatPrice(service.priceCents)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[#6b6157]">Barbero</dt>
            <dd data-testid="summary-barber" className="font-semibold">
              {barberId ? barberName : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[#6b6157]">Fecha y hora</dt>
            <dd data-testid="summary-slot" className="font-semibold">
              {slot ? `${date} ${slot.label}` : "—"}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
