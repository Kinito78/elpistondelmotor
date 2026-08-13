import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { rescheduleBooking, setAppointmentStatus, syncAppointmentToGhl } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { adminAppointment } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const include = { barber: true, service: true, customer: true } as const;

type Body = {
  status?: string;
  paymentStatus?: string;
  action?: string;
  startsAt?: string;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const appointment = await prisma.appointment.findUnique({ where: { id }, include });
    if (!appointment) throw notFound("La cita no existe");
    return apiOk({ appointment: adminAppointment(appointment) });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const appointment = await prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw notFound("La cita no existe");

    const body = ((await readJson(req)) ?? {}) as Body;

    if (body.action === "resync") {
      await syncAppointmentToGhl(appointment.id);
    } else if (body.action === "reschedule") {
      if (!body.startsAt) {
        throw new HttpError(422, "VALIDATION_ERROR", "Falta startsAt", {
          startsAt: "Horario requerido",
        });
      }
      await rescheduleBooking(appointment, body.startsAt, { ignoreLead: true });
    } else {
      if (body.status) await setAppointmentStatus(appointment, body.status);
      if (body.paymentStatus) {
        if (!["unpaid", "paid_onsite"].includes(body.paymentStatus)) {
          throw new HttpError(422, "VALIDATION_ERROR", "Estado de pago inválido", {
            paymentStatus: "Estado de pago inválido",
          });
        }
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { paymentStatus: body.paymentStatus },
        });
      }
      if (!body.status && !body.paymentStatus) {
        throw new HttpError(422, "VALIDATION_ERROR", "Nada que actualizar");
      }
    }

    const updated = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include,
    });
    return apiOk({ appointment: adminAppointment(updated) });
  });
}
