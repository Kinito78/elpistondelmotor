import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Sucursal activa (multi-sucursal-ready: hoy siempre la primera fila). */
export async function getActiveBranch() {
  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: "asc" } });
  if (!branch) {
    throw new Error("No hay sucursal configurada. Corre `npm run db:reset`.");
  }
  return branch;
}
