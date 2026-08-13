import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { barberUpdateSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const barber = await prisma.barber.findUnique({ where: { id } });
    if (!barber) throw notFound("El barbero no existe");

    const parsed = barberUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del barbero", zodFields(parsed.error));
    }

    const updated = await prisma.barber.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
        ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        ...(parsed.data.ghlUserId !== undefined ? { ghlUserId: parsed.data.ghlUserId } : {}),
      },
    });

    if (parsed.data.serviceIds) {
      await prisma.barberService.deleteMany({ where: { barberId: id } });
      for (const serviceId of parsed.data.serviceIds) {
        await prisma.barberService.create({ data: { barberId: id, serviceId } });
      }
    }

    return apiOk({ barber: updated });
  });
}

/** Soft delete: desactiva, nunca borra si tiene citas. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const barber = await prisma.barber.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!barber) throw notFound("El barbero no existe");

    if (barber._count.appointments > 0) {
      const updated = await prisma.barber.update({ where: { id }, data: { active: false } });
      return apiOk({ barber: updated, deleted: false });
    }
    await prisma.barber.delete({ where: { id } });
    return apiOk({ deleted: true });
  });
}
