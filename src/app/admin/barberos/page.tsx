import BarbersManager from "@/components/admin/BarbersManager";
import { requireAdminPage } from "@/lib/admin-guard";
import { getActiveBranch, prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminBarberosPage() {
  await requireAdminPage("/admin/barberos");
  const branch = await getActiveBranch();
  const services = await prisma.service.findMany({
    where: { branchId: branch.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Barberos</h1>
      <BarbersManager services={services} timezone={env.BUSINESS_TIMEZONE} />
    </div>
  );
}
