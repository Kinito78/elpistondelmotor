import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";

function createClient() {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// En Cloudflare Workers una conexión (WebSocket a Neon) abierta en una petición
// no se puede reutilizar en otra, así que en producción hay un cliente por
// petición, indexado por su ExecutionContext. En dev basta uno global.
const clientsByRequest = new WeakMap<object, PrismaClient>();

function getClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    return (globalForPrisma.prisma ??= createClient());
  }
  const { ctx } = getCloudflareContext();
  let client = clientsByRequest.get(ctx);
  if (!client) {
    client = createClient();
    clientsByRequest.set(ctx, client);
  }
  return client;
}

/** Cliente de Prisma de la petición actual (se resuelve en cada acceso). */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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
