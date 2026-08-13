import { apiOk } from "@/lib/api";
import { getActiveBranch, prisma } from "@/lib/db";
import { withApi } from "@/lib/handler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(async () => {
    const { searchParams } = new URL(req.url);
    const barberId = searchParams.get("barberId");
    const branch = await getActiveBranch();

    const services = await prisma.service.findMany({
      where: {
        branchId: branch.id,
        active: true,
        ...(barberId && barberId !== "any" ? { barbers: { some: { barberId } } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return apiOk({
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        active: s.active,
      })),
    });
  });
}
