import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getActiveBranch, prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { serviceSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireAdmin();
    const branch = await getActiveBranch();
    const services = await prisma.service.findMany({
      where: { branchId: branch.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { appointments: true } } },
    });
    return apiOk({
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        active: s.active,
        sortOrder: s.sortOrder,
        appointmentCount: s._count.appointments,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const branch = await getActiveBranch();
    const parsed = serviceSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del servicio", zodFields(parsed.error));
    }
    const count = await prisma.service.count({ where: { branchId: branch.id } });
    const service = await prisma.service.create({
      data: {
        branchId: branch.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        durationMin: parsed.data.durationMin,
        priceCents: parsed.data.priceCents,
        active: parsed.data.active ?? true,
        sortOrder: parsed.data.sortOrder ?? count,
      },
    });

    // Un servicio nuevo lo ofrecen por defecto todos los barberos activos,
    // para que aparezca de inmediato en el flujo de reserva.
    const barbers = await prisma.barber.findMany({
      where: { branchId: branch.id, active: true },
      select: { id: true },
    });
    for (const barber of barbers) {
      await prisma.barberService.create({
        data: { barberId: barber.id, serviceId: service.id },
      });
    }

    return apiOk({ service }, 201);
  });
}
