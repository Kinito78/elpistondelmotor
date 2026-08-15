import { PrismaClient } from "@prisma/client";
import { headers } from "next/headers";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Hosts de desarrollo: siempre resuelven a la primera sucursal (sin dominio configurado). */
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Sucursal activa para la petición actual, resuelta por el header `Host`:
 *   1. dominio propio exacto (`Branch.domain`),
 *   2. subdominio (`<slug>.loquesea.com` → `Branch.slug`),
 *   3. en localhost o sin match, la primera sucursal (modo dev / single-tenant).
 *
 * Funciona igual en Server Components y en Route Handlers (`next/headers`
 * está disponible en ambos) — no requiere pasar el request a mano.
 */
export async function getActiveBranch() {
  const host = (await headers()).get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();

  if (hostname && !DEV_HOSTS.has(hostname)) {
    const byDomain = await prisma.branch.findUnique({ where: { domain: hostname } });
    if (byDomain) return byDomain;

    const slug = hostname.split(".")[0];
    const bySlug = await prisma.branch.findUnique({ where: { slug } });
    if (bySlug) return bySlug;
  }

  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: "asc" } });
  if (!branch) {
    throw new Error("No hay sucursal configurada. Corre `npm run db:reset`.");
  }
  return branch;
}
