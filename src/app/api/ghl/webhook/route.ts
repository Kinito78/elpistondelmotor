import { randomUUID } from "crypto";
import { apiOk, readJson } from "@/lib/api";
import { getActiveBranch, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";
import { withApi } from "@/lib/handler";
import { slotKeyFor } from "@/lib/booking";
import { webhookSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Webhook entrante de GHL: refleja en la base local las citas creadas fuera del
 * sitio (por ejemplo por el bot de WhatsApp). Idempotente por `appointment.id`.
 */
export async function POST(req: Request) {
  return withApi(async () => {
    const secret = req.headers.get("x-ghl-webhook-secret");
    if (!secret || secret !== env.GHL_WEBHOOK_SECRET) {
      throw new HttpError(401, "UNAUTHORIZED", "Secreto de webhook inválido");
    }

    const parsed = webhookSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new HttpError(400, "INVALID_PAYLOAD", "Payload de webhook inválido");
    }
    const { type, appointment: evt, contact } = parsed.data;

    const branch = await getActiveBranch();
    const calendarId = evt.calendarId || branch.ghlCalendarId || "mock-calendar-1";

    if (type === "AppointmentDelete") {
      await prisma.ghlEvent.updateMany({
        where: { ghlEventId: evt.id },
        data: { status: "cancelled" },
      });
      const existing = await prisma.appointment.findFirst({ where: { ghlEventId: evt.id } });
      if (existing) {
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { status: "cancelled", slotKey: null },
        });
      }
      return apiOk({ ok: true, appointmentId: existing?.id ?? null });
    }

    if (!evt.startTime || !evt.endTime) {
      throw new HttpError(400, "INVALID_PAYLOAD", "startTime y endTime son obligatorios");
    }
    const startsAt = new Date(evt.startTime);
    const endsAt = new Date(evt.endTime);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new HttpError(400, "INVALID_PAYLOAD", "Rango de fechas inválido");
    }

    // Barbero: por assignedUserId; si no mapea, el primer barbero activo (marcado para revisión).
    let barber = evt.assignedUserId
      ? await prisma.barber.findFirst({
          where: { branchId: branch.id, ghlUserId: evt.assignedUserId },
        })
      : null;
    let unmappedBarber = false;
    if (!barber) {
      unmappedBarber = true;
      barber = await prisma.barber.findFirst({
        where: { branchId: branch.id, active: true },
        orderBy: { name: "asc" },
      });
    }
    if (!barber) throw new HttpError(400, "INVALID_PAYLOAD", "No hay barberos configurados");

    // Servicio: el activo cuya duración coincide con la del evento; si no, el primero.
    const durationMin = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    const service =
      (await prisma.service.findFirst({
        where: { branchId: branch.id, active: true, durationMin },
        orderBy: { sortOrder: "asc" },
      })) ??
      (await prisma.service.findFirst({
        where: { branchId: branch.id, active: true },
        orderBy: { sortOrder: "asc" },
      }));
    if (!service) throw new HttpError(400, "INVALID_PAYLOAD", "No hay servicios configurados");

    const phone = contact?.phone
      ? normalizePhone(contact.phone, env.DEFAULT_COUNTRY_CODE)
      : `+000${(evt.contactId ?? evt.id).replace(/\D/g, "").slice(0, 10).padStart(10, "0")}`;
    const name = contact?.name?.trim() || evt.title?.trim() || "Cliente WhatsApp";

    const customer = await prisma.customer.upsert({
      where: { phone },
      update: { name, ...(contact?.email ? { email: contact.email } : {}) },
      create: { name, phone, email: contact?.email ?? null, ghlContactId: evt.contactId ?? null },
    });

    // Espejo del calendario externo (idempotente por ghlEventId).
    await prisma.ghlEvent.upsert({
      where: { ghlEventId: evt.id },
      update: {
        ghlCalendarId: calendarId,
        ghlContactId: evt.contactId ?? customer.ghlContactId,
        assignedUserId: evt.assignedUserId ?? barber.ghlUserId,
        barberId: barber.id,
        title: evt.title ?? `${service.name} - ${name}`,
        startsAt,
        endsAt,
        status: "confirmed",
        origin: "whatsapp",
        raw: JSON.stringify(parsed.data),
      },
      create: {
        ghlEventId: evt.id,
        ghlCalendarId: calendarId,
        ghlContactId: evt.contactId ?? customer.ghlContactId,
        assignedUserId: evt.assignedUserId ?? barber.ghlUserId,
        barberId: barber.id,
        title: evt.title ?? `${service.name} - ${name}`,
        startsAt,
        endsAt,
        status: "confirmed",
        origin: "whatsapp",
        raw: JSON.stringify(parsed.data),
      },
    });

    const existing = await prisma.appointment.findFirst({ where: { ghlEventId: evt.id } });
    const syncStatus = unmappedBarber ? "failed" : "synced";
    const syncError = unmappedBarber
      ? `assignedUserId "${evt.assignedUserId ?? ""}" no mapea a ningún barbero`
      : null;

    if (existing) {
      const updated = await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          startsAt,
          endsAt,
          barberId: barber.id,
          status: "confirmed",
          slotKey: slotKeyFor(barber.id, startsAt, "confirmed"),
          ghlSyncStatus: syncStatus,
          ghlSyncError: syncError,
        },
      });
      return apiOk({ ok: true, appointmentId: updated.id });
    }

    const baseData = {
      branchId: branch.id,
      barberId: barber.id,
      serviceId: service.id,
      customerId: customer.id,
      startsAt,
      endsAt,
      status: "confirmed",
      source: "whatsapp",
      priceCents: service.priceCents,
      paymentStatus: "unpaid",
      manageToken: randomUUID(),
      ghlEventId: evt.id,
    };

    let created;
    try {
      created = await prisma.appointment.create({
        data: { ...baseData, slotKey: slotKeyFor(barber.id, startsAt, "confirmed"), ghlSyncStatus: syncStatus, ghlSyncError: syncError },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        // El horario ya está ocupado localmente: se registra igual, marcado para revisión.
        created = await prisma.appointment.create({
          data: {
            ...baseData,
            slotKey: null,
            ghlSyncStatus: "failed",
            ghlSyncError: "El horario ya estaba ocupado en la agenda local (posible traslape)",
          },
        });
      } else {
        throw err;
      }
    }

    return apiOk({ ok: true, appointmentId: created.id });
  });
}
