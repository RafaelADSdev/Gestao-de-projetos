import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "./constants";
import type { ISODate } from "./types";

export type ClockValue = Date | string | number;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 86_400_000;

function validateIsoDate(value: string): asserts value is ISODate {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`Data deve usar o formato YYYY-MM-DD: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Data inválida: ${value}`);
  }
}

/** Returns the calendar date observed in a time zone, never the UTC date by accident. */
export function toISODate(
  value: ClockValue = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): ISODate {
  if (typeof value === "string" && ISO_DATE_PATTERN.test(value)) {
    validateIsoDate(value);
    return value;
  }

  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Instante inválido: ${String(value)}`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function toEpochDay(value: ISODate): number {
  validateIsoDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_IN_MS);
}

/** Positive when target is after reference. Date-only math is immune to DST. */
export function differenceInCalendarDays(
  target: ISODate,
  reference: ClockValue,
  timeZone = DEFAULT_TIME_ZONE,
): number {
  return toEpochDay(target) - toEpochDay(toISODate(reference, timeZone));
}

export function addCalendarDays(date: ISODate, amount: number): ISODate {
  validateIsoDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return result.toISOString().slice(0, 10);
}

export function formatDateBR(
  date: ISODate,
  options: { long?: boolean; timeZone?: string } = {},
): string {
  validateIsoDate(date);
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
    ...(options.long
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "2-digit", month: "2-digit", year: "numeric" }),
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function pluralDays(days: number): string {
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}

export function formatRelativeDateLabel(
  target: ISODate,
  now: ClockValue = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const days = differenceInCalendarDays(target, now, timeZone);
  if (days === -1) return "Ontem";
  if (days < -1) return `Há ${pluralDays(Math.abs(days))}`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${pluralDays(days)}`;
}

export function formatDeadlineLabel(
  dueDate: ISODate,
  now: ClockValue = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const days = differenceInCalendarDays(dueDate, now, timeZone);
  if (days === -1) return "Atrasado há 1 dia";
  if (days < -1) return `Atrasado há ${pluralDays(Math.abs(days))}`;
  return formatRelativeDateLabel(dueDate, now, timeZone);
}

export function formatRenewalLabel(
  renewalDate: ISODate,
  now: ClockValue = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const days = differenceInCalendarDays(renewalDate, now, timeZone);
  if (days === -1) return "Renovação atrasada há 1 dia";
  if (days < -1) return `Renovação atrasada há ${pluralDays(Math.abs(days))}`;
  if (days === 0) return "Renova hoje";
  if (days === 1) return "Renova amanhã";
  return `Renova em ${pluralDays(days)}`;
}

