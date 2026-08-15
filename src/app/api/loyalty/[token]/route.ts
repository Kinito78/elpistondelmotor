import { apiOk } from "@/lib/api";
import { withApi } from "@/lib/handler";
import { confirmVisitByToken } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

/** Confirmación pública por WhatsApp: sin login, solo el token del enlace. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withApi(async () => {
    const { token } = await ctx.params;
    const visit = await confirmVisitByToken(token);
    return apiOk({
      visit: { id: visit.id, status: visit.status, confirmedAt: visit.confirmedAt },
    });
  });
}
