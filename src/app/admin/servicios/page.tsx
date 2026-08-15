import ServicesManager from "@/components/admin/ServicesManager";
import { requireAdminPage } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function AdminServiciosPage() {
  await requireAdminPage("/admin/servicios");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Servicios</h1>
      <p className="text-sm text-[#9C8A6F]">
        Los servicios desactivados dejan de ofrecerse en el sitio público. Nunca se borran si tienen
        citas históricas.
      </p>
      <ServicesManager />
    </div>
  );
}
