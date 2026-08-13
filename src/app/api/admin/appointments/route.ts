import { apiOk, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { createBooking } from "@/lib/booking";
import { getActiveBranch, prisma } from "@/lib/db";
import { withApi } from "@/lib/handler";
import { adminAppointment } from "@/lib/serialize";
import { endOfLocalDayUtc, isValidDateString, startOfLocalDayUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

const include = { barber: true, service: true, customer: true } as const;

export async function GET(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const branch = await getActiveBranch();

    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const barberId = searchParams.get("barberId");
    const status = searchParams.get("status");

    let gte: Date | undefined;
    let lt: Date | undefined;
    if (isValidDateString(date)) {
      gte = startOfLocalDayUtc(date);
      lt = endOfLocalDayUtc(date);
    } else {
      if (isValidDateString(from)) gte = startOfLocalDayUtc(from);
      if (isValidDateString(to)) lt = endOfLocalDayUtc(to);
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        branchId: branch.id,
        ...(gte || lt ? { startsAt: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
        ...(barberId && barberId !== "all" ? { barberId } : {}),
        ...(status && status !== "all" ? { status } : {}),
      },
      include,
      orderBy: { startsAt: "asc" },
    });

    return apiOk({ appointments: appointments.map(adminAppointment) });
  });
}

/** Alta walk-in desde el mostrador. */
export async function POST(req: Request) {
  return withApi(async () => {
    await requireAdmin();
    const created = await createBooking({
      payload: await readJson(req),
      source: "admin",
      ignoreLead: true,
    });
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
      include,
    });
    return apiOk({ appointment: adminAppointment(appointment) }, 201);
  });
}
