/**
 * "Ce qui cartonne" — collection: the niche's recent videos on one platform,
 * with their real public counters and, when the source gives it, the
 * author's follower count. Reuses the trend connectors' request builders and
 * the creator fetchers' normalisers; only the date window, the volume and the
 * exclusions (pinned, paid) differ.
 *
 * - Instagram (APIFY_TOKEN): `apify/instagram-hashtag-scraper`, recent reels
 *   of up to 5 niche hashtags. No follower count on these rows: see enrich.ts.
 * - TikTok (APIFY_TOKEN): `clockworks/tiktok-scraper` keyword search, most
 *   liked videos of the period; `authorMeta.fans` comes with every row.
 * - YouTube (YOUTUBE_API_KEY): ONE search.list (its own 100 calls/day bucket)
 *   + one videos.list (1 unit). Subscribers: see enrich.ts.
 *
 * Nothing is invented: an unconfigured platform is reported by the
 * orchestrator with its setup note; an upstream failure throws a French
 * SourceError. Results are cached 6 h per platform and parameters.
 */

import { stripAccents, truncate } from "../../analysis/text";
import type { CreatorPost, ViralPlatform } from "../../types";
import type { ViralPostInput } from "../../viral/score";
import { VIRAL_YOUTUBE_RATIOS_NOTE } from "../../viral/labels";
import { cached } from "../cache";
import { compact } from "../creators/common";
import { creatorProfileUrl } from "../creators/handles";
import { instagramReelsToCreatorPosts } from "../creators/instagram";
import { tiktokVideosToCreatorPosts, type ApifyTiktokProfileVideo } from "../creators/tiktok";
import { youtubeRatiosAllowed, youtubeVideosToCreatorPosts } from "../creators/youtube";
import { SourceError, fetchWithTimeout } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "../sources/apify";
import {
  buildInstagramApifyInput,
  INSTAGRAM_APIFY_FIELDS,
  INSTAGRAM_HASHTAG_ACTOR,
  type ApifyInstagramItem,
} from "../sources/instagram-apify";
import { DAY_MS, clearlyNotFrench, errorMessage, scrubSecrets } from "../sources/social-utils";
import { buildTiktokSearchInput, TIKTOK_SEARCH_FIELDS, tiktokActors } from "../sources/tiktok-apify";
import type { Env } from "../sources/types";
import {
  buildYoutubeSearchUrl,
  buildYoutubeVideosUrl,
  searchVideoIds,
  youtubeError,
  type YoutubeSearchResponse,
  type YoutubeVideo,
  type YoutubeVideosResponse,
} from "../sources/youtube";

export const VIRAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Captions kept per video (reports are stored in the browser). */
const TEXT_MAX = 700;
/** Instagram: reels requested in total, spread over the hashtags. */
const INSTAGRAM_TOTAL_REELS = 100;
/** TikTok: videos requested in total, spread over the keywords (≈ 0,40 $ worst case on Apify's free plan). */
const TIKTOK_TOTAL_VIDEOS = 60;
const TIKTOK_MAX_QUERIES = 5;
const YOUTUBE_SEARCH_RESULTS = 50;

export const VIRAL_SOURCES: Record<ViralPlatform, string> = {
  instagram: "Apify · Instagram Hashtag Scraper (reels)",
  tiktok: "Apify · TikTok Scraper (recherche de vidéos)",
  youtube: "YouTube Data API (recherche + statistiques)",
};

export interface CollectContext {
  keywords: string[];
  periodDays: 7 | 30;
  geo: string;
  language: string;
  env: Env;
  /** Timeout signal owned by the orchestrator (results are shared through the cache). */
  signal: AbortSignal;
  /** Epoch ms of the run. */
  now: number;
}

export interface PlatformCollection {
  platform: ViralPlatform;
  /** Unscored videos (pinned and paid ones excluded), deduplicated. */
  posts: ViralPostInput[];
  source: string;
  /** French notices (filtered rows, limits of the data). */
  warnings: string[];
  /** False on YouTube unless YT_DERIVED_METRICS_APPROVED=true. */
  ratiosAllowed: boolean;
}

// ---------------------------------------------------------------------------
// Shared mapping helpers (pure)
// ---------------------------------------------------------------------------

export interface DroppedCounts {
  pinned: number;
  paid: number;
  tooOld: number;
  otherLanguage: number;
  noViews: number;
  noAuthor: number;
  notVideo: number;
  duplicate: number;
}

export interface ViralMapping {
  posts: ViralPostInput[];
  dropped: DroppedCounts;
}

function emptyDropped(): DroppedCounts {
  return { pinned: 0, paid: 0, tooOld: 0, otherLanguage: 0, noViews: 0, noAuthor: 0, notVideo: 0, duplicate: 0 };
}

/** Inside the look-back window (one day of slack for time zones); unknown dates are kept. */
function inWindow(iso: string | undefined, now: number, periodDays: number): boolean {
  if (!iso) return true;
  const time = Date.parse(iso);
  return Number.isNaN(time) || now - time <= (periodDays + 1) * DAY_MS;
}

function toViralPost(
  post: CreatorPost,
  platform: ViralPlatform,
  author: ViralPostInput["author"],
  query: string | undefined,
): ViralPostInput {
  // Pinned videos are excluded upstream; transcripts are never requested here.
  return compact({
    ...post,
    pinned: undefined,
    transcript: undefined,
    id: `${platform}:${post.id}`,
    text: truncate(post.text, TEXT_MAX),
    metrics: compact(post.metrics),
    platform,
    author: compact(author),
    query: query?.trim() || undefined,
  });
}

/** Dedupe by id: the row with the most views wins. */
function keep(byId: Map<string, ViralPostInput>, post: ViralPostInput, dropped: DroppedCounts): void {
  const existing = byId.get(post.id);
  if (existing) {
    dropped.duplicate++;
    if ((existing.metrics.views ?? 0) >= (post.metrics.views ?? 0)) return;
  }
  byId.set(post.id, post);
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** French notices about what the filters removed. */
export function droppedWarnings(dropped: DroppedCounts, unit: [string, string]): string[] {
  const [one, many] = unit;
  const count = (n: number) => plural(n, one, many);
  return [
    dropped.paid > 0 ? `${count(dropped.paid)} sponsorisé(e)s ou en partenariat rémunéré exclu(e)s (vues en partie payées).` : "",
    dropped.pinned > 0 ? `${count(dropped.pinned)} épinglé(e)s exclu(e)s.` : "",
    dropped.otherLanguage > 0 ? `${count(dropped.otherLanguage)} dans une autre langue exclu(e)s.` : "",
    dropped.noViews > 0 ? `${count(dropped.noViews)} sans vues publiques exclu(e)s.` : "",
  ].filter(Boolean);
}

function errorRowsWarning(rows: ApifyErrorRow[]): string | undefined {
  return rows.length ? `Apify a signalé ${plural(rows.length, "erreur")} (mot-clé vide, privé ou bloqué).` : undefined;
}

// ---------------------------------------------------------------------------
// Instagram (pure)
// ---------------------------------------------------------------------------

/** Hashtag scraper input: the trend connector's, with ~100 reels spread over the hashtags (20–50 each). */
export function buildViralInstagramInput(keywords: string[]) {
  const base = buildInstagramApifyInput(keywords);
  const perHashtag = Math.min(50, Math.max(20, Math.ceil(INSTAGRAM_TOTAL_REELS / Math.max(1, base.hashtags.length))));
  return { ...base, resultsLimit: perHashtag };
}

/** The hashtag that produced a row: `inputUrl` (…/explore/tags/<tag>), else a requested tag it carries. */
function instagramQuery(item: ApifyInstagramItem, hashtags: string[]): string | undefined {
  const fromUrl = item.inputUrl?.match(/\/explore\/tags\/([^/?#]+)/)?.[1];
  if (fromUrl) {
    try {
      return `#${decodeURIComponent(fromUrl).toLowerCase()}`;
    } catch {
      return `#${fromUrl.toLowerCase()}`;
    }
  }
  const tags = new Set((item.hashtags ?? []).map((tag) => tag.toLowerCase()));
  const tag = hashtags.find((candidate) => tags.has(candidate));
  return tag ? `#${tag}` : undefined;
}

export interface MapOptions {
  now: number;
  periodDays: number;
  language: string;
}

/** Pure: hashtag scraper rows → videos (reels of the window, pinned and paid partnerships excluded). */
export function instagramItemsToViralPosts(
  items: ApifyInstagramItem[],
  { now, periodDays, language, hashtags }: MapOptions & { hashtags: string[] },
): ViralMapping {
  const dropped = emptyDropped();
  const byId = new Map<string, ViralPostInput>();
  for (const item of items) {
    if (item.isPinned) {
      dropped.pinned++;
      continue;
    }
    if (item.paidPartnership) {
      dropped.paid++;
      continue;
    }
    const isReel = item.productType === "clips" || (item.productType === undefined && item.type === "Video");
    const post = isReel ? instagramReelsToCreatorPosts([item]).posts[0] : undefined;
    if (!post) {
      dropped.notVideo++;
      continue;
    }
    if (!inWindow(post.publishedAt, now, periodDays)) {
      dropped.tooOld++;
      continue;
    }
    if (language === "fr" && clearlyNotFrench(item.caption)) {
      dropped.otherLanguage++;
      continue;
    }
    if (post.metrics.views === undefined) {
      dropped.noViews++;
      continue;
    }
    const handle = item.ownerUsername?.trim().toLowerCase();
    if (!handle) {
      dropped.noAuthor++;
      continue;
    }
    const author = { handle, displayName: item.ownerFullName?.trim() || undefined, url: creatorProfileUrl("instagram", handle) };
    keep(byId, toViralPost(post, "instagram", author, instagramQuery(item, hashtags)), dropped);
  }
  return { posts: [...byId.values()], dropped };
}

// ---------------------------------------------------------------------------
// TikTok (pure)
// ---------------------------------------------------------------------------

/**
 * Keyword search input: the trend connector's (most liked, no downloads),
 * with every keyword (≤ 5), ~60 videos spread over them and the period's
 * date filter.
 */
export function buildViralTiktokInput(keywords: string[], periodDays: 7 | 30) {
  const base = buildTiktokSearchInput(keywords);
  const searchQueries = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, TIKTOK_MAX_QUERIES);
  const perQuery = Math.min(30, Math.max(12, Math.ceil(TIKTOK_TOTAL_VIDEOS / Math.max(1, searchQueries.length))));
  return {
    ...base,
    searchQueries,
    resultsPerPage: perQuery,
    videoSearchDateFilter: periodDays === 7 ? "PAST_WEEK" : "PAST_MONTH",
  };
}

/** Pure: search rows → videos (ads, sponsored, pinned and photo carousels excluded; other languages dropped). */
export function tiktokItemsToViralPosts(items: ApifyTiktokProfileVideo[], { now, periodDays, language }: MapOptions): ViralMapping {
  const dropped = emptyDropped();
  const byId = new Map<string, ViralPostInput>();
  for (const item of items) {
    if (!item.webVideoUrl?.startsWith("https://www.tiktok.com/")) continue;
    if (item.isAd || item.isSponsored) {
      dropped.paid++;
      continue;
    }
    if (item.isPinned) {
      dropped.pinned++;
      continue;
    }
    if (item.isSlideshow) {
      dropped.notVideo++;
      continue;
    }
    const lang = item.textLanguage?.toLowerCase();
    if (lang && lang !== "un" && !lang.startsWith(language.toLowerCase())) {
      dropped.otherLanguage++;
      continue;
    }
    const handle = item.authorMeta?.name?.trim().toLowerCase();
    if (!handle) {
      dropped.noAuthor++;
      continue;
    }
    const post = tiktokVideosToCreatorPosts([item], handle)[0];
    if (!post) continue;
    if (!inWindow(post.publishedAt, now, periodDays)) {
      dropped.tooOld++;
      continue;
    }
    if (post.metrics.views === undefined) {
      dropped.noViews++;
      continue;
    }
    const meta = item.authorMeta;
    const fans = meta?.fans;
    const author = {
      handle,
      displayName: meta?.nickName?.trim() || undefined,
      followers: typeof fans === "number" && Number.isFinite(fans) && fans >= 0 ? fans : undefined,
      url: meta?.profileUrl?.startsWith("https://www.tiktok.com/") ? meta.profileUrl : creatorProfileUrl("tiktok", handle),
    };
    keep(byId, toViralPost(post, "tiktok", author, item.searchQuery ?? item.input), dropped);
  }
  return { posts: [...byId.values()], dropped };
}

// ---------------------------------------------------------------------------
// YouTube (pure)
// ---------------------------------------------------------------------------

function rfc3339(time: number): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The trend connector's single search, over the requested period and with 50 results (still one call). */
export function buildViralYoutubeSearchUrl({
  keywords,
  geo,
  language,
  now,
  periodDays,
  apiKey,
}: {
  keywords: string[];
  geo: string;
  language: string;
  now: number;
  periodDays: number;
  apiKey: string;
}): string {
  const url = new URL(buildYoutubeSearchUrl({ keywords, geo, language, now, apiKey }));
  url.searchParams.set("publishedAfter", rfc3339(now - periodDays * DAY_MS));
  url.searchParams.set("maxResults", String(YOUTUBE_SEARCH_RESULTS));
  return url.toString();
}

/** Lower-case, accent-free words, padded for whole-word lookups. */
function words(value: string): string {
  return ` ${stripAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function youtubeQuery(video: YoutubeVideo, keywords: string[]): string | undefined {
  const haystack = words([video.snippet?.title, video.snippet?.description, ...(video.snippet?.tags ?? [])].filter(Boolean).join(" "));
  return keywords.find((keyword) => words(keyword).trim() && haystack.includes(words(keyword)));
}

function otherYoutubeLanguage(video: YoutubeVideo, language: string): boolean {
  const declared = video.snippet?.defaultAudioLanguage ?? video.snippet?.defaultLanguage;
  return Boolean(declared) && !declared!.toLowerCase().startsWith(language.toLowerCase());
}

/**
 * Pure: videos.list items → videos (live and upcoming streams, other
 * languages dropped). The author is the channel id until enrich.ts reads the
 * channels' handles and subscribers.
 */
export function youtubeVideosToViralPosts(
  videos: YoutubeVideo[],
  { now, periodDays, language, keywords }: MapOptions & { keywords: string[] },
): ViralMapping {
  const dropped = emptyDropped();
  const byId = new Map<string, ViralPostInput>();
  for (const video of videos) {
    const live = video.snippet?.liveBroadcastContent;
    if (live && live !== "none") {
      dropped.notVideo++;
      continue;
    }
    if (otherYoutubeLanguage(video, language)) {
      dropped.otherLanguage++;
      continue;
    }
    const post = youtubeVideosToCreatorPosts([video], new Map()).posts[0];
    const channelId = video.snippet?.channelId;
    if (!post) continue;
    if (!channelId) {
      dropped.noAuthor++;
      continue;
    }
    if (!inWindow(post.publishedAt, now, periodDays)) {
      dropped.tooOld++;
      continue;
    }
    if (post.metrics.views === undefined) {
      dropped.noViews++;
      continue;
    }
    const author = {
      handle: channelId,
      displayName: video.snippet?.channelTitle?.trim() || undefined,
      url: creatorProfileUrl("youtube", channelId),
    };
    keep(byId, toViralPost(post, "youtube", author, youtubeQuery(video, keywords)), dropped);
  }
  return { posts: [...byId.values()], dropped };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** GET a YouTube Data API URL; Google errors become French SourceErrors (the key is never shown). */
export async function youtubeJson<T>(url: string, label: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal, timeoutMs: 20_000, headers: { Accept: "application/json" } });
  } catch (error) {
    const retryable = error instanceof SourceError ? error.retryable : true;
    throw new SourceError(`${label} : ${scrubSecrets(errorMessage(error))}`, undefined, retryable);
  }
  const body = await response.text().catch(() => "");
  if (!response.ok) throw youtubeError(response.status, body, label);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SourceError(`${label} a renvoyé une réponse JSON invalide`);
  }
}

async function collectInstagram(ctx: CollectContext): Promise<PlatformCollection> {
  const token = ctx.env.APIFY_TOKEN?.trim();
  if (!token) throw new SourceError("Instagram nécessite APIFY_TOKEN (voir Réglages).");
  const input = buildViralInstagramInput(ctx.keywords);
  if (input.hashtags.length === 0) {
    throw new SourceError("Aucun hashtag Instagram utilisable dans vos mots-clés (lettres et chiffres uniquement).");
  }
  const { items, errorRows } = await runApifyActorDetailed<ApifyInstagramItem>(INSTAGRAM_HASHTAG_ACTOR, input, {
    token,
    signal: ctx.signal,
    maxChargeUsd: apifyMaxChargeUsd(ctx.env),
    fields: INSTAGRAM_APIFY_FIELDS,
  });
  const { posts, dropped } = instagramItemsToViralPosts(items, { ...ctx, hashtags: input.hashtags });
  const tags = input.hashtags.map((tag) => `#${tag}`).join(", ");
  return {
    platform: "instagram",
    posts,
    source: VIRAL_SOURCES.instagram,
    ratiosAllowed: true,
    warnings: [
      posts.length === 0 ? `Aucun reel de moins de ${ctx.periodDays} jours trouvé pour ${tags}.` : "",
      ...droppedWarnings(dropped, ["reel", "reels"]),
      errorRowsWarning(errorRows) ?? "",
      "Reels récents des hashtags (Instagram ne publie aucun classement de tendance) ; abonnés lus ensuite pour les auteurs des reels les plus vus.",
    ].filter(Boolean),
  };
}

async function collectTiktok(ctx: CollectContext): Promise<PlatformCollection> {
  const token = ctx.env.APIFY_TOKEN?.trim();
  if (!token) throw new SourceError("TikTok nécessite APIFY_TOKEN (voir Réglages).");
  const input = buildViralTiktokInput(ctx.keywords, ctx.periodDays);
  const { items, errorRows } = await runApifyActorDetailed<ApifyTiktokProfileVideo>(tiktokActors(ctx.env).search, input, {
    token,
    signal: ctx.signal,
    maxChargeUsd: apifyMaxChargeUsd(ctx.env),
    fields: TIKTOK_SEARCH_FIELDS,
  });
  const { posts, dropped } = tiktokItemsToViralPosts(items, ctx);
  const unknown = posts.filter((post) => post.author.followers === undefined).length;
  return {
    platform: "tiktok",
    posts,
    source: VIRAL_SOURCES.tiktok,
    ratiosAllowed: true,
    warnings: [
      posts.length === 0 ? `Aucune vidéo TikTok de moins de ${ctx.periodDays} jours trouvée pour ${input.searchQueries.join(", ")}.` : "",
      ...droppedWarnings(dropped, ["vidéo", "vidéos"]),
      errorRowsWarning(errorRows) ?? "",
      unknown > 0 ? `Abonnés de l'auteur non fournis par TikTok pour ${plural(unknown, "vidéo")}.` : "",
      "Vidéos les plus likées de la période pour chaque mot-clé : un échantillon des succès de la niche, pas toute la niche. Abonnés arrondis par TikTok.",
    ].filter(Boolean),
  };
}

async function collectYoutube(ctx: CollectContext): Promise<PlatformCollection> {
  const apiKey = ctx.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new SourceError("Clé YouTube manquante : renseignez YOUTUBE_API_KEY.");
  const search = await youtubeJson<YoutubeSearchResponse>(
    buildViralYoutubeSearchUrl({ ...ctx, apiKey }),
    "Recherche YouTube",
    ctx.signal,
  );
  const ids = searchVideoIds(search);
  const videos = ids.length
    ? await youtubeJson<YoutubeVideosResponse>(buildYoutubeVideosUrl(ids, apiKey), "YouTube (statistiques)", ctx.signal)
    : { items: [] };
  // Keep the search order (by views): videos.list does not guarantee it.
  const order = new Map(ids.map((id, index) => [id, index]));
  const sorted = [...(videos.items ?? [])].sort((a, b) => (order.get(a.id ?? "") ?? 99) - (order.get(b.id ?? "") ?? 99));
  const { posts, dropped } = youtubeVideosToViralPosts(sorted, { ...ctx, keywords: ctx.keywords });
  const ratiosAllowed = youtubeRatiosAllowed(ctx.env);
  return {
    platform: "youtube",
    posts,
    source: VIRAL_SOURCES.youtube,
    ratiosAllowed,
    warnings: [
      posts.length === 0 ? `Aucune vidéo YouTube de moins de ${ctx.periodDays} jours trouvée pour vos mots-clés.` : "",
      ...droppedWarnings(dropped, ["vidéo", "vidéos"]),
      ratiosAllowed ? "" : VIRAL_YOUTUBE_RATIOS_NOTE,
    ].filter(Boolean),
  };
}

const COLLECTORS: Record<ViralPlatform, (ctx: CollectContext) => Promise<PlatformCollection>> = {
  instagram: collectInstagram,
  tiktok: collectTiktok,
  youtube: collectYoutube,
};

/** Cache key part that changes with the data route (actor, YouTube policy flag). */
function route(platform: ViralPlatform, env: Env): string {
  switch (platform) {
    case "instagram":
      return INSTAGRAM_HASHTAG_ACTOR;
    case "tiktok":
      return tiktokActors(env).search;
    case "youtube":
      return youtubeRatiosAllowed(env) ? "api+ratios" : "api";
  }
}

export function viralCacheKey(platform: ViralPlatform, ctx: Pick<CollectContext, "keywords" | "periodDays" | "geo" | "language" | "env">): string {
  const keywords = [...new Set(ctx.keywords.map((keyword) => keyword.trim().toLowerCase()))].sort().join(",");
  return `viral:${platform}:${route(platform, ctx.env)}:${ctx.geo}:${ctx.language}:${ctx.periodDays}:${keywords}`;
}

/**
 * The niche's recent videos on one platform (cached 6 h per platform and
 * parameters). Throws a French SourceError when the platform cannot be read.
 */
export async function collectPlatform(platform: ViralPlatform, ctx: CollectContext): Promise<PlatformCollection> {
  const collector = COLLECTORS[platform];
  if (!collector) throw new SourceError(`Plateforme non prise en charge : ${String(platform)}.`);
  const { value } = await cached(viralCacheKey(platform, ctx), VIRAL_CACHE_TTL_MS, () => collector(ctx));
  // Cached objects are shared between runs.
  return structuredClone(value);
}
