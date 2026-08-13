import { resolveGhlMode } from "../env";
import { liveGhlClient } from "./live";
import { mockGhlClient } from "./mock";
import type { GhlClient } from "./types";

/** Devuelve la implementación activa según `GHL_MODE` (con fallback a mock). */
export function getGhlClient(): GhlClient {
  return resolveGhlMode() === "live" ? liveGhlClient : mockGhlClient;
}

export function getGhlMode(): "mock" | "live" {
  return resolveGhlMode();
}

export type { GhlClient };
