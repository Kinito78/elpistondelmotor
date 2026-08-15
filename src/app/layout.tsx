import type { Metadata } from "next";
import Link from "next/link";
import { getActiveBranch } from "@/lib/db";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branch = await getActiveBranch();
  return {
    title: branch.name,
    description: `Reserva tu cita en ${branch.name} en menos de un minuto.`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branch = await getActiveBranch();

  return (
    <html lang="es-MX">
      <body className="min-h-screen">
        <header className="border-b border-[#3A2E20] bg-[#211B15]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="brand-mark">
              <span className="pole-mark" aria-hidden="true"></span>
              {branch.name}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/reservar" className="font-semibold hover:text-[#C9A227]">
                Reservar
              </Link>
              <Link href="/admin" className="text-[#9C8A6F] hover:text-[#C9A227]">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-[#9C8A6F]">
          {branch.name} · Horario: lunes a viernes 9:00–19:00, sábados 10:00–17:00
        </footer>
      </body>
    </html>
  );
}
