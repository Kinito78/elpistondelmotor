import { apiError } from "./api";
import { HttpError } from "./errors";

/** Envuelve un handler de ruta y traduce HttpError a la respuesta JSON estándar. */
export async function withApi<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return apiError(err.status, err.code, err.message, err.fields);
    }
    console.error("[API] error inesperado:", err);
    return apiError(500, "INTERNAL_ERROR", "Ocurrió un error inesperado");
  }
}
