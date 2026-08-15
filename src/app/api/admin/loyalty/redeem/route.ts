import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { getLoyaltyStatus, redeemReward } from "@/lib/loyalty";
import { loyaltyRedeemSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const parsed = loyaltyRedeemSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos", zodFields(parsed.error));
    }
    const redemption = await redeemReward(parsed.data.customerId);
    const status = await getLoyaltyStatus(parsed.data.customerId);
    return apiOk({ redemption, status }, 201);
  });
}
