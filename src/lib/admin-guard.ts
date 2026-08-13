import { redirect } from "next/navigation";
import { getAdminSession } from "./auth";

/** Guarda de páginas `/admin/*`: sin sesión válida → 307 a /admin/login. */
export async function requireAdminPage(nextPath?: string) {
  const session = await getAdminSession();
  if (!session) {
    redirect(nextPath ? `/admin/login?next=${encodeURIComponent(nextPath)}` : "/admin/login");
  }
  return session;
}
