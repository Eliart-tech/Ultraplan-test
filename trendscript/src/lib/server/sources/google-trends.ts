/**
 * Google Trends "Tendances du moment" (Trending now).
 *
 * Primary: the internal RPC `i0OFE` behind trends.google.com/trending — the
 * full list for the last 24 h (~100+ trends for FR) with volume bucket,
 * increase %, active/ended state, categories, related queries and news.
 * It is undocumented, so its shape is validated strictly; on any failure we
 * fall back to the official RSS feed, which only carries the 10 most recently
 * started trends, and say so in a warning.
 */

import { XMLParser } from "fast-xml-parser";
import { shortHash, stripAccents, truncate } from "../../analysis/text";
import type { RelatedLink, Signal, SourceId } from "../../types";
import { BROWSER_USER_AGENT, fetchText, SourceError } from "../http";
import type { SourceConnector, SourceContext } from "./types";

const RPC_URL = "https://trends.google.com/_/TrendsUi/data/batchexecute";
const RPC_ID = "i0OFE";
const RSS_URL = "https://trends.google.com/trending/rss";
/** Volumes depend on the window: always use the same one so they stay comparable. */
const HOURS = 24;
const NUM_NEWS = 3;
/** Above this share of malformed rows we assume Google changed the format. */
const MAX_INVALID_ROW_SHARE = 0.2;
const MAX_NEWS_PER_TREND = 5;
const MAX_TAGS = 10;
const HOUR_MS = 3_600_000;

/** Trending-now category ids (no id 12) — French labels for the UI and prompts. */
export const TRENDS_CATEGORY_LABELS: Readonly<Record<number, string>> = {
  1: "Auto & véhicules",
  2: "Beauté & mode",
  3: "Économie & finance",
  4: "Divertissement",
  5: "Cuisine & boissons",
  6: "Jeux",
  7: "Santé",
  8: "Loisirs",
  9: "Emploi & éducation",
  10: "Droit & institutions",
  11: "Autre",
  13: "Animaux",
  14: "Politique",
  15: "Sciences",
  16: "Shopping",
  17: "Sport",
  18: "Technologie",
  19: "Voyages & transports",
  20: "Climat",
};

/** One trending search, whatever the upstream (RPC, RSS or SerpApi). */
export interface TrendingSearch {
  query: string;
  /** Lower-case, accent-free form used to merge spelling variants. */
  normalized: string;
  /** Epoch ms of the trend start (10-minute buckets). */
  startedAt?: number;
  /** Epoch ms of the end; undefined while the trend is still active. */
  endedAt?: number;
  /** Lower bound of the volume bucket ("20000+" → 20000). */
  searchVolume?: number;
  increasePct?: number;
  breakdown: string[];
  categoryIds: number[];
  news: RelatedLink[];
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

/** "1000+", "20K+", "1M+", "1 000+", "1,5 M+", 50000 → number (null if unreadable). */
export function parseApproxTraffic(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const compact = raw.normalize("NFKC").replace(/\s/g, "").replace(/\+$/, "").toUpperCase();
  const match = compact.match(/^(\d+(?:[.,]\d+)*)(K|M|MIO|MD|B)?$/);
  if (!match) return null;
  const multiplier = { K: 1e3, M: 1e6, MIO: 1e6, MD: 1e9, B: 1e9 }[match[2] ?? ""] ?? 1;
  // Without a suffix, separators are thousands separators ("1,000"); with one, a decimal mark ("1,5M").
  const value =
    multiplier === 1 ? Number(match[1].replace(/[.,]/g, "")) : Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

export function normalizeQuery(value: string): string {
  return stripAccents(value.toLowerCase()).replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return ` ${stripAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/**
 * First niche keyword found (whole words, accent-insensitive) in the given
 * texts — lets the analysis know which free, non keyword-driven signals
 * touch the creator's niche.
 */
export function matchKeyword(keywords: string[], texts: (string | undefined)[]): string | undefined {
  const haystack = texts.filter((value): value is string => Boolean(value)).map(normalizeForMatch).join(" ");
  for (const keyword of keywords) {
    const needle = normalizeForMatch(keyword.replace(/^#/, ""));
    if (needle.trim() && haystack.includes(needle)) return keyword;
  }
  return undefined;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

const formatNumber = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

function formatHours(ms: number): string {
  const hours = ms / HOUR_MS;
  if (hours < 1) return "moins d'1 h";
  return `${Math.round(hours)} h`;
}

/** "01/10 17:50 UTC" — trends often span midnight, so keep the day. */
function utcTime(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)} UTC`;
}

class TrendsFormatError extends SourceError {
  constructor(message: string, readonly upstreamCode?: number) {
    super(message);
    this.name = "TrendsFormatError";
  }
}

// ---------------------------------------------------------------------------
// RPC i0OFE
// ---------------------------------------------------------------------------

/**
 * Extracts the payload string of one RPC from a batchexecute body. Handles
 * the plain format (`)]}'` + one JSON array) and the chunked `rt=c` format.
 * Throws when the envelope is missing or empty — Google's error code (3 =
 * invalid argument, e.g. unsupported country) is kept in `upstreamCode`.
 */
export function decodeBatchExecute(body: string, rpcId: string): string {
  const stripped = body.replace(/^\s*\)\]\}'/, "").trim();
  const chunks: unknown[] = [];
  try {
    chunks.push(JSON.parse(stripped));
  } catch {
    for (const line of stripped.split("\n")) {
      if (!line.trim().startsWith("[")) continue;
      try {
        chunks.push(JSON.parse(line));
      } catch {
        // not a JSON line (chunk length) — skip
      }
    }
  }

  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;
    for (const envelope of chunk) {
      if (!Array.isArray(envelope) || envelope[0] !== "wrb.fr" || envelope[1] !== rpcId) continue;
      if (typeof envelope[2] === "string") return envelope[2];
      const code = Array.isArray(envelope[5]) && typeof envelope[5][0] === "number" ? envelope[5][0] : undefined;
      throw new TrendsFormatError(`réponse vide${code !== undefined ? ` (code ${code})` : ""}`, code);
    }
  }
  throw new TrendsFormatError("format de réponse inattendu (enveloppe absente)");
}

const isEpochSeconds = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 1_000_000_000 && value < 4_000_000_000;

const isTimestampTuple = (value: unknown): value is [number] =>
  Array.isArray(value) && isEpochSeconds(value[0]);

const isOptionalNumber = (value: unknown) => value == null || (typeof value === "number" && Number.isFinite(value));

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

/** Inline news: `[title, url, sourceName, [unixSec], imageUrl]`. Invalid entries are skipped. */
function parseRpcNews(value: unknown): { news: RelatedLink[]; image?: string } {
  if (!Array.isArray(value)) return { news: [] };
  const news: RelatedLink[] = [];
  let image: string | undefined;
  for (const item of value) {
    if (!Array.isArray(item) || typeof item[0] !== "string" || !isHttpUrl(item[1])) continue;
    news.push({
      title: item[0].trim(),
      url: item[1],
      source: typeof item[2] === "string" && item[2].trim() ? item[2].trim() : undefined,
    });
    if (!image && isHttpUrl(item[4])) image = item[4];
  }
  return { news, image };
}

/** Validates one 13-field row; returns null when the shape is not the expected one. */
export function parseRpcRow(row: unknown): TrendingSearch | null {
  if (!Array.isArray(row) || row.length < 12) return null;
  const [query, news, , start, end, , volume, , increase, breakdown, categories, , normalized] = row as unknown[];
  if (typeof query !== "string" || !query.trim()) return null;
  if (!isTimestampTuple(start)) return null;
  if (end !== null && end !== undefined && !isTimestampTuple(end)) return null;
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) return null;
  if (!isOptionalNumber(increase)) return null;
  const breakdownList = breakdown == null ? [] : breakdown;
  const categoryList = categories == null ? [] : categories;
  if (!isStringArray(breakdownList) || !isNumberArray(categoryList)) return null;
  if (news != null && !Array.isArray(news)) return null;
  if (normalized != null && typeof normalized !== "string") return null;

  const { news: links, image } = parseRpcNews(news);
  return {
    query: query.trim(),
    normalized: normalizeQuery(typeof normalized === "string" && normalized.trim() ? normalized : query),
    startedAt: start[0] * 1000,
    endedAt: isTimestampTuple(end) ? end[0] * 1000 : undefined,
    searchVolume: volume,
    increasePct: typeof increase === "number" ? increase : undefined,
    breakdown: breakdownList.map((item) => item.trim()).filter(Boolean),
    categoryIds: categoryList,
    news: links,
    thumbnailUrl: image,
  };
}

/** Parses an `i0OFE` batchexecute body. Throws when the format looks changed. */
export function parseTrendsRpc(body: string): TrendingSearch[] {
  const payloadText = decodeBatchExecute(body, RPC_ID);
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    throw new TrendsFormatError("charge utile illisible");
  }
  if (!Array.isArray(payload)) throw new TrendsFormatError("charge utile inattendue");
  const rows = payload[1];
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new TrendsFormatError("liste des tendances absente");

  const parsed = rows.map(parseRpcRow);
  const valid = parsed.filter((trend): trend is TrendingSearch => trend !== null);
  const invalid = rows.length - valid.length;
  if (rows.length > 0 && invalid / rows.length > MAX_INVALID_ROW_SHARE) {
    throw new TrendsFormatError(`format modifié (${invalid}/${rows.length} lignes illisibles)`);
  }
  return valid;
}

// ---------------------------------------------------------------------------
// RSS fallback
// ---------------------------------------------------------------------------

const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep "2026" (a real trend title) as a string.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "item" || name === "ht:news_item",
});

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text": unknown })["#text"]);
  return "";
}

/** Parses the official Trends RSS feed (10 newest trends, no increase %, no categories). */
export function parseTrendsRss(xml: string): TrendingSearch[] {
  let document: unknown;
  try {
    document = rssParser.parse(xml);
  } catch {
    throw new TrendsFormatError("flux RSS illisible");
  }
  const channel = (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel;
  if (!channel || typeof channel !== "object") throw new TrendsFormatError("flux RSS inattendu");
  const items = Array.isArray(channel.item) ? channel.item : [];

  const trends: TrendingSearch[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const query = text(item.title);
    if (!query) continue;
    const started = Date.parse(text(item.pubDate));
    const newsItems = Array.isArray(item["ht:news_item"]) ? (item["ht:news_item"] as Record<string, unknown>[]) : [];
    const news: RelatedLink[] = newsItems
      .map((news) => ({
        title: text(news["ht:news_item_title"]),
        url: text(news["ht:news_item_url"]),
        source: text(news["ht:news_item_source"]) || undefined,
      }))
      .filter((news) => news.title && isHttpUrl(news.url));
    const picture = text(item["ht:picture"]);
    trends.push({
      query,
      normalized: normalizeQuery(query),
      startedAt: Number.isNaN(started) ? undefined : started,
      searchVolume: parseApproxTraffic(text(item["ht:approx_traffic"])) ?? undefined,
      breakdown: [],
      categoryIds: [],
      news,
      thumbnailUrl: isHttpUrl(picture) ? picture : undefined,
    });
  }
  return trends;
}

// ---------------------------------------------------------------------------
// Normalisation into signals
// ---------------------------------------------------------------------------

const isActive = (trend: TrendingSearch) => trend.endedAt === undefined;

function preferred(a: TrendingSearch, b: TrendingSearch): TrendingSearch {
  if (isActive(a) !== isActive(b)) return isActive(a) ? a : b;
  if ((a.searchVolume ?? 0) !== (b.searchVolume ?? 0)) return (a.searchVolume ?? 0) > (b.searchVolume ?? 0) ? a : b;
  return (a.startedAt ?? 0) >= (b.startedAt ?? 0) ? a : b;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const maxDefined = (a?: number, b?: number) =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

/**
 * Merges spelling variants and repeated episodes of the same query
 * ("tadej pogacar" / "tadej pogačar"): keeps the active (else biggest)
 * episode as the base and unions the evidence.
 */
export function dedupeTrends(trends: TrendingSearch[]): TrendingSearch[] {
  const byKey = new Map<string, TrendingSearch>();
  for (const trend of trends) {
    const existing = byKey.get(trend.normalized);
    if (!existing) {
      byKey.set(trend.normalized, trend);
      continue;
    }
    const base = preferred(existing, trend);
    const other = base === existing ? trend : existing;
    byKey.set(trend.normalized, {
      ...base,
      searchVolume: maxDefined(base.searchVolume, other.searchVolume),
      increasePct: maxDefined(base.increasePct, other.increasePct),
      breakdown: uniqueBy([...base.breakdown, ...other.breakdown], normalizeQuery),
      categoryIds: [...new Set([...base.categoryIds, ...other.categoryIds])],
      news: uniqueBy([...base.news, ...other.news], (news) => news.url).slice(0, MAX_NEWS_PER_TREND),
      thumbnailUrl: base.thumbnailUrl ?? other.thumbnailUrl,
    });
  }
  return [...byKey.values()];
}

export function exploreUrl(query: string, geo: string): string {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}&geo=${encodeURIComponent(geo)}&date=now%201-d`;
}

function describeTrend(trend: TrendingSearch, geo: string, now: number): string {
  const parts = [`Recherche en hausse sur Google (${geo})`];
  if (trend.searchVolume !== undefined) {
    parts.push(`plus de ${formatNumber(trend.searchVolume)} recherches (fenêtre de ${HOURS} h)`);
  }
  if (trend.increasePct !== undefined) {
    parts.push(`hausse de +${formatNumber(trend.increasePct)} %${trend.increasePct >= 1000 ? " (plafond affiché par Google)" : ""}`);
  }
  if (trend.startedAt !== undefined) {
    if (trend.endedAt !== undefined) {
      parts.push(
        `tendance terminée (active ${formatHours(trend.endedAt - trend.startedAt)}, du ${utcTime(trend.startedAt)} au ${utcTime(trend.endedAt)})`,
      );
    } else {
      parts.push(`en cours depuis ${formatHours(Math.max(0, now - trend.startedAt))} (début ${utcTime(trend.startedAt)})`);
    }
  }
  const categories = trend.categoryIds.map((id) => TRENDS_CATEGORY_LABELS[id]).filter(Boolean);
  if (categories.length) parts.push(`catégories : ${categories.join(", ")}`);
  const related = trend.breakdown.filter((item) => normalizeQuery(item) !== trend.normalized).slice(0, 5);
  if (related.length) parts.push(`recherches associées : ${related.join(", ")}`);
  return parts.join(" · ");
}

export interface TrendSignalOptions {
  source: SourceId;
  geo: string;
  now: number;
  keywords: string[];
}

export function trendToSignal(trend: TrendingSearch, { source, geo, now, keywords }: TrendSignalOptions): Signal {
  const url = exploreUrl(trend.query, geo);
  const tags = uniqueBy(
    trend.breakdown
      .map((item) => item.toLowerCase().replace(/^#/, "").trim())
      .filter((item) => item && normalizeQuery(item) !== trend.normalized),
    normalizeQuery,
  ).slice(0, MAX_TAGS);
  const metrics: Signal["metrics"] = {};
  if (trend.searchVolume !== undefined) metrics.searchVolume = trend.searchVolume;
  if (trend.increasePct !== undefined) metrics.increasePct = trend.increasePct;

  return {
    id: `${source}:${shortHash(url)}`,
    source,
    platform: "google",
    kind: "search_trend",
    title: trend.query,
    text: truncate(describeTrend(trend, geo, now)),
    url,
    thumbnailUrl: trend.thumbnailUrl,
    publishedAt: trend.startedAt !== undefined ? new Date(trend.startedAt).toISOString() : undefined,
    metrics,
    tags,
    related: trend.news.slice(0, MAX_NEWS_PER_TREND),
    query: matchKeyword(keywords, [trend.query, ...trend.breakdown, ...trend.news.map((news) => news.title)]),
    strength: 0,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new SourceError("Requête annulée"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SourceError("Requête annulée"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchRpc(geo: string, language: string, signal: AbortSignal): Promise<TrendingSearch[]> {
  const inner = JSON.stringify([null, null, geo, NUM_NEWS, language, HOURS, 1]);
  const fReq = JSON.stringify([[[RPC_ID, inner, null, "generic"]]]);
  const url = `${RPC_URL}?rpcids=${RPC_ID}&source-path=%2Ftrending&hl=${encodeURIComponent(language)}`;
  const body = await fetchText(url, "Google Trends (liste complète)", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": BROWSER_USER_AGENT,
      "Accept-Language": `${language},en;q=0.5`,
    },
    body: new URLSearchParams({ "f.req": fReq }).toString(),
    signal,
    timeoutMs: 25_000,
  });
  return parseTrendsRpc(body);
}

/** Official RSS feed: the 10 most recently started trends. Exported for the live test. */
export async function fetchTrendsRss(geo: string, signal: AbortSignal): Promise<TrendingSearch[]> {
  const xml = await fetchText(`${RSS_URL}?geo=${encodeURIComponent(geo)}`, "Google Trends (RSS)", {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/rss+xml, application/xml;q=0.9" },
    signal,
    timeoutMs: 15_000,
  });
  return parseTrendsRss(xml);
}

/** Short reason for warnings: never dump Google's HTML error pages to the UI. */
function reason(error: unknown): string {
  if (error instanceof SourceError && error.status) return `erreur HTTP ${error.status}`;
  return error instanceof Error ? error.message : String(error);
}

const isUnsupportedGeo = (error: unknown) =>
  (error instanceof TrendsFormatError && error.upstreamCode === 3) ||
  (error instanceof SourceError && error.status === 400);

export interface LoadOptions {
  /** Delay before the single retry of the RPC on 429/5xx/network errors. */
  retryDelayMs?: number;
}

export interface GoogleTrendsResult {
  trends: TrendingSearch[];
  /** "rpc" = full list; "rss" = 10 newest trends only. */
  via: "rpc" | "rss";
  warning?: string;
}

/** Fetches the trending list with the RPC → RSS fallback. Exported for tests. */
export async function loadGoogleTrends(
  geo: string,
  language: string,
  signal: AbortSignal,
  { retryDelayMs = 2_000 }: LoadOptions = {},
): Promise<GoogleTrendsResult> {
  let rpcError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const trends = await fetchRpc(geo, language, signal);
      if (trends.length === 0) throw new TrendsFormatError("aucune tendance renvoyée");
      return { trends, via: "rpc" };
    } catch (error) {
      rpcError = error;
      const retryable = error instanceof SourceError && error.retryable;
      if (!retryable || attempt === 1 || signal.aborted) break;
      await sleep(retryDelayMs, signal);
    }
  }
  if (signal.aborted) throw rpcError;

  try {
    const trends = await fetchTrendsRss(geo, signal);
    return {
      trends,
      via: "rss",
      warning:
        `Liste complète Google Trends indisponible (${reason(rpcError)}) : repli sur le flux RSS officiel, ` +
        `limité aux 10 tendances les plus récentes, sans % de hausse ni catégories.`,
    };
  } catch (rssError) {
    if (isUnsupportedGeo(rpcError) && isUnsupportedGeo(rssError)) {
      throw new SourceError(`Google Trends ne publie pas de tendances pour le pays « ${geo} ».`, 400);
    }
    throw new SourceError(
      `Google Trends indisponible : liste complète (${reason(rpcError)}), puis flux RSS (${reason(rssError)}).`,
      rssError instanceof SourceError ? rssError.status : undefined,
      rssError instanceof SourceError ? rssError.retryable : false,
    );
  }
}

export const googleTrendsConnector: SourceConnector = {
  id: "google_trends",
  meta: {
    label: "Google Trends — Tendances du moment",
    platform: "google",
    free: true,
    needsKeywords: false,
    description:
      "Recherches Google en forte hausse dans le pays sur les dernières 24 h : volume approximatif, % de hausse, statut (en cours ou terminée), catégories et articles liés. Mesure la curiosité des internautes, pas la viralité sur les réseaux sociaux.",
    envVars: [],
    setup: [
      "Aucune configuration : source gratuite et sans clé.",
      "TrendScript lit la liste complète de la page « Tendances du moment » de Google Trends (environ 100 tendances par jour pour la France).",
      "Si Google modifie ce format non documenté, repli automatique sur le flux RSS officiel (10 tendances les plus récentes seulement), signalé par un avertissement.",
    ],
    costNote:
      "Gratuit. Point d'accès interne non documenté par Google : il peut changer sans préavis (repli RSS automatique).",
    docsUrl: "https://trends.google.com/trending?geo=FR&hours=24",
    ttlMs: 10 * 60_000,
  },
  isConfigured: () => true,
  async fetch(ctx: SourceContext) {
    const geo = ctx.geo.trim().toUpperCase();
    const language = ctx.language.trim().toLowerCase() || "fr";
    const { trends, warning } = await loadGoogleTrends(geo, language, ctx.signal);
    const signals = dedupeTrends(trends)
      .map((trend) => trendToSignal(trend, { source: "google_trends", geo, now: ctx.now, keywords: ctx.keywords }))
      .sort((a, b) => (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0));
    return { signals, warning };
  },
};
