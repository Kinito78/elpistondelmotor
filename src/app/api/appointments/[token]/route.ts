import { apiOk, readJson } from "@/lib/api";
import { cancelBooking, rescheduleBooking } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { publicAppointment } from "@/lib/serialize";
import { patchAppointmentSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

const include = { barber: true, service: true, customer: true } as const;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withApi(async () => {
    const { token } = await ctx.params;
    const appointment = await prisma.appointment.findUnique({
      where: { manageToken: token },
      include,
    });
    if (!appointment) throw notFound("No encontramos esa cita");
    return apiOk({ appointment: publicAppointment(appointment) });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withApi(async () => {
    const { token } = await ctx.params;
    const appointment = await prisma.appointment.findUnique({ where: { manageToken: token } });
    if (!appointment) throw notFound("No encontramos esa cita");

    const parsed = patchAppointmentSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Acción inválida", zodFields(parsed.error));
    }

    if (parsed.data.action === "cancel") {
      await cancelBooking(appointment);
    } else {
      await rescheduleBooking(appointment, parsed.data.startsAt);
    }

    const updated = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include,
    });
    return apiOk({ appointment: publicAppointment(updated) });
  });
}
