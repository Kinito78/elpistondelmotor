import { notFound } from "next/navigation";
import AppointmentActions from "@/components/AppointmentActions";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDuration, formatPrice, maskPhone, statusLabel } from "@/lib/format";
import { addDaysToDateString, labelLong, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  confirmed: "bg-[#e4f0e2] text-[#2f6b28]",
  cancelled: "bg-[#fdecea] text-[#8a231b]",
  completed: "bg-[#e6ecf7] text-[#28497f]",
  no_show: "bg-[#f6ecd9] text-[#7a5a15]",
};

export default async function CitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { token } = await params;
  const { nuevo } = await searchParams;

  const appointment = await prisma.appointment.findUnique({
    where: { manageToken: token },
    include: { barber: true, service: true, customer: true },
  });

  if (!appointment) notFound();

  const today = toLocalDateString();
  const maxDate = addDaysToDateString(today, env.BOOKING_HORIZON_DAYS);
  const currentDate = toLocalDateString(appointment.startsAt);
  const leadMs = env.MIN_LEAD_MINUTES * 60_000;
  const canModify =
    appointment.status === "confirmed" && appointment.startsAt.getTime() - Date.now() >= leadMs;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {nuevo === "1" ? (
        <p
          data-testid="booking-success"
          className="rounded-lg border border-[#bcd9b6] bg-[#e4f0e2] px-4 py-3 text-sm font-semibold text-[#2f6b28]"
        >
          ¡Listo! Tu cita quedó confirmada. Guarda este enlace para gestionarla.
        </p>
      ) : null}

      <section data-testid="appointment-detail" className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{appointment.service.name}</h1>
            <p className="text-sm text-[#6b6157]">
              {formatDuration(appointment.service.durationMin)} · con {appointment.barber.name}
            </p>
          </div>
          <span
            data-testid="appointment-status"
            className={`badge ${STATUS_CLASS[appointment.status] ?? "bg-[#eee]"}`}
          >
            {statusLabel(appointment.status)}
          </span>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6b6157]">Fecha y hora</dt>
            <dd data-testid="appointment-datetime" className="font-semibold">
              {labelLong(appointment.startsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6b6157]">Barbero</dt>
            <dd data-testid="appointment-barber" className="font-semibold">
              {appointment.barber.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6b6157]">Precio</dt>
            <dd data-testid="appointment-price" className="font-semibold">
              {formatPrice(appointment.priceCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[#6b6157]">Cliente</dt>
            <dd data-testid="appointment-customer" className="font-semibold">
              {appointment.customer.name} · {maskPhone(appointment.customer.phone)}
            </dd>
          </div>
        </dl>

        {appointment.notes ? (
          <p className="rounded-lg bg-[#f2ece2] px-3 py-2 text-sm">{appointment.notes}</p>
        ) : null}

        <p className="text-xs text-[#6b6157]">
          El pago es en el local. Puedes cancelar o reprogramar hasta {env.MIN_LEAD_MINUTES} minutos
          antes de tu cita.
        </p>
      </section>

      {canModify ? (
        <AppointmentActions
          token={appointment.manageToken}
          serviceId={appointment.serviceId}
          barberId={appointment.barberId}
          today={today}
          maxDate={maxDate}
          currentDate={currentDate}
        />
      ) : (
        <p data-testid="actions-disabled" className="text-sm text-[#6b6157]">
          {appointment.status === "confirmed"
            ? "Ya no es posible modificar esta cita en línea. Llámanos si necesitas un cambio."
            : "Esta cita ya no admite cambios."}
        </p>
      )}
    </div>
  );
}
