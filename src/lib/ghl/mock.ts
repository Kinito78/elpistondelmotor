import { createHash, randomUUID } from "crypto";
import { prisma } from "../db";
import type { GhlBusySlot, GhlClient } from "./types";

/** Contact id estable derivado del teléfono: mismas entradas → mismo id. */
export function mockContactId(phone: string): string {
  const hash = createHash("sha1").update(phone).digest("hex").slice(0, 12);
  return `mockct_${hash}`;
}

/**
 * Calendario externo simulado, persistido en la tabla `GhlEvent`.
 * Se comporta como un calendario real: también contiene eventos que el sitio
 * no originó (por ejemplo los que llegan por el webhook de WhatsApp).
 */
export const mockGhlClient: GhlClient = {
  mode: "mock",

  async upsertContact({ phone }) {
    return { contactId: mockContactId(phone) };
  },

  async getBusySlots({ calendarId, assignedUserId, from, to }): Promise<GhlBusySlot[]> {
    const events = await prisma.ghlEvent.findMany({
      where: {
        ghlCalendarId: calendarId,
        status: "confirmed",
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(assignedUserId ? { assignedUserId } : {}),
      },
      orderBy: { startsAt: "asc" },
    });
    return events.map((e) => ({
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      ghlEventId: e.ghlEventId,
    }));
  },

  async createAppointment({ calendarId, contactId, assignedUserId, startsAt, endsAt, title, notes }) {
    const ghlEventId = `mock_${randomUUID()}`;
    await prisma.ghlEvent.create({
      data: {
        ghlEventId,
        ghlCalendarId: calendarId,
        ghlContactId: contactId,
        assignedUserId: assignedUserId ?? null,
        title,
        startsAt,
        endsAt,
        status: "confirmed",
        origin: "web",
        raw: JSON.stringify({ title, notes }),
      },
    });
    return { ghlEventId };
  },

  async updateAppointment({ ghlEventId, startsAt, endsAt }) {
    await prisma.ghlEvent.updateMany({
      where: { ghlEventId },
      data: { startsAt, endsAt, status: "confirmed" },
    });
  },

  async cancelAppointment({ ghlEventId }) {
    await prisma.ghlEvent.updateMany({
      where: { ghlEventId },
      data: { status: "cancelled" },
    });
  },
};
