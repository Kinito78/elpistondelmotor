import { apiOk } from "@/lib/api";
import { getActiveBranch, prisma } from "@/lib/db";
import { withApi } from "@/lib/handler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(async () => {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    const branch = await getActiveBranch();

    const barbers = await prisma.barber.findMany({
      where: {
        branchId: branch.id,
        active: true,
        ...(serviceId ? { services: { some: { serviceId } } } : {}),
      },
      include: { services: true },
      orderBy: { name: "asc" },
    });

    return apiOk({
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        bio: b.bio,
        photoUrl: b.photoUrl,
        serviceIds: b.services.map((s) => s.serviceId),
      })),
    });
  });
}
