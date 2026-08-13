import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: env.BUSINESS_NAME,
  description: `Reserva tu cita en ${env.BUSINESS_NAME} en menos de un minuto.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="min-h-screen">
        <header className="border-b border-[#e2d9c9] bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-black tracking-tight">
              {env.BUSINESS_NAME}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/reservar" className="font-semibold hover:text-[#b08542]">
                Reservar
              </Link>
              <Link href="/admin" className="text-[#6b6157] hover:text-[#b08542]">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-[#6b6157]">
          {env.BUSINESS_NAME} · Horario: lunes a viernes 9:00–19:00, sábados 10:00–17:00
        </footer>
      </body>
    </html>
  );
}
