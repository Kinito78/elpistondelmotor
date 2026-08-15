import Link from "next/link";
import { getAdminSession } from "@/lib/auth";
import LogoutButton from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/citas", label: "Citas" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/barberos", label: "Barberos" },
  { href: "/admin/fidelidad", label: "Fidelidad" },
  { href: "/admin/reportes", label: "Reportes" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  return (
    <div className="space-y-6">
      {session ? (
        <nav className="flex flex-wrap items-center gap-2 border-b border-[#3A2E20] pb-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-[#2A2119]"
            >
              {item.label}
            </Link>
          ))}
          <span className="ml-auto">
            <LogoutButton />
          </span>
        </nav>
      ) : null}
      {children}
    </div>
  );
}
