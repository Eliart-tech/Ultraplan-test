/**
 * SerpApi (paid, licensed access to Google Trends):
 * - `google_trends_trending_now`: the same "Tendances du moment" list as the
 *   free connector, through a provider that takes the legal/scraping risk;
 * - `google_trends` RELATED_QUERIES (7 days) for up to 3 niche keywords: the
 *   rising searches around the creator's themes.
 * Every call costs one search (free plan: 250/month), so the run is capped
 * at 1 + 3 searches and cached for an hour by the orchestrator.
 */

import { shortHash, truncate } from "../../analysis/text";
import type { Signal } from "../../types";
import { fetchWithTimeout, SourceError } from "../http";
import { dedupeTrends, exploreUrl, normalizeQuery, trendToSignal, type TrendingSearch } from "./google-trends";
import type { Env, SourceConnector, SourceContext } from "./types";

const SERPAPI_URL = "https://serpapi.com/search.json";
const MAX_KEYWORDS = 3;
const MAX_RISING_PER_KEYWORD = 10;
/** Google labels > 5000 % growth "Breakout" ("Record" in the French UI). */
const BREAKOUT_PATTERN = /breakout|record|rekord|repentin/i;

export interface RelatedQuery {
  query: string;
  /** Display label from Google ("+4,500%", "Breakout", "100"). */
  value: string;
  /** Rising: % increase; top: 0–100 relative interest. */
  extractedValue?: number;
  /** Growth > 5000 % ("Record" / "Breakout"). */
  breakout: boolean;
  /** Google Trends explore link. */
  link?: string;
}

export interface RelatedQueries {
  rising: RelatedQuery[];
  top: RelatedQuery[];
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export function getApiKey(env: Env): string | undefined {
  return env.SERPAPI_API_KEY?.trim() || undefined;
}

/** Never let the key leak into a message shown in the UI. */
function scrub(message: string): string {
  return message.replace(/api_key=[^&\s"]+/gi, "api_key=***");
}

const NO_RESULTS = /hasn't returned any results|no results/i;

function describeHttpError(status: number, error: string | undefined): string {
  if (status === 401) return "Clé SerpApi invalide : vérifiez SERPAPI_API_KEY.";
  if (status === 403) return "Compte SerpApi bloqué ou suspendu (403) : vérifiez votre compte sur serpapi.com.";
  if (status === 429) {
    return error && /run out of searches/i.test(error)
      ? "Crédits SerpApi épuisés pour ce mois : changez d'offre ou attendez le renouvellement."
      : "Limite horaire SerpApi atteinte : réessayez dans une heure.";
  }
  return `SerpApi a répondu ${status}${error ? ` : ${scrub(error)}` : ""}`;
}

/**
 * GET search.json and return the parsed body. `{ error: "…" }` bodies become
 * SourceErrors, except "no results", returned as `null` (a legit empty answer).
 */
async function serpapiGet(
  params: Record<string, string>,
  apiKey: string,
  signal: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({ ...params, api_key: apiKey });
  let response: Response;
  try {
    response = await fetchWithTimeout(`${SERPAPI_URL}?${query}`, {
      headers: { Accept: "application/json" },
      signal,
      timeoutMs: 45_000,
    });
  } catch (error) {
    if (error instanceof SourceError) throw new SourceError(scrub(error.message), error.status, error.retryable);
    throw error;
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = undefined;
  }
  const error = typeof body?.error === "string" ? body.error : undefined;

  if (!response.ok) {
    if (response.status === 400 && error && NO_RESULTS.test(error)) return null;
    throw new SourceError(describeHttpError(response.status, error), response.status, response.status === 429 || response.status >= 500);
  }
  if (!body) throw new SourceError("SerpApi a renvoyé une réponse JSON invalide");
  if (error) {
    if (NO_RESULTS.test(error)) return null;
    throw new SourceError(`SerpApi : ${scrub(error)}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** `trending_searches[]` of `google_trends_trending_now` → normalized trends. */
export function parseTrendingNow(json: unknown): TrendingSearch[] {
  const list = (json as { trending_searches?: unknown })?.trending_searches;
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new SourceError("SerpApi a renvoyé une liste de tendances inattendue");

  const trends: TrendingSearch[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    if (typeof raw?.query !== "string" || !raw.query.trim()) continue;
    const start = finite(raw.start_timestamp);
    const end = finite(raw.end_timestamp);
    const categories = Array.isArray(raw.categories)
      ? (raw.categories as { id?: unknown }[]).map((category) => finite(category?.id)).filter((id): id is number => id !== undefined)
      : [];
    trends.push({
      query: raw.query.trim(),
      normalized: normalizeQuery(raw.query),
      startedAt: start !== undefined ? start * 1000 : undefined,
      // `end_timestamp` is only present once the trend has ended.
      endedAt: raw.active === false && end !== undefined ? end * 1000 : undefined,
      searchVolume: finite(raw.search_volume),
      increasePct: finite(raw.increase_percentage),
      breakdown: Array.isArray(raw.trend_breakdown)
        ? (raw.trend_breakdown as unknown[]).filter((item): item is string => typeof item === "string" && item.trim() !== "")
        : [],
      categoryIds: categories,
      news: [],
    });
  }
  return trends;
}

function parseRelatedList(value: unknown): RelatedQuery[] {
  if (!Array.isArray(value)) return [];
  return (value as Record<string, unknown>[])
    .filter((item) => typeof item?.query === "string" && item.query.trim() !== "")
    .map((item) => {
      const label = typeof item.value === "string" ? item.value : String(item.value ?? "");
      const extractedValue = finite(item.extracted_value);
      return {
        query: (item.query as string).trim(),
        value: label,
        extractedValue,
        breakout: BREAKOUT_PATTERN.test(label),
        link: typeof item.link === "string" && /^https:\/\//.test(item.link) ? item.link : undefined,
      };
    });
}

/** `related_queries` of `google_trends` (RELATED_QUERIES); missing lists → []. */
export function parseRelatedQueries(json: unknown): RelatedQueries {
  const related = (json as { related_queries?: { rising?: unknown; top?: unknown } } | null)?.related_queries;
  return { rising: parseRelatedList(related?.rising), top: parseRelatedList(related?.top) };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export interface RelatedQueriesOptions {
  geo: string;
  language: string;
  signal: AbortSignal;
  apiKey: string;
  /** Google Trends window (default "now 7-d"). */
  date?: string;
}

/**
 * Rising and top Google searches related to `q` (1 SerpApi search). Used by
 * the connector and by the script step (words to say/show for search SEO).
 */
export async function serpapiRelatedQueries(
  q: string,
  { geo, language, signal, apiKey, date = "now 7-d" }: RelatedQueriesOptions,
): Promise<RelatedQueries> {
  const json = await serpapiGet(
    {
      engine: "google_trends",
      data_type: "RELATED_QUERIES",
      q: q.replace(/^#/, "").trim(),
      geo: geo.toUpperCase(),
      hl: language.toLowerCase(),
      date,
    },
    apiKey,
    signal,
  );
  return json ? parseRelatedQueries(json) : { rising: [], top: [] };
}

function growthLabel(item: RelatedQuery): string {
  if (item.breakout) return "« Record » (hausse de plus de 5 000 %)";
  if (item.extractedValue !== undefined) return `+${new Intl.NumberFormat("fr-FR").format(item.extractedValue)} %`;
  return item.value;
}

export function risingQueryToSignal(
  item: RelatedQuery,
  { keyword, geo, position }: { keyword: string; geo: string; position: number },
): Signal {
  const url = item.link ?? exploreUrl(item.query, geo);
  const metrics: Signal["metrics"] = { rank: position };
  if (item.extractedValue !== undefined) metrics.increasePct = item.extractedValue;
  return {
    id: `serpapi_trends:${shortHash(`${keyword}|${url}`)}`,
    source: "serpapi_trends",
    platform: "google",
    kind: "search_trend",
    title: item.query,
    text: truncate(
      `Recherche Google en forte hausse associée à « ${keyword} » (${geo}, 7 derniers jours) : ${growthLabel(item)}.`,
    ),
    url,
    metrics,
    tags: [keyword.toLowerCase().replace(/^#/, "")],
    related: [],
    query: keyword,
    strength: 0,
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const serpapiTrendsConnector: SourceConnector = {
  id: "serpapi_trends",
  meta: {
    label: "SerpApi — Google Trends",
    platform: "google",
    free: false,
    needsKeywords: false,
    description:
      "Liste « Tendances du moment » de Google Trends via un fournisseur sous licence, et recherches associées en forte hausse sur 7 jours pour vos 3 premiers mots-clés de niche. Mesure l'intérêt de recherche, pas l'audience des réseaux sociaux.",
    envVars: ["SERPAPI_API_KEY"],
    setup: [
      "Créez un compte sur https://serpapi.com (offre gratuite : 250 recherches par mois).",
      "Copiez votre clé API depuis https://serpapi.com/manage-api-key.",
      "Ajoutez SERPAPI_API_KEY=<votre clé> dans .env.local (ou dans les variables d'environnement de votre hébergeur), puis redémarrez l'application.",
    ],
    costNote:
      "Offre gratuite : 250 recherches/mois (50 par heure). Une analyse consomme 1 recherche + 1 par mot-clé (3 maximum) ; résultats gardés en cache 1 h. Offres payantes à partir de 25 $/mois.",
    docsUrl: "https://serpapi.com/google-trends-api",
    ttlMs: 60 * 60_000,
  },
  isConfigured: (env) => Boolean(getApiKey(env)),
  async fetch(ctx: SourceContext) {
    const apiKey = getApiKey(ctx.env);
    if (!apiKey) throw new SourceError("SerpApi non configuré : ajoutez SERPAPI_API_KEY.");
    const geo = ctx.geo.trim().toUpperCase();
    const language = ctx.language.trim().toLowerCase() || "fr";
    const keywords = [...new Set(ctx.keywords.map((keyword) => keyword.replace(/^#/, "").trim()).filter(Boolean))].slice(
      0,
      MAX_KEYWORDS,
    );

    const [trending, ...related] = await Promise.allSettled([
      serpapiGet({ engine: "google_trends_trending_now", geo, hours: "24", hl: language }, apiKey, ctx.signal),
      ...keywords.map((keyword) => serpapiRelatedQueries(keyword, { geo, language, signal: ctx.signal, apiKey })),
    ]);

    const failures: string[] = [];
    const signals: Signal[] = [];
    if (trending.status === "fulfilled") {
      const trends = dedupeTrends(parseTrendingNow(trending.value ?? {}));
      for (const trend of trends) {
        signals.push(trendToSignal(trend, { source: "serpapi_trends", geo, now: ctx.now, keywords: ctx.keywords }));
      }
    } else {
      failures.push(`tendances du moment (${reason(trending.reason)})`);
    }

    const seen = new Map<string, Signal>();
    related.forEach((result, index) => {
      const keyword = keywords[index];
      if (result.status === "rejected") {
        failures.push(`« ${keyword} » (${reason(result.reason)})`);
        return;
      }
      result.value.rising.slice(0, MAX_RISING_PER_KEYWORD).forEach((item, position) => {
        const key = normalizeQuery(item.query);
        const existing = seen.get(key);
        if (existing) {
          // Same rising search for two keywords: one signal, both tags.
          const tag = keyword.toLowerCase();
          if (!existing.tags.includes(tag)) existing.tags.push(tag);
          return;
        }
        const signal = risingQueryToSignal(item, { keyword, geo, position: position + 1 });
        seen.set(key, signal);
        signals.push(signal);
      });
    });

    if (failures.length === 1 + keywords.length) {
      const first = trending.status === "rejected" ? trending.reason : undefined;
      throw first instanceof SourceError ? first : new SourceError(`SerpApi indisponible : ${failures.join(", ")}`);
    }
    return {
      signals,
      warning: failures.length ? `SerpApi : échec pour ${failures.join(", ")}.` : undefined,
    };
  },
};
