import Link from "next/link";

export default function CitaNotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 text-center" data-testid="not-found">
      <h1 className="text-2xl font-black">No encontramos esa cita</h1>
      <p className="text-sm text-[#9C8A6F]">
        El enlace es inválido o la cita ya no existe. Revisa el enlace que recibiste al reservar.
      </p>
      <Link href="/reservar" className="btn-primary">
        Reservar una cita
      </Link>
    </div>
  );
}
