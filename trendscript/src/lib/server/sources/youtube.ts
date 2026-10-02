/**
 * YouTube Data API v3 (key-based, public data only).
 *
 * Quota model since June 2026: `search.list` has its own bucket of only
 * 100 calls/day, everything else shares 10 000 units/day at 1 unit per list
 * call. So a run makes EXACTLY ONE search (niche keywords OR-ed with `|`),
 * then one `videos.list` for the stats (search returns none), plus one
 * `videos.list?chart=mostPopular` — which since July 2025 only covers
 * music, films and gaming, hence its low-value label.
 */

import type { Signal } from "../../types";
import { shortHash, stripAccents, truncate } from "../../analysis/text";
import { SourceError, fetchWithTimeout } from "../http";
import { DAY_MS, errorMessage, scrubSecrets, toCount, toIso, uniqueTags } from "./social-utils";
import type { SourceConnector, SourceContext, SourceFetchResult } from "./types";

export const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const SEARCH_RESULTS = 25;
const POPULAR_RESULTS = 25;
const SEARCH_WINDOW_DAYS = 7;
/** Shorts can last up to 3 min since Oct 2024; the API has no Shorts flag. */
export const SHORT_MAX_SECONDS = 180;
export const POPULAR_LABEL = "Populaire YouTube (musique/films/jeux)";

// ---------------------------------------------------------------------------
// Request builders (pure)
// ---------------------------------------------------------------------------

/** `kw1|"two words"|kw3` — multi-word keywords quoted so each stays a phrase. */
export function youtubeSearchQuery(keywords: string[]): string {
  return [...new Set(keywords.map((k) => k.trim().replace(/["|]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean))]
    .map((k) => (k.includes(" ") ? `"${k}"` : k))
    .join("|");
}

function rfc3339(time: number): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function buildYoutubeSearchUrl({
  keywords,
  geo,
  language,
  now,
  apiKey,
}: {
  keywords: string[];
  geo: string;
  language: string;
  now: number;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    part: "snippet",
    q: youtubeSearchQuery(keywords),
    type: "video",
    order: "viewCount",
    publishedAfter: rfc3339(now - SEARCH_WINDOW_DAYS * DAY_MS),
    regionCode: geo.toUpperCase(),
    relevanceLanguage: language.toLowerCase(),
    maxResults: String(SEARCH_RESULTS),
    key: apiKey,
  });
  return `${YOUTUBE_API}/search?${params}`;
}

export function buildYoutubeVideosUrl(ids: string[], apiKey: string): string {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: ids.slice(0, 50).join(","),
    key: apiKey,
  });
  return `${YOUTUBE_API}/videos?${params}`;
}

export function buildYoutubeMostPopularUrl({ geo, language, apiKey }: { geo: string; language: string; apiKey: string }): string {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode: geo.toUpperCase(),
    hl: language.toLowerCase(),
    maxResults: String(POPULAR_RESULTS),
    key: apiKey,
  });
  return `${YOUTUBE_API}/videos?${params}`;
}

// ---------------------------------------------------------------------------
// Response shapes and parsing (pure)
// ---------------------------------------------------------------------------

interface Thumbnail {
  url?: string;
}

export interface YoutubeSearchResponse {
  items?: { id?: { kind?: string; videoId?: string } }[];
}

export interface YoutubeVideo {
  id?: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Record<string, Thumbnail | undefined>;
  };
  /** Counters are JSON strings. */
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

export interface YoutubeVideosResponse {
  items?: YoutubeVideo[];
}

/** ISO 8601 duration ("PT1M5S", "P1DT2H") → seconds; undefined for "P0D" (live) or garbage. */
export function isoDurationToSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return undefined;
  const [, d = "0", h = "0", mi = "0", s = "0"] = m;
  const total = Number(d) * 86_400 + Number(h) * 3_600 + Number(mi) * 60 + Math.round(Number(s));
  return total > 0 ? total : undefined;
}

export function searchVideoIds(response: YoutubeSearchResponse): string[] {
  const ids = (response.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

function bestThumbnail(thumbnails: Record<string, Thumbnail | undefined> | undefined): string | undefined {
  for (const size of ["high", "medium", "standard", "default"]) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return undefined;
}

/** Lower-case, accent-free words separated by single spaces, padded for whole-word lookups. */
function words(value: string): string {
  return ` ${stripAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** The niche keyword a search result matches as whole word(s) — the search ORs them all. */
function matchingKeyword(video: YoutubeVideo, keywords: string[]): string | undefined {
  const haystack = words(
    [video.snippet?.title, video.snippet?.description, ...(video.snippet?.tags ?? [])].filter(Boolean).join(" "),
  );
  return keywords.find((keyword) => words(keyword).trim() && haystack.includes(words(keyword)));
}

/** True when YouTube says the video is in another language (unknown = kept). */
function otherLanguage(video: YoutubeVideo, language: string): boolean {
  const declared = video.snippet?.defaultAudioLanguage ?? video.snippet?.defaultLanguage;
  return Boolean(declared) && !declared!.toLowerCase().startsWith(language.toLowerCase());
}

export interface VideoMappingOptions {
  /** "search" = niche result, "popular" = mostPopular chart. */
  origin: "search" | "popular";
  keywords: string[];
}

/** Pure: one `videos.list` item → signal (undefined for upcoming streams / unusable rows). */
export function youtubeVideoToSignal(video: YoutubeVideo, index: number, { origin, keywords }: VideoMappingOptions): Signal | undefined {
  const id = video.id;
  const snippet = video.snippet;
  if (!id || !snippet?.title || snippet.liveBroadcastContent === "upcoming") return undefined;

  const durationSec = isoDurationToSeconds(video.contentDetails?.duration);
  const isShort = durationSec !== undefined && durationSec <= SHORT_MAX_SECONDS;
  const url = isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
  const description = truncate(snippet.description, 450);

  return {
    id: `youtube:${shortHash(url)}`,
    source: "youtube",
    platform: "youtube",
    kind: isShort ? "short_video" : "video",
    title: snippet.title,
    text: origin === "popular" ? [POPULAR_LABEL, description].filter(Boolean).join(" · ") : description,
    url,
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
    author: snippet.channelTitle,
    publishedAt: toIso(snippet.publishedAt),
    metrics: {
      views: toCount(video.statistics?.viewCount),
      likes: toCount(video.statistics?.likeCount),
      comments: toCount(video.statistics?.commentCount),
      durationSec,
      rank: origin === "popular" ? index + 1 : undefined,
    },
    tags: uniqueTags(snippet.tags ?? [], 10),
    related: [],
    query: origin === "search" ? matchingKeyword(video, keywords) : undefined,
    strength: 0,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: { reason?: string; domain?: string; message?: string }[];
    details?: { reason?: string }[];
  };
}

/** Pure: Google API error response → French, actionable SourceError (no key in the message). */
export function youtubeError(status: number, bodyText: string, label: string): SourceError {
  let body: GoogleErrorBody = {};
  try {
    body = JSON.parse(bodyText) as GoogleErrorBody;
  } catch {
    // non-JSON body (proxy page…)
  }
  const error = body.error;
  const reasons = [
    ...(error?.errors ?? []).map((e) => e.reason ?? ""),
    ...(error?.details ?? []).map((d) => d.reason ?? ""),
    error?.status ?? "",
  ].filter(Boolean);
  const has = (pattern: RegExp) => reasons.some((reason) => pattern.test(reason));
  const message = error?.message ?? "";

  if (has(/^API_KEY_INVALID$/) || /API key not valid/i.test(message)) {
    return new SourceError("Clé YouTube invalide : vérifiez YOUTUBE_API_KEY.", status);
  }
  if (has(/quota|rateLimit/i)) {
    return new SourceError(
      "Quota YouTube du jour atteint (100 recherches/jour) : réessayez après minuit heure du Pacifique (8 h ou 9 h à Paris selon la saison).",
      status,
      true,
    );
  }
  if (has(/accessNotConfigured|SERVICE_DISABLED/) || /has not been used in project|is disabled/i.test(message)) {
    return new SourceError(
      "L'API « YouTube Data API v3 » n'est pas activée dans votre projet Google Cloud : activez-la (APIs & Services → Library).",
      status,
    );
  }
  if (has(/^API_KEY_.*BLOCKED$|^API_KEY_SERVICE_BLOCKED$/)) {
    return new SourceError(
      "Clé YouTube refusée par ses restrictions : autorisez « YouTube Data API v3 » et l'adresse IP de votre serveur (pas de restriction par site web).",
      status,
    );
  }
  if (status === 403 && /unregistered callers/i.test(message)) {
    return new SourceError("Clé YouTube manquante : renseignez YOUTUBE_API_KEY.", status);
  }
  const detail = scrubSecrets(message.replace(/\s+/g, " ").trim()).slice(0, 200);
  return new SourceError(
    `${label} a répondu ${status}${detail ? ` : ${detail}` : ""}`,
    status,
    status === 429 || status >= 500,
  );
}

async function youtubeGet<T>(url: string, label: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal, timeoutMs: 20_000, headers: { Accept: "application/json" } });
  } catch (error) {
    const retryable = error instanceof SourceError ? error.retryable : true;
    throw new SourceError(`${label} : ${scrubSecrets(errorMessage(error))}`, undefined, retryable);
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) throw youtubeError(response.status, text, label);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(`${label} a renvoyé une réponse JSON invalide`);
  }
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

/** Search + stats for the niche keywords: 1 search call + 1 unit. */
async function nicheVideos(ctx: SourceContext, apiKey: string): Promise<Signal[]> {
  const search = await youtubeGet<YoutubeSearchResponse>(
    buildYoutubeSearchUrl({ keywords: ctx.keywords, geo: ctx.geo, language: ctx.language, now: ctx.now, apiKey }),
    "Recherche YouTube",
    ctx.signal,
  );
  const ids = searchVideoIds(search);
  if (ids.length === 0) return [];
  const videos = await youtubeGet<YoutubeVideosResponse>(buildYoutubeVideosUrl(ids, apiKey), "YouTube (statistiques)", ctx.signal);
  // Keep the search order (viewCount) — videos.list does not guarantee it.
  const order = new Map(ids.map((id, i) => [id, i]));
  return (videos.items ?? [])
    .filter((video) => !otherLanguage(video, ctx.language))
    .sort((a, b) => (order.get(a.id ?? "") ?? 99) - (order.get(b.id ?? "") ?? 99))
    .map((video, i) => youtubeVideoToSignal(video, i, { origin: "search", keywords: ctx.keywords }))
    .filter((signal): signal is Signal => signal !== undefined);
}

async function popularVideos(ctx: SourceContext, apiKey: string): Promise<Signal[]> {
  const response = await youtubeGet<YoutubeVideosResponse>(
    buildYoutubeMostPopularUrl({ geo: ctx.geo, language: ctx.language, apiKey }),
    "YouTube (populaires)",
    ctx.signal,
  );
  return (response.items ?? [])
    .map((video, i) => youtubeVideoToSignal(video, i, { origin: "popular", keywords: [] }))
    .filter((signal): signal is Signal => signal !== undefined);
}

export async function fetchYoutube(ctx: SourceContext): Promise<SourceFetchResult> {
  const apiKey = ctx.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new SourceError("Clé YouTube manquante : renseignez YOUTUBE_API_KEY.");
  const hasKeywords = ctx.keywords.some((k) => k.trim());

  const [niche, popular] = await Promise.allSettled([
    hasKeywords ? nicheVideos(ctx, apiKey) : Promise.resolve([] as Signal[]),
    popularVideos(ctx, apiKey),
  ]);

  const failures = [niche, popular].filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length === 2 || (!hasKeywords && popular.status === "rejected")) {
    const reason = failures[0].reason;
    throw reason instanceof SourceError ? reason : new SourceError(errorMessage(reason));
  }

  const warnings: string[] = [];
  const nicheSignals = niche.status === "fulfilled" ? niche.value : [];
  const seen = new Set(nicheSignals.map((s) => s.url));
  const popularSignals = popular.status === "fulfilled" ? popular.value.filter((s) => !seen.has(s.url)) : [];

  if (niche.status === "rejected") warnings.push(`Recherche par mots-clés indisponible : ${errorMessage(niche.reason)}`);
  if (popular.status === "rejected") warnings.push(`Classement « Populaire » indisponible : ${errorMessage(popular.reason)}`);
  if (!hasKeywords) {
    warnings.push("Sans mots-clés, seul le classement « Populaire » (musique, films, jeux) est utilisé : ajoutez des mots-clés pour chercher dans votre niche.");
  } else if (niche.status === "fulfilled" && nicheSignals.length === 0) {
    warnings.push("Aucune vidéo de moins de 7 jours trouvée pour vos mots-clés.");
  }
  return { signals: [...nicheSignals, ...popularSignals], warning: warnings.length ? warnings.join(" ") : undefined };
}

export const youtubeConnector: SourceConnector = {
  id: "youtube",
  meta: {
    label: "YouTube (API officielle)",
    platform: "youtube",
    free: true,
    needsKeywords: false,
    description:
      "Vidéos et Shorts les plus vus des 7 derniers jours sur vos mots-clés dans votre pays, avec leurs vraies statistiques (vues, likes, commentaires, durée), plus le classement « Populaire » de YouTube — qui ne couvre plus que la musique, les films et les jeux depuis juillet 2025.",
    envVars: ["YOUTUBE_API_KEY"],
    setup: [
      "Ouvrez https://console.cloud.google.com avec votre compte Google et créez un projet (bouton « Sélectionner un projet » → « Nouveau projet »).",
      "Menu « API et services » → « Bibliothèque » : cherchez « YouTube Data API v3 » et cliquez sur « Activer ».",
      "Menu « API et services » → « Identifiants » (https://console.cloud.google.com/apis/credentials) → « Créer des identifiants » → « Clé API ».",
      "Cliquez sur « Restreindre la clé » : dans « Restrictions d'API », n'autorisez que « YouTube Data API v3 » (n'ajoutez pas de restriction par site web : la clé est utilisée par le serveur).",
      "Copiez la clé (elle commence par AIza) et ajoutez YOUTUBE_API_KEY=votre_clé dans .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
    ],
    costNote:
      "Gratuit dans la limite du quota Google : 100 recherches par jour (compteur dédié depuis juin 2026) et 10 000 unités par jour pour le reste. Une analyse consomme 1 recherche + 2 unités et reste en cache 6 h. Le quota se réinitialise à minuit heure du Pacifique (8 h ou 9 h à Paris).",
    docsUrl: "https://developers.google.com/youtube/v3/docs/search/list",
    ttlMs: 6 * 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.YOUTUBE_API_KEY?.trim()),
  fetch: fetchYoutube,
};
