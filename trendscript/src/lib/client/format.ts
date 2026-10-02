/**
 * French (fr-FR) formatting helpers for numbers, dates and durations. Pure:
 * relative dates take `now` as an argument (see `useNow`) so render stays
 * deterministic and the lint purity rules hold.
 */

import type { SignalMetrics } from "../types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const compactFormatter = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const relativeFormatter = new Intl.RelativeTimeFormat("fr", { style: "short", numeric: "auto" });

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** 12345 → "12,3 k", 1500000 → "1,5 M", 2.3e9 → "2,3 Md". Non-numbers → "—". */
export function formatCompact(value: number | null | undefined): string {
  return isNumber(value) ? compactFormatter.format(value) : "—";
}

/** 1234567 → "1 234 567" (narrow no-break spaces). Non-numbers → "—". */
export function formatNumber(value: number | null | undefined): string {
  return isNumber(value) ? numberFormatter.format(value) : "—";
}

/** French plural: 0 and 1 take the singular. */
export function pluralize(count: number, singular: string, plural: string): string {
  return Math.abs(count) < 2 ? singular : plural;
}

/** 12345, "vue", "vues" → "12,3 k vues"; 1 → "1 vue". */
export function formatCount(value: number, singular: string, plural: string): string {
  return `${formatCompact(value)} ${pluralize(value, singular, plural)}`;
}

/** 250 → "+250 %", -12.4 → "−12 %" (rounded, signed by default). */
export function formatPercent(value: number, { signed = true }: { signed?: boolean } = {}): string {
  if (!isNumber(value)) return "—";
  const rounded = Math.round(value);
  const sign = signed && rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${numberFormatter.format(Math.abs(rounded))} %`;
}

/** Seconds → "45 s", "1 min", "1 min 30 s", "1 h 05 min". */
export function formatDuration(seconds: number): string {
  if (!isNumber(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  return secs === 0 ? `${minutes} min` : `${minutes} min ${secs} s`;
}

function toTime(input: string | number | Date | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const time = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  return Number.isNaN(time) ? null : time;
}

export interface DateFormatOptions {
  /** IANA time zone (defaults to the browser's). Tests pass "UTC". */
  timeZone?: string;
}

/** "2 oct. 2026" ("" when the date is missing or invalid). */
export function formatDate(input: string | number | Date | null | undefined, { timeZone }: DateFormatOptions = {}): string {
  const time = toTime(input);
  if (time === null) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone }).format(time);
}

/** "2 oct. 2026, 14:05" ("" when the date is missing or invalid). */
export function formatDateTime(
  input: string | number | Date | null | undefined,
  { timeZone }: DateFormatOptions = {},
): string {
  const time = toTime(input);
  if (time === null) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(time);
}

/**
 * Relative date in French: "à l'instant", "il y a 5 min", "il y a 3 h",
 * "hier", "il y a 4 j", "dans 2 h"; beyond 7 days the absolute date
 * ("12 sept." or "12 sept. 2025" in another year). "" for invalid input.
 * `now` is a timestamp (use the `useNow()` hook in components).
 */
export function formatRelative(
  input: string | number | Date | null | undefined,
  now: number,
  { timeZone }: DateFormatOptions = {},
): string {
  const time = toTime(input);
  if (time === null) return "";
  const diff = time - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return "à l'instant";
  if (abs < HOUR) return relativeFormatter.format(Math.round(diff / MINUTE) || Math.sign(diff), "minute");
  if (abs < DAY) return relativeFormatter.format(Math.round(diff / HOUR), "hour");
  if (abs < 7 * DAY) return relativeFormatter.format(Math.round(diff / DAY), "day");
  const sameYear =
    new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone }).format(time) ===
    new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone }).format(now);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(time);
}

/**
 * Human labels for a signal's metrics, most meaningful first:
 * ["20 k+ recherches", "+250 %", "12,3 k vues", "1,2 k j'aime", …].
 */
export function formatSignalMetrics(metrics: SignalMetrics): string[] {
  const parts: string[] = [];
  if (isNumber(metrics.searchVolume)) parts.push(`${formatCompact(metrics.searchVolume)}+ recherches`);
  if (isNumber(metrics.increasePct)) parts.push(formatPercent(metrics.increasePct));
  if (isNumber(metrics.views)) parts.push(formatCount(metrics.views, "vue", "vues"));
  if (isNumber(metrics.likes)) parts.push(`${formatCompact(metrics.likes)} j'aime`);
  if (isNumber(metrics.comments)) parts.push(formatCount(metrics.comments, "commentaire", "commentaires"));
  if (isNumber(metrics.shares)) parts.push(formatCount(metrics.shares, "partage", "partages"));
  if (isNumber(metrics.saves)) parts.push(formatCount(metrics.saves, "enregistrement", "enregistrements"));
  if (isNumber(metrics.followers)) parts.push(formatCount(metrics.followers, "abonné", "abonnés"));
  if (isNumber(metrics.durationSec)) parts.push(formatDuration(metrics.durationSec));
  if (isNumber(metrics.rank)) parts.push(`n° ${metrics.rank}`);
  return parts;
}
