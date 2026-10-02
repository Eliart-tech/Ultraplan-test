/**
 * Small pure helpers shared by the social/video connectors (Apify, Meta
 * Graph, YouTube). Upstream payloads are loosely typed — counters come back
 * as strings (YouTube), as -1 when hidden (Apify Instagram) or are simply
 * missing — so every number goes through `toCount`.
 */

import { stripAccents, truncate } from "../../analysis/text";

/** Non-negative finite number, or undefined (hidden / missing / garbage). */
export function toCount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * ISO 8601 from an ISO-ish string ("2019-09-26T22:36:43+0000" included),
 * unix seconds or unix milliseconds. Undefined when unparseable.
 */
export function toIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let time: number;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const n = Number(value);
    // < 1e11 ⇒ seconds (that's year 5138 in ms, year 1973 in s).
    time = n < 1e11 ? n * 1000 : n;
  } else if (typeof value === "string") {
    time = Date.parse(value);
  } else {
    return undefined;
  }
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : undefined;
}

/** True when `iso` is within `maxAgeMs` before `now` (unknown dates are kept). */
export function isRecent(iso: string | undefined, now: number, maxAgeMs: number): boolean {
  if (!iso) return true;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return true;
  return now - time <= maxAgeMs;
}

export const DAY_MS = 86_400_000;

/** Lower-case tag without '#', or undefined when empty. */
export function normalizeTag(tag: unknown): string | undefined {
  if (typeof tag !== "string") return undefined;
  const clean = tag.trim().replace(/^#+/, "").toLowerCase();
  return clean || undefined;
}

/** Unique, lower-cased tags (input order kept), capped. */
export function uniqueTags(tags: Iterable<unknown>, max = 15): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const clean = normalizeTag(tag);
    if (clean) out.add(clean);
    if (out.size >= max) break;
  }
  return [...out];
}

/** Hashtags written in free text (captions, descriptions). */
export function extractHashtags(text: string | undefined, max = 15): string[] {
  if (!text) return [];
  return uniqueTags(Array.from(text.matchAll(/#([\p{L}\p{N}_]+)/gu), (m) => m[1]), max);
}

/**
 * Niche keyword → Instagram/TikTok-style hashtag: accents stripped,
 * spaces and punctuation removed ("Batch cooking" → "batchcooking",
 * "Éducation" → "education"). Empty when nothing usable is left.
 */
export function keywordToHashtag(keyword: string): string {
  return stripAccents(keyword.toLowerCase()).replace(/[^a-z0-9_]/g, "");
}

/** Unique hashtags from keywords, capped. */
export function keywordsToHashtags(keywords: string[], max: number): string[] {
  const out: string[] = [];
  for (const keyword of keywords) {
    const tag = keywordToHashtag(keyword);
    if (tag.length >= 2 && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/** A readable title from a caption: first non-empty line, hashtags trimmed off the end. */
export function captionTitle(caption: string | undefined, fallback: string, max = 120): string {
  const firstLine = (caption ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.replace(/[#@][\p{L}\p{N}_.]+/gu, "").trim().length > 0);
  if (!firstLine) return fallback;
  const withoutTrailingTags = firstLine.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return truncate(withoutTrailingTags || firstLine, max) ?? fallback;
}

const FRENCH_MARKERS = new Set(
  "le la les des une est pour avec pas que qui dans sur ça ca c'est j'ai vous nous mais tout très tres aussi comme cette être etre fait faire plus moins".split(
    " ",
  ),
);

/**
 * Cheap language guard for captions when the platform gives no language
 * field (Instagram). Conservative: only says "not French" for captions long
 * enough to judge (≥ 8 words) with no French stop-word and no French accent.
 */
export function clearlyNotFrench(text: string | undefined): boolean {
  if (!text) return false;
  const words = text
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
  if (words.length < 8) return false;
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return false;
  return !words.some((word) => FRENCH_MARKERS.has(word));
}

/**
 * Removes credentials from text that may end up in a user-facing error:
 * `access_token=…`, `token=…`, `key=…` query values, Bearer headers and
 * Meta / Apify token shapes.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/((?:access_token|token|key|client_secret|fb_exchange_token)=)[^&\s"'<>]+/gi, "$1***")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
    .replace(/\bEAA[A-Za-z0-9]{10,}\b/g, "***")
    .replace(/\bapify_api_[A-Za-z0-9]+\b/g, "***")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "***");
}

/** Runs `task` over `items` with at most `limit` in flight; keeps input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** French-formatted error message of an unknown rejection. */
export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
