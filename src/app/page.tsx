import Link from "next/link";
import { getActiveBranch, prisma } from "@/lib/db";
import { formatDuration, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const branch = await getActiveBranch();
  const services = await prisma.service.findMany({
    where: { branchId: branch.id, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const barbers = await prisma.barber.findMany({
    where: { branchId: branch.id, active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-10">
      <section className="wood-panel rounded-2xl p-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#C9A227]">
          <span className="pole-mark" aria-hidden="true"></span>
          Barbería tradicional
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
          {branch.name}
        </h1>
        <p className="mt-3 max-w-xl text-[#C9BBA4]">
          Corte, barba y afeitado clásico. Reserva en línea en menos de un minuto, sin crear cuenta
          y sin pagar por adelantado: el cobro es en el local.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/reservar" data-testid="cta-reservar" className="btn-primary">
            Reservar cita
          </Link>
          <span className="text-sm text-[#9C8A6F]">{branch.address}</span>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Servicios</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="card" data-testid="landing-service">
              <h3 className="text-lg font-semibold">{service.name}</h3>
              {service.description ? (
                <p className="mt-1 text-sm text-[#9C8A6F]">{service.description}</p>
              ) : null}
              <p className="mt-3 flex items-baseline justify-between">
                <span className="text-sm text-[#9C8A6F]">{formatDuration(service.durationMin)}</span>
                <span className="text-lg font-bold">{formatPrice(service.priceCents)}</span>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Barberos</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {barbers.map((barber) => (
            <article key={barber.id} className="card">
              <h3 className="text-lg font-semibold">{barber.name}</h3>
              <p className="mt-1 text-sm text-[#9C8A6F]">{barber.bio}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">¿Ya tienes una cita?</h2>
        <p className="mt-1 text-sm text-[#9C8A6F]">
          Usa el enlace que recibiste al reservar para consultar, reprogramar o cancelar tu cita.
        </p>
      </section>
    </div>
  );
}
