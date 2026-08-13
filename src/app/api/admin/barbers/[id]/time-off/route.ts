import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { timeOffSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const barber = await prisma.barber.findUnique({ where: { id } });
    if (!barber) throw notFound("El barbero no existe");

    const parsed = timeOffSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Rango inválido", zodFields(parsed.error));
    }

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (endsAt <= startsAt) {
      throw new HttpError(422, "VALIDATION_ERROR", "La fecha final debe ser posterior a la inicial", {
        endsAt: "La fecha final debe ser posterior a la inicial",
      });
    }

    const timeOff = await prisma.timeOff.create({
      data: { barberId: id, startsAt, endsAt, reason: parsed.data.reason ?? null },
    });
    return apiOk({ timeOff }, 201);
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const timeOffId = searchParams.get("timeOffId");
    if (!timeOffId) throw new HttpError(422, "VALIDATION_ERROR", "Falta timeOffId");

    await prisma.timeOff.deleteMany({ where: { id: timeOffId, barberId: id } });
    return apiOk({ ok: true });
  });
}
