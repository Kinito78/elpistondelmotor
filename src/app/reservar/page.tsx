import BookingWizard from "@/components/BookingWizard";
import { env } from "@/lib/env";
import { addDaysToDateString, toLocalDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

export default function ReservarPage() {
  const today = toLocalDateString();
  const maxDate = addDaysToDateString(today, env.BOOKING_HORIZON_DAYS);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Reservar cita</h1>
      <BookingWizard today={today} maxDate={maxDate} />
    </div>
  );
}
