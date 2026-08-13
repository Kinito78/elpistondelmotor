import AppointmentsManager from "@/components/admin/AppointmentsManager";
import { requireAdminPage } from "@/lib/admin-guard";
import { getActiveBranch, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { addDaysToDateString, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminCitasPage() {
  await requireAdminPage("/admin/citas");
  const branch = await getActiveBranch();
  const barbers = await prisma.barber.findMany({
    where: { branchId: branch.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const today = toLocalDateString();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Citas</h1>
      <AppointmentsManager
        barbers={barbers}
        defaultFrom={addDaysToDateString(today, -30)}
        defaultTo={addDaysToDateString(today, env.BOOKING_HORIZON_DAYS)}
        timezone={env.BUSINESS_TIMEZONE}
      />
    </div>
  );
}
