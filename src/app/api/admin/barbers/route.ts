import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getActiveBranch, prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { barberSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireAdmin();
    const branch = await getActiveBranch();
    const barbers = await prisma.barber.findMany({
      where: { branchId: branch.id },
      include: { services: true, workingHours: true, timeOff: { orderBy: { startsAt: "asc" } } },
      orderBy: { name: "asc" },
    });
    return apiOk({
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        bio: b.bio,
        photoUrl: b.photoUrl,
        active: b.active,
        ghlUserId: b.ghlUserId,
        serviceIds: b.services.map((s) => s.serviceId),
        workingHours: b.workingHours,
        timeOff: b.timeOff.map((t) => ({
          id: t.id,
          startsAt: t.startsAt.toISOString(),
          endsAt: t.endsAt.toISOString(),
          reason: t.reason,
        })),
      })),
    });
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const branch = await getActiveBranch();
    const parsed = barberSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del barbero", zodFields(parsed.error));
    }

    const barber = await prisma.barber.create({
      data: {
        branchId: branch.id,
        name: parsed.data.name,
        bio: parsed.data.bio ?? null,
        photoUrl: parsed.data.photoUrl ?? null,
        active: parsed.data.active ?? true,
        ghlUserId: parsed.data.ghlUserId ?? null,
      },
    });

    for (const serviceId of parsed.data.serviceIds ?? []) {
      await prisma.barberService.create({ data: { barberId: barber.id, serviceId } });
    }

    // Horario por defecto: lun–vie 09:00–19:00, sábado 10:00–17:00, domingo inactivo.
    for (let weekday = 0; weekday <= 6; weekday++) {
      await prisma.workingHour.create({
        data: {
          barberId: barber.id,
          weekday,
          startMin: weekday === 6 ? 600 : 540,
          endMin: weekday === 6 ? 1020 : 1140,
          active: weekday !== 0,
        },
      });
    }

    return apiOk({ barber }, 201);
  });
}
