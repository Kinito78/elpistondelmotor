import { z } from "zod";

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return v === undefined || v === "" || Number.isNaN(n) ? fallback : n;
    });

const schema = z.object({
  BUSINESS_TIMEZONE: z.string().default("America/Mexico_City"),
  BUSINESS_NAME: z.string().default("Barbería La Navaja"),
  DEFAULT_COUNTRY_CODE: z.string().default("+52"),
  BOOKING_HORIZON_DAYS: intFromEnv(60),
  MIN_LEAD_MINUTES: intFromEnv(60),
  SLOT_STEP_MINUTES: intFromEnv(15),
  ADMIN_USER: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("barberia123"),
  GHL_MODE: z.enum(["mock", "live"]).default("mock"),
  GHL_API_KEY: z.string().default(""),
  GHL_LOCATION_ID: z.string().default(""),
  GHL_CALENDAR_ID: z.string().default(""),
  GHL_API_BASE: z.string().default("https://services.leadconnectorhq.com"),
  GHL_API_VERSION: z.string().default("2021-04-15"),
  GHL_WEBHOOK_SECRET: z.string().default("dev-webhook-secret"),
});

const parsed = schema.safeParse({
  BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE,
  BUSINESS_NAME: process.env.BUSINESS_NAME,
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE,
  BOOKING_HORIZON_DAYS: process.env.BOOKING_HORIZON_DAYS,
  MIN_LEAD_MINUTES: process.env.MIN_LEAD_MINUTES,
  SLOT_STEP_MINUTES: process.env.SLOT_STEP_MINUTES,
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  GHL_MODE: process.env.GHL_MODE === "live" ? "live" : "mock",
  GHL_API_KEY: process.env.GHL_API_KEY,
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID,
  GHL_CALENDAR_ID: process.env.GHL_CALENDAR_ID,
  GHL_API_BASE: process.env.GHL_API_BASE,
  GHL_API_VERSION: process.env.GHL_API_VERSION,
  GHL_WEBHOOK_SECRET: process.env.GHL_WEBHOOK_SECRET,
});

// La app nunca crashea por env incompleto: se usan los defaults.
const raw = parsed.success ? parsed.data : schema.parse({});

let ghlModeWarned = false;

/**
 * Modo GHL efectivo: si se pidió `live` pero faltan credenciales, cae a `mock`.
 * Nunca lanza excepción.
 */
export function resolveGhlMode(): "mock" | "live" {
  if (raw.GHL_MODE !== "live") return "mock";
  const complete =
    raw.GHL_API_KEY.trim() !== "" &&
    raw.GHL_LOCATION_ID.trim() !== "" &&
    raw.GHL_CALENDAR_ID.trim() !== "";
  if (complete) return "live";
  if (!ghlModeWarned) {
    ghlModeWarned = true;
    console.warn("[GHL] credenciales incompletas → modo mock");
  }
  return "mock";
}

export const env = {
  ...raw,
  get GHL_EFFECTIVE_MODE(): "mock" | "live" {
    return resolveGhlMode();
  },
};

export type Env = typeof env;
