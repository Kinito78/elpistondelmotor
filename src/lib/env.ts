import { z } from "zod";

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return v === undefined || v === "" || Number.isNaN(n) ? fallback : n;
    });

// Identidad de negocio (nombre, login de admin, credenciales de GHL) vive por
// sucursal en la base de datos — ver `Branch` en el schema — para que cada
// barbería se configure sin tocar variables de entorno ni redeployar. Lo que
// queda acá es config de infraestructura compartida por todas las sucursales
// de este deploy.
const schema = z.object({
  BUSINESS_TIMEZONE: z.string().default("America/Mexico_City"),
  DEFAULT_COUNTRY_CODE: z.string().default("+52"),
  BOOKING_HORIZON_DAYS: intFromEnv(60),
  MIN_LEAD_MINUTES: intFromEnv(60),
  SLOT_STEP_MINUTES: intFromEnv(15),
  GHL_API_BASE: z.string().default("https://services.leadconnectorhq.com"),
  GHL_API_VERSION: z.string().default("2021-04-15"),
});

const parsed = schema.safeParse({
  BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE,
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE,
  BOOKING_HORIZON_DAYS: process.env.BOOKING_HORIZON_DAYS,
  MIN_LEAD_MINUTES: process.env.MIN_LEAD_MINUTES,
  SLOT_STEP_MINUTES: process.env.SLOT_STEP_MINUTES,
  GHL_API_BASE: process.env.GHL_API_BASE,
  GHL_API_VERSION: process.env.GHL_API_VERSION,
});

// La app nunca crashea por env incompleto: se usan los defaults.
export const env = parsed.success ? parsed.data : schema.parse({});

export type Env = typeof env;
