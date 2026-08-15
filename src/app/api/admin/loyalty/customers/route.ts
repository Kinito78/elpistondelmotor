import { apiOk } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";
import { withApi } from "@/lib/handler";
import { getLoyaltyStatus } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

/** Busca un cliente por teléfono y devuelve su estado de fidelidad. */
export async function GET(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const phoneParam = searchParams.get("phone");
    if (!phoneParam || phoneParam.trim() === "") {
      throw new HttpError(400, "INVALID_PARAMS", "Indica un teléfono para buscar");
    }
    const phone = normalizePhone(phoneParam, env.DEFAULT_COUNTRY_CODE);
    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer) return apiOk({ customer: null });

    const status = await getLoyaltyStatus(customer.id);
    return apiOk({
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      status,
    });
  });
}
