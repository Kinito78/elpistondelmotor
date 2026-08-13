import { apiOk } from "@/lib/api";
import { computeAvailability } from "@/lib/availability";
import { withApi } from "@/lib/handler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(async () => {
    const { searchParams } = new URL(req.url);
    const result = await computeAvailability({
      barberId: searchParams.get("barberId") ?? "",
      serviceId: searchParams.get("serviceId") ?? "",
      date: searchParams.get("date") ?? "",
    });
    return apiOk(result);
  });
}
