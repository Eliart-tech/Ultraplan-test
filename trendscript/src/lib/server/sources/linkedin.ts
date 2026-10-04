/**
 * Shared LinkedIn helpers (pure, browser-safe): post permalinks, the date
 * encoded in every LinkedIn activity id, and the mapping of web-search
 * results to signals.
 *
 * LinkedIn has no public search or trends API. Two real sources are used:
 * public posts indexed by a web search engine (Firecrawl search, no
 * engagement counts) and the Apify actor `harvestapi/linkedin-post-search`
 * (public posts with reactions, comments and reposts).
 */

import { shortHash, truncate } from "../../analysis/text";
import type { Signal, SourceId } from "../../types";
import { captionTitle, DAY_MS, extractHashtags } from "./social-utils";

/** Posts older than this are not trend signals any more. */
export const LINKEDIN_MAX_AGE_DAYS = 14;
/** Keywords searched per analysis (each one is a paid search or actor run). */
export const LINKEDIN_MAX_KEYWORDS = 3;

const ACTIVITY_PATTERNS = [/activity[-:](\d{16,20})/, /urn:li:(?:activity|share|ugcPost):(\d{16,20})/];
/** LinkedIn launched in 2003; ids decoding before that are not activity ids. */
const MIN_ACTIVITY_MS = Date.UTC(2003, 0, 1);

/** Activity id of a post permalink (`…-activity-7510571580230402048-r6io`). */
export function activityIdFromUrl(url: string): string | undefined {
  for (const pattern of ACTIVITY_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Publication time encoded in a LinkedIn activity id: its first 41 bits are
 * a Unix timestamp in milliseconds (id >> 22).
 */
export function activityDate(id: string | undefined, now: number): string | undefined {
  if (!id || !/^\d{16,20}$/.test(id)) return undefined;
  const ms = Number(BigInt(id) >> BigInt(22));
  if (!Number.isFinite(ms) || ms < MIN_ACTIVITY_MS || ms > now + DAY_MS) return undefined;
  return new Date(ms).toISOString();
}

/** Post permalink without tracking parameters; only `/posts/` and `/feed/update/` pages qualify. */
export function linkedinPostUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return undefined;
    if (!/^\/(posts|feed\/update)\//.test(url.pathname)) return undefined;
    return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return undefined;
  }
}

/** Author handle from a `/posts/<handle>_<slug>-activity-…` permalink. */
function handleFromUrl(url: string): string | undefined {
  const match = url.match(/\/posts\/([^_/]+)_/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Web search query restricted to LinkedIn posts. */
export function linkedinSearchQuery(keyword: string): string {
  const clean = keyword.replace(/^#/, "").replace(/"/g, "").trim();
  return `site:linkedin.com/posts ${clean.includes(" ") ? `"${clean}"` : clean}`;
}

/** English country name for search geolocation ("FR" → "France"). */
export function searchLocation(geo: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(geo.toUpperCase());
  } catch {
    return undefined;
  }
}

/** A web search hit (Firecrawl `data.web[]` shape). */
export interface WebSearchHit {
  url: string;
  title?: string;
  description?: string;
}

const AGE_PREFIX = /^\s*(?:(\d+)\s+(minute|hour|day|week|month)s?\s+ago|il y a\s+(\d+)\s+(minute|heure|jour|semaine|mois)s?)\s*[·•-]\s*/i;
const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  heure: 3_600_000,
  day: DAY_MS,
  jour: DAY_MS,
  week: 7 * DAY_MS,
  semaine: 7 * DAY_MS,
  month: 30 * DAY_MS,
  mois: 30 * DAY_MS,
};

/** Splits "4 days ago · text" into an approximate date and the text. */
export function splitAge(description: string, now: number): { text: string; publishedAt?: string } {
  const match = description.match(AGE_PREFIX);
  if (!match) return { text: description.trim() };
  const count = Number(match[1] ?? match[3]);
  const unit = (match[2] ?? match[4]).toLowerCase();
  const ms = UNIT_MS[unit];
  return {
    text: description.slice(match[0].length).trim(),
    publishedAt: ms && Number.isFinite(count) ? new Date(now - count * ms).toISOString() : undefined,
  };
}

/** "Post de Romain Fargeot - LinkedIn" / "Titre | Jézabel Couppey …" → author and real title. */
export function readTitle(title: string): { author?: string; headline?: string } {
  const clean = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, "").trim();
  const postOf = clean.match(/^(?:Post|Publication) de\s+(.+)$/i) ?? clean.match(/^(.+?)'s Post$/i);
  if (postOf) return { author: postOf[1].trim() };
  const piped = clean.match(/^(.+?)\s+\|\s+(.+)$/);
  if (piped) return { headline: piped[1].trim(), author: piped[2].replace(/\s*(…|\.\.\.)$/, "").trim() };
  return { headline: clean || undefined };
}

export interface LinkedinSearchOptions {
  source: SourceId;
  /** The niche keyword the search was run for. */
  query: string;
  now: number;
}

/** Pure: web search hits → LinkedIn post signals (recent posts only, deduped by activity). */
export function linkedinHitsToSignals(hits: WebSearchHit[], { source, query, now }: LinkedinSearchOptions): Signal[] {
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const hit of hits) {
    const url = linkedinPostUrl(hit.url);
    if (!url) continue;
    const activityId = activityIdFromUrl(url);
    const key = activityId ?? url;
    if (seen.has(key)) continue;
    seen.add(key);

    const { text, publishedAt: approxDate } = splitAge(hit.description ?? "", now);
    const publishedAt = activityDate(activityId, now) ?? approxDate;
    if (publishedAt && now - Date.parse(publishedAt) > LINKEDIN_MAX_AGE_DAYS * DAY_MS) continue;

    const { author, headline } = readTitle(hit.title ?? "");
    const excerpt = text.replace(/\s*(…|\.\.\.)$/, "").trim();
    signals.push({
      id: `${source}:${shortHash(key)}`,
      source,
      platform: "linkedin",
      kind: "social_post",
      title:
        headline && !/^(post|publication)\b/i.test(headline)
          ? (truncate(headline, 160) ?? headline)
          : captionTitle(excerpt, "Publication LinkedIn", 160),
      text: truncate(text, 500),
      url,
      author: author ?? handleFromUrl(url),
      publishedAt,
      metrics: {},
      tags: extractHashtags(text, 10),
      related: [],
      query,
      strength: 0,
    });
  }
  return signals;
}
