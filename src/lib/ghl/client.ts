import type { Branch } from "@prisma/client";
import { createLiveGhlClient } from "./live";
import { mockGhlClient } from "./mock";
import type { GhlClient } from "./types";

export type GhlCredentials = {
  apiKey: string;
  locationId: string;
  calendarId: string;
};

/** "live" solo si la sucursal tiene las tres credenciales cargadas; si no, mock. */
export function resolveGhlMode(branch: Branch): "mock" | "live" {
  const complete =
    !!branch.ghlApiKey?.trim() && !!branch.ghlLocationId?.trim() && !!branch.ghlCalendarId?.trim();
  if (!complete && (branch.ghlApiKey || branch.ghlLocationId || branch.ghlCalendarId)) {
    console.warn(`[GHL] sucursal ${branch.id}: credenciales incompletas → modo mock`);
  }
  return complete ? "live" : "mock";
}

/** Devuelve la implementación activa para esta sucursal (con fallback a mock). */
export function getGhlClient(branch: Branch): GhlClient {
  if (resolveGhlMode(branch) !== "live") return mockGhlClient;
  return createLiveGhlClient({
    apiKey: branch.ghlApiKey!,
    locationId: branch.ghlLocationId!,
  });
}

export function getGhlMode(branch: Branch): "mock" | "live" {
  return resolveGhlMode(branch);
}

export type { GhlClient };
