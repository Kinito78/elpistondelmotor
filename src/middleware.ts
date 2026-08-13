import { NextResponse, type NextRequest } from "next/server";

const ADMIN_COOKIE = "barber_admin";

/**
 * Puerta de entrada del panel: sin cookie de sesión, cualquier `/admin/*`
 * (salvo el login) redirige 307 a `/admin/login`. La validación real de la
 * sesión se hace además en el layout de admin y en cada `/api/admin/*`.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = pathname === "/admin" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
