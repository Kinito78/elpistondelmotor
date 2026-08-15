import { randomUUID } from "crypto";
import { getActiveBranch, prisma } from "./db";
import { env } from "./env";
import { HttpError, notFound } from "./errors";
import { normalizePhone } from "./format";

/** Vence las visitas pendientes cuya ventana de confirmación ya pasó. */
async function expireStale(branchId: string) {
  await prisma.loyaltyVisit.updateMany({
    where: { branchId, status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });
}

export type LoyaltyStatus = {
  cutsRequired: number;
  rewardCents: number;
  windowDays: number;
  confirmedAvailable: number;
  pendingCount: number;
  readyToRedeem: boolean;
};

export async function getLoyaltyStatus(customerId: string): Promise<LoyaltyStatus> {
  const branch = await getActiveBranch();
  await expireStale(branch.id);

  const [confirmedAvailable, pendingCount] = await Promise.all([
    prisma.loyaltyVisit.count({
      where: { branchId: branch.id, customerId, status: "confirmed", redemptionId: null },
    }),
    prisma.loyaltyVisit.count({
      where: { branchId: branch.id, customerId, status: "pending" },
    }),
  ]);

  return {
    cutsRequired: branch.loyaltyCutsRequired,
    rewardCents: branch.loyaltyRewardCents,
    windowDays: branch.loyaltyWindowDays,
    confirmedAvailable,
    pendingCount,
    readyToRedeem: confirmedAvailable >= branch.loyaltyCutsRequired,
  };
}

/** Crea una visita pendiente de confirmar. `appointmentId` solo para altas automáticas. */
export async function createPendingVisit(input: {
  branchId: string;
  customerId: string;
  appointmentId?: string;
  source: "auto" | "manual";
}) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: input.branchId } });
  const expiresAt = new Date(Date.now() + branch.loyaltyWindowDays * 24 * 60 * 60_000);

  try {
    return await prisma.loyaltyVisit.create({
      data: {
        branchId: input.branchId,
        customerId: input.customerId,
        appointmentId: input.appointmentId ?? null,
        source: input.source,
        confirmToken: randomUUID(),
        expiresAt,
      },
    });
  } catch (err) {
    // Ya existe una visita de fidelidad para esta cita (ej. doble click en "Completada").
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }
}

/** Alta manual por el barbero: busca o crea el cliente por teléfono y registra la visita. */
export async function registerManualVisit(input: { name: string; phone: string }) {
  const branch = await getActiveBranch();
  const phone = normalizePhone(input.phone, env.DEFAULT_COUNTRY_CODE);

  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {},
    create: { name: input.name.trim(), phone },
  });

  await createPendingVisit({ branchId: branch.id, customerId: customer.id, source: "manual" });
  return customer;
}

export async function confirmVisitByToken(token: string) {
  const visit = await prisma.loyaltyVisit.findUnique({
    where: { confirmToken: token },
    include: { customer: true, branch: true },
  });
  if (!visit) throw notFound("Este enlace de confirmación no es válido");

  if (visit.status === "confirmed") return visit;

  if (visit.status === "expired" || visit.expiresAt.getTime() < Date.now()) {
    if (visit.status === "pending") {
      await prisma.loyaltyVisit.update({ where: { id: visit.id }, data: { status: "expired" } });
    }
    throw new HttpError(409, "EXPIRED", "El plazo para confirmar este corte ya venció");
  }

  return prisma.loyaltyVisit.update({
    where: { id: visit.id },
    data: { status: "confirmed", confirmedAt: new Date() },
    include: { customer: true, branch: true },
  });
}

/** Canjea el descuento: marca las visitas confirmadas disponibles más antiguas como usadas. */
export async function redeemReward(customerId: string) {
  const branch = await getActiveBranch();
  await expireStale(branch.id);

  const available = await prisma.loyaltyVisit.findMany({
    where: { branchId: branch.id, customerId, status: "confirmed", redemptionId: null },
    orderBy: { confirmedAt: "asc" },
    take: branch.loyaltyCutsRequired,
  });

  if (available.length < branch.loyaltyCutsRequired) {
    throw new HttpError(
      409,
      "NOT_ENOUGH_CUTS",
      `El cliente todavía no junta los ${branch.loyaltyCutsRequired} cortes requeridos`
    );
  }

  const redemption = await prisma.loyaltyRedemption.create({
    data: {
      branchId: branch.id,
      customerId,
      cutsUsed: branch.loyaltyCutsRequired,
      discountCents: branch.loyaltyRewardCents,
    },
  });

  await prisma.loyaltyVisit.updateMany({
    where: { id: { in: available.map((v) => v.id) } },
    data: { redemptionId: redemption.id },
  });

  return redemption;
}

export async function updateLoyaltySettings(input: {
  cutsRequired?: number;
  rewardCents?: number;
  windowDays?: number;
}) {
  const branch = await getActiveBranch();
  return prisma.branch.update({
    where: { id: branch.id },
    data: {
      ...(input.cutsRequired !== undefined ? { loyaltyCutsRequired: input.cutsRequired } : {}),
      ...(input.rewardCents !== undefined ? { loyaltyRewardCents: input.rewardCents } : {}),
      ...(input.windowDays !== undefined ? { loyaltyWindowDays: input.windowDays } : {}),
    },
  });
}
