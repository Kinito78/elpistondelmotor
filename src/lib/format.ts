/** `25000` → `$250.00 MXN` */
export function formatPrice(cents: number): string {
  const amount = (cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${amount} MXN`;
}

/** `25000` → `$250.00` (sin sufijo de moneda) */
export function formatMoney(cents: number): string {
  const amount = (cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${amount}`;
}

/** `+525512345678` → `**** **** 5678` */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4) || "****";
  return `**** **** ${last4}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No asistió",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  admin: "Admin",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function paymentLabel(paymentStatus: string): string {
  return paymentStatus === "paid_onsite" ? "Pagado en local" : "Sin pagar";
}

/**
 * Normaliza a E.164 usando el código de país por defecto.
 * `5512345678` + `+52` → `+525512345678`.
 */
export function normalizePhone(input: string, defaultCountryCode: string): string {
  const trimmed = (input ?? "").trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus) return `+${digits}`;
  const cc = defaultCountryCode.replace(/\D/g, "");
  if (cc && digits.startsWith(cc) && digits.length > 10) return `+${digits}`;
  return `+${cc}${digits}`;
}

export function countDigits(input: string): number {
  return (input ?? "").replace(/\D/g, "").length;
}
