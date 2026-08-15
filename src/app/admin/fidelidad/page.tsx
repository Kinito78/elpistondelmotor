import LoyaltyManager from "@/components/admin/LoyaltyManager";
import { requireAdminPage } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function AdminFidelidadPage() {
  await requireAdminPage("/admin/fidelidad");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Fidelidad</h1>
      <p className="text-sm text-[#9C8A6F]">
        Cada corte completado en la app suma automático. Para clientes que pagan en efectivo sin
        reservar, regístralo aquí a mano.
      </p>
      <LoyaltyManager />
    </div>
  );
}
