/**
 * Wikipedia "most read" articles (Wikimedia pageviews API): what the public
 * looked up yesterday in the chosen language, and how much more than the day
 * before. A strong free "curiosité du grand public" signal, one day late.
 *
 * Wikimedia rate-limits shared IPs hard: requests carry a descriptive
 * User-Agent with a contact (their policy) and a 429 is retried at most once
 * after a short Retry-After.
 */

import { shortHash, truncate } from "../../analysis/text";
import type { Signal } from "../../types";
import { fetchWithTimeout, SourceError } from "../http";
import { matchKeyword } from "./google-trends";
import type { Env, SourceConnector, SourceContext } from "./types";

const API_BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top";
const DEFAULT_CONTACT = "https://github.com/eliart-tech/ultraplan-test";
const DAY_MS = 86_400_000;
const MAX_SIGNALS = 40;
/** Share of the 40 slots reserved for articles whose views jumped. */
const MAX_SPIKES = 28;
/** Spikes must still be read: at least the views of the 300th article of the day. */
const SPIKE_MIN_RANK = 300;
const SPIKE_MIN_RATIO = 2;
/** Longest Retry-After we are willing to wait inside an analysis run. */
const MAX_RETRY_AFTER_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 5_000;

export interface TopArticle {
  /** Raw title as returned by the API ("Jean-Luc_Mélenchon"). */
  article: string;
  views: number;
  rank: number;
}

export interface TopDay {
  /** "YYYY-MM-DD" (UTC). */
  date: string;
  articles: TopArticle[];
}

export interface SelectedArticle extends TopArticle {
  /** Day-over-day change; for new entrants, a lower bound. */
  increasePct?: number;
  /** Absent from the previous day's top 1000. */
  newEntrant: boolean;
}

// ---------------------------------------------------------------------------
// Parsing & filtering
// ---------------------------------------------------------------------------

export function userAgent(env: Env): string {
  const contact = env.WIKIPEDIA_CONTACT?.trim() || DEFAULT_CONTACT;
  return `TrendScript/1.0 (${contact})`;
}

/** UTC calendar day `daysBack` days before `now`, as "YYYY-MM-DD". */
export function utcDay(now: number, daysBack: number): string {
  return new Date(now - daysBack * DAY_MS).toISOString().slice(0, 10);
}

export function parseTopArticles(json: unknown): TopArticle[] {
  const items = (json as { items?: unknown })?.items;
  const articles = Array.isArray(items) ? (items[0] as { articles?: unknown })?.articles : undefined;
  if (!Array.isArray(articles)) throw new SourceError("Wikipédia a renvoyé une réponse inattendue");
  return articles.filter(
    (item): item is TopArticle =>
      typeof item?.article === "string" &&
      item.article.length > 0 &&
      typeof item.views === "number" &&
      Number.isFinite(item.views) &&
      typeof item.rank === "number",
  );
}

/** Namespaces (fr, en and a few other big wikis) — real titles may contain " : ", so match prefixes only. */
const NAMESPACE =
  /^(?:Wikipédia|Wikipedia|Spécial|Special|Spezial|Especial|Speciale|Fichier|File|Image|Datei|Archivo|Portail|Portal|Portale|Aide|Help|Hilfe|Ayuda|Aiuto|Catégorie|Category|Kategorie|Categoría|Categoria|Modèle|Template|Vorlage|Plantilla|Utilisateur|Utilisatrice|User|Benutzer|Usuario|Utente|Projet|Project|Module|Référence|MediaWiki|Draft|Brouillon|TimedText|Sujet|Topic)[ _]?:/i;
const TALK_NAMESPACE = /^(?:Discussion|Talk|[A-Za-z]+_talk)(?:[ _][^:]{1,40})?[ _]?:/i;

/** Main pages, bot/anomaly traffic and adult navigation that are never news. */
const NOISE = new Set(
  [
    "-",
    "Main_Page",
    "Pagina_principale",
    "Cookie_(informatique)",
    "HTTP_cookie",
    "XXX",
    "XXXX",
    "Xxx",
    "Pornhub",
    "XHamster",
    "XNXX",
    "Xvideos",
    "Undefined",
    "Null",
  ].map((title) => title.toLowerCase()),
);

export function isNoise(article: string): boolean {
  return NAMESPACE.test(article) || TALK_NAMESPACE.test(article) || NOISE.has(article.toLowerCase());
}

/**
 * Keeps up to 40 articles, favouring spikes: articles that at least doubled
 * vs the previous day (or entered the top 1000) and are still widely read,
 * then fills with the most read ones. Without a previous day, most read only.
 */
export function selectArticles(current: TopArticle[], previous?: TopArticle[]): SelectedArticle[] {
  const candidates = current.filter((item) => !isNoise(item.article));
  if (!previous || previous.length === 0) {
    return [...candidates]
      .sort((a, b) => b.views - a.views)
      .slice(0, MAX_SIGNALS)
      .map((item) => ({ ...item, newEntrant: false }));
  }

  const previousViews = new Map(previous.map((item) => [item.article, item.views]));
  // An article missing from yesterday's top had at most the views of its last entry.
  const threshold = Math.max(1, Math.min(...previous.map((item) => item.views)));
  const sortedViews = current.map((item) => item.views).sort((a, b) => b - a);
  const minSpikeViews = sortedViews[Math.min(SPIKE_MIN_RANK, sortedViews.length) - 1] ?? 0;

  const enriched = candidates.map((item) => {
    const before = previousViews.get(item.article);
    const base = before ?? threshold;
    return {
      ...item,
      newEntrant: before === undefined,
      increasePct: Math.round((item.views / base - 1) * 100),
      ratio: item.views / Math.max(1, base),
    };
  });

  const spikeScore = (item: { views: number; ratio: number }) => item.views * Math.min(item.ratio, 20);
  const spikes = enriched
    .filter((item) => item.views >= minSpikeViews && item.ratio >= SPIKE_MIN_RATIO)
    .sort((a, b) => spikeScore(b) - spikeScore(a))
    .slice(0, MAX_SPIKES);
  const spikeSet = new Set(spikes.map((item) => item.article));
  const others = enriched
    .filter((item) => !spikeSet.has(item.article))
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_SIGNALS - spikes.length);

  return [...spikes, ...others]
    .sort((a, b) => b.views - a.views)
    .map((item) => ({
      article: item.article,
      views: item.views,
      rank: item.rank,
      newEntrant: item.newEntrant,
      // A new entrant's increase is a lower bound; a decline is still reported.
      increasePct: item.newEntrant ? Math.max(0, item.increasePct) : item.increasePct,
    }));
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

function displayTitle(article: string): string {
  let title = article;
  if (/%[0-9A-F]{2}/i.test(title)) {
    try {
      title = decodeURIComponent(title);
    } catch {
      // literal "%" in the title — keep as is
    }
  }
  return title.replace(/_/g, " ");
}

const formatNumber = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

function frenchDate(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

function describe(item: SelectedArticle, day: string, language: string, hasPrevious: boolean): string {
  const parts = [
    `${formatNumber(item.views)} vues le ${frenchDate(day)} sur Wikipédia (${language})`,
    `${item.rank === 1 ? "1er" : `${item.rank}e`} article le plus lu`,
  ];
  if (item.increasePct !== undefined) {
    if (item.newEntrant) parts.push(`nouvel entrant dans le top 1000 (au moins +${formatNumber(item.increasePct)} % sur un jour)`);
    else if (item.increasePct >= 0) parts.push(`+${formatNumber(item.increasePct)} % par rapport à la veille`);
    else parts.push(`en baisse de ${formatNumber(-item.increasePct)} % par rapport à la veille`);
  } else if (!hasPrevious) {
    parts.push("évolution sur un jour indisponible");
  }
  return parts.join(" · ");
}

export function articleToSignal(
  item: SelectedArticle,
  { day, language, keywords, hasPrevious }: { day: string; language: string; keywords: string[]; hasPrevious: boolean },
): Signal {
  const url = `https://${language}.wikipedia.org/wiki/${encodeURIComponent(item.article.replace(/ /g, "_"))}`;
  const title = displayTitle(item.article);
  const metrics: Signal["metrics"] = { views: item.views, rank: item.rank };
  if (item.increasePct !== undefined) metrics.increasePct = item.increasePct;
  return {
    id: `wikipedia:${shortHash(url)}`,
    source: "wikipedia",
    platform: "wikipedia",
    kind: "article_views",
    title,
    text: truncate(describe(item, day, language, hasPrevious)),
    url,
    // End of the measured UTC day: the views were counted up to then.
    publishedAt: `${day}T23:59:59.000Z`,
    metrics,
    tags: [],
    related: [],
    query: matchKeyword(keywords, [title]),
    strength: 0,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

const sleep: Wait = (ms, signal) =>
  new Promise((resolve, reject) => {
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

/** Retry-After in ms (seconds or HTTP date); default 5 s as Wikimedia asks. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? DEFAULT_RETRY_AFTER_MS : Math.max(0, date - now);
}

export interface FetchDayOptions {
  signal: AbortSignal;
  userAgent: string;
  wait?: Wait;
}

/** One day of the top 1000, or `null` when that day is not published yet (404). */
export async function fetchTopDay(language: string, day: string, { signal, userAgent, wait = sleep }: FetchDayOptions): Promise<TopDay | null> {
  const url = `${API_BASE}/${language}.wikipedia.org/all-access/${day.replace(/-/g, "/")}`;
  const init = { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal, timeoutMs: 15_000 };

  let response = await fetchWithTimeout(url, init);
  if (response.status === 429 || response.status === 503) {
    const delay = retryAfterMs(response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => undefined);
    if (delay > MAX_RETRY_AFTER_MS) {
      throw new SourceError(
        `Wikipédia limite temporairement les requêtes depuis ce serveur : réessayez dans ${Math.ceil(delay / 1000)} s.`,
        response.status,
        true,
      );
    }
    await wait(delay, signal);
    response = await fetchWithTimeout(url, init);
  }

  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (response.status === 429 || response.status === 503) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceError(
      "Wikipédia limite temporairement les requêtes depuis ce serveur (429) : réessayez dans quelques minutes.",
      response.status,
      true,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceError(`Wikipédia a répondu ${response.status}`, response.status, response.status >= 500);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new SourceError("Wikipédia a renvoyé une réponse JSON invalide");
  }
  return { date: day, articles: parseTopArticles(json) };
}

export interface WikipediaLoadResult {
  current: TopDay;
  previous?: TopDay;
  warning?: string;
}

/**
 * D-1 and D-2 in parallel (2 requests). When D-1 is not published yet, D-2
 * becomes the reference day and D-3 is fetched for the growth (3rd request,
 * only in that case). Failing to get the previous day only drops the growth.
 */
export async function loadWikipediaTop(
  language: string,
  now: number,
  options: FetchDayOptions,
): Promise<WikipediaLoadResult> {
  const [d1, d2] = await Promise.allSettled([
    fetchTopDay(language, utcDay(now, 1), options),
    fetchTopDay(language, utcDay(now, 2), options),
  ]);

  if (d1.status === "fulfilled" && d1.value) {
    if (d2.status === "fulfilled" && d2.value) return { current: d1.value, previous: d2.value };
    return {
      current: d1.value,
      warning: "Classement de la veille seulement : le jour précédent n'a pas pu être chargé, hausses non calculées.",
    };
  }

  if (d2.status !== "fulfilled" || !d2.value) {
    if (d1.status === "rejected") throw d1.reason;
    if (d2.status === "rejected") throw d2.reason;
    throw new SourceError("Wikipédia n'a pas encore publié les chiffres des deux derniers jours.", 404);
  }

  const late = d1.status === "fulfilled"; // D-1 answered 404: not published yet
  const reason = late
    ? "les chiffres d'hier ne sont pas encore publiés"
    : "Wikipédia a limité les requêtes pour les chiffres d'hier";
  if (!late) return { current: d2.value, warning: `Classement d'avant-hier utilisé (${reason}), hausses non calculées.` };

  try {
    const d3 = await fetchTopDay(language, utcDay(now, 3), options);
    return {
      current: d2.value,
      previous: d3 ?? undefined,
      warning: `Classement d'avant-hier utilisé (${reason}).`,
    };
  } catch {
    return { current: d2.value, warning: `Classement d'avant-hier utilisé (${reason}), hausses non calculées.` };
  }
}

export const wikipediaConnector: SourceConnector = {
  id: "wikipedia",
  meta: {
    label: "Wikipédia — Articles les plus lus",
    platform: "wikipedia",
    free: true,
    needsKeywords: false,
    description:
      "Articles Wikipédia les plus consultés la veille dans la langue choisie (tous pays confondus) et leur hausse par rapport à l'avant-veille. Bon indicateur de la curiosité du grand public, avec un jour de décalage.",
    envVars: [],
    setup: [
      "Aucune clé nécessaire.",
      "Optionnel : définissez WIKIPEDIA_CONTACT (URL de votre site ou adresse e-mail) pour identifier vos requêtes auprès de Wikimedia, comme le demande leur politique d'accès.",
    ],
    costNote:
      "Gratuit (API Wikimedia). Chiffres publiés avec environ un jour de décalage ; les limites de débit sont gérées automatiquement.",
    docsUrl: "https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews",
    ttlMs: 6 * 3_600_000,
  },
  isConfigured: () => true,
  async fetch(ctx: SourceContext) {
    const language = ctx.language.trim().toLowerCase();
    if (!/^[a-z]{2,3}$/.test(language)) {
      return { signals: [], warning: `Langue « ${ctx.language} » non prise en charge par Wikipédia.` };
    }
    const { current, previous, warning } = await loadWikipediaTop(language, ctx.now, {
      signal: ctx.signal,
      userAgent: userAgent(ctx.env),
    });
    const signals = selectArticles(current.articles, previous?.articles).map((item) =>
      articleToSignal(item, { day: current.date, language, keywords: ctx.keywords, hasPrevious: Boolean(previous) }),
    );
    return { signals, warning };
  },
};
