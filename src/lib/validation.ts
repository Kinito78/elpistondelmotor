import { z } from "zod";
import { countDigits } from "./format";

export const customerSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede exceder 80 caracteres"),
  phone: z
    .string({ required_error: "Teléfono inválido" })
    .trim()
    .refine((v) => countDigits(v) >= 10, "Teléfono inválido")
    .refine((v) => countDigits(v) <= 15, "Teléfono inválido"),
  email: z
    .union([z.literal(""), z.string().trim().email("Email inválido")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const createAppointmentSchema = z.object({
  barberId: z.string().min(1, "Selecciona un barbero"),
  serviceId: z.string().min(1, "Selecciona un servicio"),
  startsAt: z
    .string()
    .min(1, "Selecciona un horario")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Horario inválido"),
  customer: customerSchema,
  notes: z
    .union([z.literal(""), z.string().max(300, "Las notas no pueden exceder 300 caracteres")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const patchAppointmentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("reschedule"),
    startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Horario inválido"),
  }),
]);

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  description: z.string().max(300).optional().nullable(),
  durationMin: z
    .number({ invalid_type_error: "Duración inválida" })
    .int("Duración inválida")
    .min(15, "La duración mínima es 15 minutos")
    .max(240, "La duración máxima es 240 minutos")
    .refine((v) => v % 15 === 0, "La duración debe ser múltiplo de 15"),
  priceCents: z.number().int("Precio inválido").min(0, "Precio inválido"),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const serviceUpdateSchema = serviceSchema.partial();

export const barberSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  bio: z.string().max(300).optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
  ghlUserId: z.string().max(120).optional().nullable(),
  serviceIds: z.array(z.string()).optional(),
});

export const barberUpdateSchema = barberSchema.partial();

export const loyaltySettingsSchema = z.object({
  cutsRequired: z.number().int("Debe ser un número entero").min(1).max(50).optional(),
  rewardCents: z.number().int("Debe ser un número entero").min(0).optional(),
  windowDays: z.number().int("Debe ser un número entero").min(1).max(90).optional(),
});

export const loyaltyManualVisitSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  phone: z
    .string({ required_error: "Teléfono inválido" })
    .trim()
    .refine((v) => countDigits(v) >= 10, "Teléfono inválido")
    .refine((v) => countDigits(v) <= 15, "Teléfono inválido"),
});

export const loyaltyRedeemSchema = z.object({
  customerId: z.string().min(1, "Selecciona un cliente"),
});

export const scheduleSchema = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMin: z.number().int().min(0).max(1440),
        endMin: z.number().int().min(0).max(1440),
        active: z.boolean(),
      })
    )
    .min(1),
});

export const timeOffSchema = z.object({
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  endsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida"),
  reason: z.string().max(200).optional().nullable(),
});

export const webhookSchema = z.object({
  type: z.enum(["AppointmentCreate", "AppointmentUpdate", "AppointmentDelete"]),
  appointment: z.object({
    id: z.string().min(1),
    calendarId: z.string().optional(),
    contactId: z.string().optional(),
    assignedUserId: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    title: z.string().optional(),
  }),
  contact: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});

/** Convierte un ZodError en `{campo: mensaje}` con notación de punto. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const shortKey = issue.path[issue.path.length - 1];
    if (!fields[path]) fields[path] = issue.message;
    if (typeof shortKey === "string" && !fields[shortKey]) fields[shortKey] = issue.message;
  }
  return fields;
}
