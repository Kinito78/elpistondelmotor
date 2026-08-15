import Link from "next/link";

export default function FidelidadNotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 text-center" data-testid="not-found">
      <h1 className="text-2xl font-black">No encontramos esa visita</h1>
      <p className="text-sm text-[#9C8A6F]">
        El enlace es inválido. Si crees que es un error, contacta directamente a la barbería.
      </p>
      <Link href="/" className="btn-primary">
        Ir al inicio
      </Link>
    </div>
  );
}
