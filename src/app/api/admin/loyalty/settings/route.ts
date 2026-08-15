import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getActiveBranch } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";
import { updateLoyaltySettings } from "@/lib/loyalty";
import { loyaltySettingsSchema, zodFields } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireAdmin();
    const branch = await getActiveBranch();
    return apiOk({
      settings: {
        cutsRequired: branch.loyaltyCutsRequired,
        rewardCents: branch.loyaltyRewardCents,
        windowDays: branch.loyaltyWindowDays,
      },
    });
  });
}

export async function PATCH(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const parsed = loyaltySettingsSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa la configuración", zodFields(parsed.error));
    }
    const branch = await updateLoyaltySettings(parsed.data);
    return apiOk({
      settings: {
        cutsRequired: branch.loyaltyCutsRequired,
        rewardCents: branch.loyaltyRewardCents,
        windowDays: branch.loyaltyWindowDays,
      },
    });
  });
}
