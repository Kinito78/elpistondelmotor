import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import { env } from "./env";

export const TZ = env.BUSINESS_TIMEZONE;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(date: string | null | undefined): date is string {
  if (!date || !DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` + minutos desde medianoche (hora local de negocio) → Date UTC. */
export function localDateTimeToUtc(date: string, minutesFromMidnight: number): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return fromZonedTime(`${date}T${pad(h)}:${pad(m)}:00`, TZ);
}

/** Día de la semana local (0=domingo .. 6=sábado) de una fecha `YYYY-MM-DD`. */
export function weekdayOfLocalDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Fecha local de negocio (`YYYY-MM-DD`) para un instante dado. */
export function toLocalDateString(instant: Date = new Date()): string {
  return formatInTimeZone(instant, TZ, "yyyy-MM-dd");
}

/** Minutos desde medianoche local de negocio para un instante dado. */
export function localMinutesOfDay(instant: Date): number {
  const h = Number(formatInTimeZone(instant, TZ, "HH"));
  const m = Number(formatInTimeZone(instant, TZ, "mm"));
  return h * 60 + m;
}

/** Inicio del día local de negocio (00:00) expresado en UTC. */
export function startOfLocalDayUtc(date: string): Date {
  return localDateTimeToUtc(date, 0);
}

/** Fin exclusivo del día local (00:00 del día siguiente) en UTC. */
export function endOfLocalDayUtc(date: string): Date {
  return new Date(startOfLocalDayUtc(date).getTime() + 24 * 60 * 60 * 1000);
}

/** Suma días a una fecha `YYYY-MM-DD` (aritmética de calendario, sin zona). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Etiqueta `HH:mm` (24 h) en zona de negocio. */
export function labelHHmm(instant: Date): string {
  return formatInTimeZone(instant, TZ, "HH:mm");
}

/** Etiqueta larga: `sábado 15 de agosto, 10:30`. */
export function labelLong(instant: Date): string {
  return formatInTimeZone(instant, TZ, "EEEE d 'de' MMMM, HH:mm", { locale: es });
}

/** Etiqueta corta: `15/08/2026 10:30`. */
export function labelShort(instant: Date): string {
  return formatInTimeZone(instant, TZ, "dd/MM/yyyy HH:mm");
}

export function labelDate(instant: Date): string {
  return formatInTimeZone(instant, TZ, "dd/MM/yyyy");
}

/** Solapamiento de intervalos: aStart < bEnd && bStart < aEnd. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Convierte un instante a su representación "de pared" en la zona de negocio. */
export function toBusinessZone(instant: Date): Date {
  return toZonedTime(instant, TZ);
}

/** Lista de fechas `YYYY-MM-DD` entre from y to, inclusive. */
export function dateRangeList(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDaysToDateString(cur, 1);
    guard++;
  }
  return out;
}
