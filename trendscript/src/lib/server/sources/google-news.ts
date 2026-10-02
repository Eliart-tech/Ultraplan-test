/**
 * Google News RSS: top stories of the country + one search feed per niche
 * keyword (articles of the last 2 days). Measures media coverage, not
 * audience. Article links stay on news.google.com (decoding them to the
 * publisher URL costs two extra requests per article).
 *
 * Licence: the feeds are for personal, non-commercial use only — fine for a
 * single-user tool, not for a commercial SaaS (stated in `meta.costNote`).
 */

import { XMLParser } from "fast-xml-parser";
import { shortHash, truncate } from "../../analysis/text";
import type { RelatedLink, Signal } from "../../types";
import { BROWSER_USER_AGENT, fetchText, SourceError } from "../http";
import { matchKeyword } from "./google-trends";
import type { SourceConnector, SourceContext } from "./types";

const NEWS_BASE = "https://news.google.com/rss";
/** Search feeds return up to 100 items in relevance order. */
const MAX_PER_KEYWORD = 25;
const MAX_KEYWORDS = 8;
const CONCURRENCY = 4;

export interface NewsLocale {
  hl: string;
  gl: string;
  ceid: string;
}

/** Google needs hl, gl and ceid together, otherwise it serves the en-US edition. */
export function newsLocale(geo: string, language: string): NewsLocale {
  const gl = geo.trim().toUpperCase() || "FR";
  const lang = language.trim().toLowerCase() || "fr";
  const hl = lang === "en" ? `en-${gl}` : lang === "fr" && gl === "CA" ? "fr-CA" : lang;
  return { hl, gl, ceid: `${gl}:${lang}` };
}

function localeQuery({ hl, gl, ceid }: NewsLocale): string {
  // ceid keeps its literal colon, as in Google's own links.
  return `hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${ceid}`;
}

export function topStoriesUrl(locale: NewsLocale): string {
  return `${NEWS_BASE}?${localeQuery(locale)}`;
}

export function searchUrl(query: string, locale: NewsLocale, when?: string): string {
  const q = when ? `${query} when:${when}` : query;
  return `${NEWS_BASE}/search?q=${encodeURIComponent(q)}&${localeQuery(locale)}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "item",
});

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
};

/** Decodes the HTML entities left inside the (already XML-decoded) description. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function cleanHtmlText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Top-story descriptions hold a cluster of up to 5 headlines
 * (`<ol><li><a href>Title</a>&nbsp;&nbsp;<font>Source</font></li>…</ol>`).
 */
export function parseClusterHtml(html: string): RelatedLink[] {
  const links: RelatedLink[] = [];
  const pattern = /<li>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:\s|&nbsp;)*(?:<font[^>]*>([\s\S]*?)<\/font>)?\s*<\/li>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = decodeHtmlEntities(match[1]);
    const title = cleanHtmlText(match[2]);
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const source = match[3] ? cleanHtmlText(match[3]) : "";
    links.push({ title, url, source: source || undefined });
  }
  return links;
}

export interface NewsItem {
  title: string;
  link: string;
  source?: string;
  /** Publisher home page (not the article). */
  sourceUrl?: string;
  /** ISO 8601. */
  publishedAt?: string;
  /** Other headlines of the same story (top stories only), main article excluded. */
  cluster: RelatedLink[];
  /** 1-based position in the feed (Google's own ranking). */
  position: number;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text": unknown })["#text"]);
  return "";
}

/** Titles always end with " - <source>": strip it without splitting on other dashes. */
function stripSourceSuffix(title: string, source: string | undefined): string {
  if (source && title.endsWith(` - ${source}`)) return title.slice(0, -(source.length + 3)).trim();
  return title;
}

export function parseNewsRss(xml: string): NewsItem[] {
  let document: unknown;
  try {
    document = parser.parse(xml);
  } catch {
    throw new SourceError("Google Actualités a renvoyé un flux illisible");
  }
  const channel = (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel;
  if (!channel || typeof channel !== "object") throw new SourceError("Google Actualités a renvoyé un flux inattendu");
  const items = Array.isArray(channel.item) ? (channel.item as Record<string, unknown>[]) : [];

  const result: NewsItem[] = [];
  items.forEach((item, index) => {
    const link = text(item.link);
    const source = text(item.source) || undefined;
    const title = stripSourceSuffix(decodeHtmlEntities(text(item.title)), source);
    if (!title || !/^https?:\/\//i.test(link)) return;
    const sourceUrl = item.source && typeof item.source === "object" ? text((item.source as Record<string, unknown>)["@_url"]) : "";
    const published = Date.parse(text(item.pubDate));
    result.push({
      title,
      link,
      source,
      sourceUrl: sourceUrl || undefined,
      publishedAt: Number.isNaN(published) ? undefined : new Date(published).toISOString(),
      cluster: parseClusterHtml(text(item.description)).filter((related) => related.url !== link),
      position: index + 1,
    });
  });
  return result;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

function describeItem(item: NewsItem): string | undefined {
  if (item.cluster.length === 0) return undefined;
  const outlets = [...new Set([item.source, ...item.cluster.map((related) => related.source)].filter(Boolean))];
  return `Sujet à la une repris par ${outlets.length} médias (${outlets.join(", ")}).`;
}

export function newsItemToSignal(item: NewsItem, query?: string): Signal {
  return {
    id: `google_news:${shortHash(item.link)}`,
    source: "google_news",
    platform: "news",
    kind: "news",
    title: item.title,
    text: truncate(describeItem(item)),
    url: item.link,
    author: item.source,
    publishedAt: item.publishedAt,
    metrics: { rank: item.position },
    tags: [],
    related: item.cluster,
    query,
    strength: 0,
  };
}

const byDateDesc = (a: NewsItem, b: NewsItem) =>
  (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0);

async function fetchFeed(url: string, signal: AbortSignal): Promise<NewsItem[]> {
  const xml = await fetchText(url, "Google Actualités", {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/rss+xml, application/xml;q=0.9" },
    signal,
    timeoutMs: 15_000,
  });
  return parseNewsRss(xml);
}

export interface SearchNewsOptions {
  geo: string;
  language: string;
  signal: AbortSignal;
  /** Max items returned, most recent first (default 25). */
  limit?: number;
  /** Google `when:` window, e.g. "1d", "2d", "7d" (default "7d"). Empty string = no window. */
  when?: string;
}

/**
 * Google News search for one query, most recent first. Used by the connector
 * (per niche keyword, `when: "2d"`) and by the script research step (headlines
 * about the chosen topic). Throws SourceError on network/HTTP errors.
 */
export async function searchGoogleNews(
  query: string,
  { geo, language, signal, limit = MAX_PER_KEYWORD, when = "7d" }: SearchNewsOptions,
): Promise<Signal[]> {
  const clean = query.replace(/^#/, "").trim();
  if (!clean) return [];
  const items = await fetchFeed(searchUrl(clean, newsLocale(geo, language), when || undefined), signal);
  return items
    .sort(byDateDesc)
    .slice(0, Math.max(0, limit))
    .map((item) => newsItemToSignal(item, query));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function reason(error: unknown): string {
  if (error instanceof SourceError && error.status) return `erreur HTTP ${error.status}`;
  return error instanceof Error ? error.message : String(error);
}

type Job = { kind: "top" } | { kind: "keyword"; keyword: string };

export const googleNewsConnector: SourceConnector = {
  id: "google_news",
  meta: {
    label: "Google Actualités",
    platform: "news",
    free: true,
    needsKeywords: false,
    description:
      "Articles à la une dans le pays (avec le nombre de médias qui couvrent chaque sujet) et, pour chaque mot-clé de niche, les articles des 2 derniers jours. Mesure la couverture médiatique, pas l'audience.",
    envVars: [],
    setup: [
      "Aucune configuration : flux RSS gratuits et sans clé.",
      "Ajoutez des mots-clés de niche pour obtenir aussi les articles récents sur vos thèmes (25 maximum par mot-clé).",
    ],
    costNote:
      "Gratuit. Licence Google des flux RSS : usage personnel et non commercial uniquement — adapté à un outil personnel, pas à un service commercial.",
    docsUrl: "https://news.google.com/",
    ttlMs: 10 * 60_000,
  },
  isConfigured: () => true,
  async fetch(ctx: SourceContext) {
    const locale = newsLocale(ctx.geo, ctx.language);
    const keywords = [...new Set(ctx.keywords.map((keyword) => keyword.replace(/^#/, "").trim()).filter(Boolean))].slice(
      0,
      MAX_KEYWORDS,
    );
    const jobs: Job[] = [{ kind: "top" }, ...keywords.map((keyword): Job => ({ kind: "keyword", keyword }))];

    const results = await mapWithConcurrency(jobs, CONCURRENCY, async (job) => {
      if (job.kind === "top") return fetchFeed(topStoriesUrl(locale), ctx.signal);
      return searchGoogleNews(job.keyword, { geo: ctx.geo, language: ctx.language, signal: ctx.signal, when: "2d" });
    });

    const byUrl = new Map<string, Signal>();
    const failures: string[] = [];
    results.forEach((result, index) => {
      const job = jobs[index];
      if (result.status === "rejected") {
        failures.push(`${job.kind === "top" ? "« À la une »" : `« ${job.keyword} »`} (${reason(result.reason)})`);
        return;
      }
      const signals =
        job.kind === "top"
          ? (result.value as NewsItem[]).map((item) =>
              newsItemToSignal(item, matchKeyword(keywords, [item.title, ...item.cluster.map((related) => related.title)])),
            )
          : (result.value as Signal[]);
      for (const signal of signals) {
        const existing = byUrl.get(signal.url ?? signal.id);
        if (!existing) byUrl.set(signal.url ?? signal.id, signal);
        else if (!existing.query && signal.query) existing.query = signal.query;
      }
    });

    if (failures.length === jobs.length) {
      const first = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      throw first.reason instanceof SourceError
        ? first.reason
        : new SourceError(`Google Actualités indisponible : ${reason(first.reason)}`);
    }
    return {
      signals: [...byUrl.values()],
      warning: failures.length ? `Flux Google Actualités en échec : ${failures.join(", ")}.` : undefined,
    };
  },
};
