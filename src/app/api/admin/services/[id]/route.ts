import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, notFound } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { serviceUpdateSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) throw notFound("El servicio no existe");

    const parsed = serviceUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del servicio", zodFields(parsed.error));
    }

    const updated = await prisma.service.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.durationMin !== undefined ? { durationMin: parsed.data.durationMin } : {}),
        ...(parsed.data.priceCents !== undefined ? { priceCents: parsed.data.priceCents } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      },
    });
    return apiOk({ service: updated });
  });
}

/** Soft delete: nunca se borra físicamente si tiene citas. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const service = await prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!service) throw notFound("El servicio no existe");

    if (service._count.appointments > 0) {
      const updated = await prisma.service.update({ where: { id }, data: { active: false } });
      return apiOk({ service: updated, deleted: false });
    }

    await prisma.barberService.deleteMany({ where: { serviceId: id } });
    await prisma.service.delete({ where: { id } });
    return apiOk({ deleted: true });
  });
}
