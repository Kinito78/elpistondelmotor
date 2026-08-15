import { notFound } from "next/navigation";
import ConfirmVisitButton from "@/components/ConfirmVisitButton";
import { prisma } from "@/lib/db";
import { labelLong } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function FidelidadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const visit = await prisma.loyaltyVisit.findUnique({
    where: { confirmToken: token },
    include: { customer: true, branch: true },
  });

  if (!visit) notFound();

  const isExpired = visit.status === "expired" || (visit.status === "pending" && visit.expiresAt.getTime() < Date.now());

  return (
    <div className="mx-auto max-w-lg space-y-4 text-center" data-testid="loyalty-visit">
      <h1 className="text-2xl font-black tracking-tight">Confirma tu corte</h1>
      <p className="text-sm text-[#9C8A6F]">
        {visit.customer.name} · {visit.branch.name}
      </p>

      <section className="card space-y-3 text-left">
        {visit.status === "confirmed" ? (
          <p data-testid="loyalty-confirmed" className="text-center text-sm font-semibold">
            ¡Gracias! Ya confirmaste esta visita — suma a tu tarjeta de fidelidad.
          </p>
        ) : isExpired ? (
          <p data-testid="loyalty-expired" className="text-center text-sm font-semibold text-[#E2897E]">
            El plazo para confirmar este corte ya venció. La próxima vez, confirma apenas
            recibas el mensaje por WhatsApp.
          </p>
        ) : (
          <>
            <p className="text-center text-sm">
              Registramos tu visita del {labelLong(visit.createdAt)}. Confirma que fue real para
              que sume a tu tarjeta de fidelidad.
            </p>
            <ConfirmVisitButton token={token} />
          </>
        )}
      </section>
    </div>
  );
}
