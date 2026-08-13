import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { scheduleSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const barber = await prisma.barber.findUnique({ where: { id } });
    if (!barber) throw notFound("El barbero no existe");

    const parsed = scheduleSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Horario inválido", zodFields(parsed.error));
    }

    for (const hour of parsed.data.hours) {
      if (hour.active && hour.endMin <= hour.startMin) {
        throw new HttpError(422, "VALIDATION_ERROR", "La hora de fin debe ser mayor a la de inicio", {
          [`weekday_${hour.weekday}`]: "La hora de fin debe ser mayor a la de inicio",
        });
      }
      await prisma.workingHour.upsert({
        where: { barberId_weekday: { barberId: id, weekday: hour.weekday } },
        update: { startMin: hour.startMin, endMin: hour.endMin, active: hour.active },
        create: {
          barberId: id,
          weekday: hour.weekday,
          startMin: hour.startMin,
          endMin: hour.endMin,
          active: hour.active,
        },
      });
    }

    const workingHours = await prisma.workingHour.findMany({
      where: { barberId: id },
      orderBy: { weekday: "asc" },
    });
    return apiOk({ workingHours });
  });
}
