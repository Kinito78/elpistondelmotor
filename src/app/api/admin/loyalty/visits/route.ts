import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { getLoyaltyStatus, registerManualVisit } from "@/lib/loyalty";
import { loyaltyManualVisitSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Alta manual de una visita (corte pagado fuera de la app). */
export async function POST(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const parsed = loyaltyManualVisitSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del cliente", zodFields(parsed.error));
    }
    const customer = await registerManualVisit(parsed.data);
    const status = await getLoyaltyStatus(customer.id);
    return apiOk(
      { customer: { id: customer.id, name: customer.name, phone: customer.phone }, status },
      201
    );
  });
}
