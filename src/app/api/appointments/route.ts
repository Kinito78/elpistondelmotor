import { apiOk, readJson } from "@/lib/api";
import { createBooking } from "@/lib/booking";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/handler";
import { publicAppointment } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJson(req);
    const created = await createBooking({ payload: body, source: "web" });
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
      include: { barber: true, service: true, customer: true },
    });
    return apiOk({ appointment: publicAppointment(appointment) }, 201);
  });
}
