import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { env } from "./env";
import { HttpError } from "./errors";

export const ADMIN_COOKIE = "barber_admin";
const SESSION_HOURS = 12;

export async function createAdminSession(user: string, password: string) {
  if (user !== env.ADMIN_USER || password !== env.ADMIN_PASSWORD) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
  }
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await prisma.adminSession.create({ data: { token, expiresAt } });
  // Limpieza oportunista de sesiones vencidas.
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { token, expiresAt };
}

export function adminCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Devuelve la sesión válida o null. */
export async function getAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return session;
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/** Para rutas `/api/admin/*`: lanza 401 si no hay sesión. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new HttpError(401, "UNAUTHORIZED", "Sesión de administrador requerida");
  }
  return session;
}

export async function destroyAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { token } });
  }
}
