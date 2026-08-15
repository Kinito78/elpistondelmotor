import { env } from "../env";
import type { GhlBusySlot, GhlClient } from "./types";

/**
 * Implementación HTTP real contra la API v2 de GoHighLevel.
 * Cada sucursal trae sus propias credenciales (`apiKey`, `locationId`) — ver
 * `getGhlClient` en `./client.ts`. Verificado en producción contra una cuenta
 * real: paths, headers y el parseo de `free-slots` (ver `inferSlotStepMs`).
 */

const TIMEOUT_MS = 10_000;

export function createLiveGhlClient(credentials: { apiKey: string; locationId: string }): GhlClient {
  function headers(): HeadersInit {
    return {
      Authorization: `Bearer ${credentials.apiKey}`,
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

  return {
    mode: "live",

    async upsertContact({ name, phone, email }) {
      const data = await request<{ contact?: { id?: string }; id?: string }>("/contacts/upsert", {
        method: "POST",
        body: {
          locationId: credentials.locationId,
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

        const bareStarts: number[] = [];
        for (const slot of slots) {
          if (typeof slot === "string") {
            const start = Date.parse(slot);
            if (!Number.isNaN(start)) bareStarts.push(start);
            continue;
          }
          const startIso = (slot as { startTime?: string })?.startTime;
          const endIso = (slot as { endTime?: string })?.endTime;
          const start = startIso ? Date.parse(startIso) : NaN;
          const end = endIso ? Date.parse(endIso) : NaN;
          if (!Number.isNaN(start) && !Number.isNaN(end)) free.push({ start, end });
        }

        if (bareStarts.length > 0) {
          bareStarts.sort((a, b) => a - b);
          const step = inferSlotStepMs(bareStarts);
          bareStarts.forEach((start, i) => {
            const end = i < bareStarts.length - 1 ? bareStarts[i + 1] : start + step;
            free.push({ start, end });
          });
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
      const data = await request<{ id?: string; appointment?: { id?: string } }>(
        "/calendars/events/appointments",
        {
          method: "POST",
          body: {
            calendarId,
            locationId: credentials.locationId,
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
      await request(`/calendars/events/${ghlEventId}`, { method: "DELETE" });
    },
  };
}

type FreeSlotsResponse = Record<string, unknown> & {
  // Un objeto por fecha con `slots: string[]`, donde cada string es solo la
  // hora de INICIO del slot (sin duración ni fin) — verificado contra la API real.
  _dates_?: unknown;
};

/**
 * El paso entre slots de GHL (15/30/60 min) lo define el calendario y no viene
 * en la respuesta. Se infiere de la separación real entre inicios consecutivos
 * (mediana, resistente a huecos) en vez de asumir un valor fijo.
 */
function inferSlotStepMs(sortedStarts: number[]): number {
  if (sortedStarts.length < 2) return 15 * 60_000;
  const diffs: number[] = [];
  for (let i = 1; i < sortedStarts.length; i++) diffs.push(sortedStarts[i] - sortedStarts[i - 1]);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

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
