import { env } from "../env";
import type { GhlBusySlot, GhlClient } from "./types";

/**
 * Implementación HTTP real contra la API v2 de GoHighLevel.
 *
 * TODO(verify-on-connect): todos los paths, nombres de campo y formas de respuesta
 * de este archivo están escritos según la documentación pública de la API v2 pero
 * NO han podido validarse contra la API real porque el proyecto todavía no tiene
 * credenciales. Al conectar credenciales reales, verificar aquí (y solo aquí):
 * paths, headers, formato de fechas y estructura de la respuesta de free-slots.
 * El resto de la app solo conoce la interfaz `GhlClient`.
 */

const TIMEOUT_MS = 10_000;

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${env.GHL_API_KEY}`,
    Version: env.GHL_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<T> {
  const url = `${env.GHL_API_BASE}${path}`;
  let lastError: unknown = null;

  // 1 reintento en errores de red o 5xx.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: headers(),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status >= 500) {
        lastError = new Error(`[GHL] ${init.method} ${path} → ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`[GHL] ${init.method} ${path} → ${res.status} ${text.slice(0, 300)}`);
      }
      if (res.status === 204) return {} as T;
      return (await res.json().catch(() => ({}))) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("[GHL] error desconocido");
}

type FreeSlotsResponse = Record<string, unknown> & {
  // TODO(verify-on-connect): GHL devuelve un objeto por fecha con `slots: string[]`.
  _dates_?: unknown;
};

/** Colapsa intervalos solapados/contiguos. */
function mergeIntervals(list: Array<{ start: number; end: number }>) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export const liveGhlClient: GhlClient = {
  mode: "live",

  async upsertContact({ name, phone, email }) {
    // TODO(verify-on-connect)
    const data = await request<{ contact?: { id?: string }; id?: string }>("/contacts/upsert", {
      method: "POST",
      body: {
        locationId: env.GHL_LOCATION_ID,
        name,
        phone,
        ...(email ? { email } : {}),
      },
    });
    const contactId = data.contact?.id ?? data.id;
    if (!contactId) throw new Error("[GHL] upsertContact sin contactId en la respuesta");
    return { contactId };
  },

  async getBusySlots({ calendarId, assignedUserId, from, to }): Promise<GhlBusySlot[]> {
    // TODO(verify-on-connect)
    const params = new URLSearchParams({
      startDate: String(from.getTime()),
      endDate: String(to.getTime()),
      timezone: env.BUSINESS_TIMEZONE,
    });
    if (assignedUserId) params.set("userId", assignedUserId);

    const data = await request<FreeSlotsResponse>(
      `/calendars/${calendarId}/free-slots?${params.toString()}`
    );

    // La API devuelve los slots LIBRES agrupados por fecha; los ocupados se
    // derivan por diferencia contra la ventana consultada.
    const free: Array<{ start: number; end: number }> = [];
    for (const value of Object.values(data ?? {})) {
      if (!value || typeof value !== "object") continue;
      const slots = (value as { slots?: unknown }).slots;
      if (!Array.isArray(slots)) continue;
      for (const slot of slots) {
        const startIso = typeof slot === "string" ? slot : (slot as { startTime?: string })?.startTime;
        if (!startIso) continue;
        const start = Date.parse(startIso);
        if (Number.isNaN(start)) continue;
        const endIso = typeof slot === "object" ? (slot as { endTime?: string })?.endTime : undefined;
        const end = endIso ? Date.parse(endIso) : start + 15 * 60_000;
        free.push({ start, end: Number.isNaN(end) ? start + 15 * 60_000 : end });
      }
    }

    const merged = mergeIntervals(free);
    const busy: GhlBusySlot[] = [];
    let cursor = from.getTime();
    merged.forEach((iv, idx) => {
      if (iv.start > cursor) {
        busy.push({
          startsAt: new Date(cursor),
          endsAt: new Date(iv.start),
          ghlEventId: `live-busy-${idx}`,
        });
      }
      cursor = Math.max(cursor, iv.end);
    });
    if (cursor < to.getTime()) {
      busy.push({
        startsAt: new Date(cursor),
        endsAt: to,
        ghlEventId: `live-busy-tail`,
      });
    }
    return busy;
  },

  async createAppointment({ calendarId, contactId, assignedUserId, startsAt, endsAt, title, notes }) {
    // TODO(verify-on-connect)
    const data = await request<{ id?: string; appointment?: { id?: string } }>(
      "/calendars/events/appointments",
      {
        method: "POST",
        body: {
          calendarId,
          locationId: env.GHL_LOCATION_ID,
          contactId,
          ...(assignedUserId ? { assignedUserId } : {}),
          startTime: startsAt.toISOString(),
          endTime: endsAt.toISOString(),
          title,
          ...(notes ? { notes } : {}),
          appointmentStatus: "confirmed",
          ignoreFreeSlotValidation: true,
        },
      }
    );
    const ghlEventId = data.id ?? data.appointment?.id;
    if (!ghlEventId) throw new Error("[GHL] createAppointment sin id en la respuesta");
    return { ghlEventId };
  },

  async updateAppointment({ ghlEventId, startsAt, endsAt }) {
    // TODO(verify-on-connect)
    await request(`/calendars/events/appointments/${ghlEventId}`, {
      method: "PUT",
      body: {
        startTime: startsAt.toISOString(),
        endTime: endsAt.toISOString(),
        ignoreFreeSlotValidation: true,
      },
    });
  },

  async cancelAppointment({ ghlEventId }) {
    // TODO(verify-on-connect)
    await request(`/calendars/events/${ghlEventId}`, { method: "DELETE" });
  },
};
