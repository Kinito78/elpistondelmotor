import { apiOk } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { withApi } from "@/lib/handler";
import { salesReport } from "@/lib/reports";
import { addDaysToDateString, isValidDateString, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const today = toLocalDateString();
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const from = isValidDateString(fromParam) ? fromParam : addDaysToDateString(today, -29);
    const to = isValidDateString(toParam) ? toParam : today;
    return apiOk(await salesReport(from, to));
  });
}
