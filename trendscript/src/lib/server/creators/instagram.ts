/**
 * Instagram account → recent posts with their public counters.
 *
 * 1. Meta's Business Discovery (free, preferred when INSTAGRAM_ACCESS_TOKEN +
 *    INSTAGRAM_USER_ID are set): followers, media count, bio and the last N
 *    media with views (reels), likes and comments. Only Creator / Business
 *    accounts can be read; shares and saves are not exposed for other
 *    accounts (Meta's IG Media reference).
 * 2. Apify (APIFY_TOKEN), two runs in parallel:
 *    `apify/instagram-reel-scraper` `{ username: [x], resultsLimit, skipPinnedPosts }`
 *    (reels with plays, likes — -1 when hidden — comments, duration, audio)
 *    and `apify/instagram-profile-scraper` `{ usernames: [x] }` (followers,
 *    posts count, bio, verified, private). Shares are a paid add-on of the
 *    reel scraper (`includeSharesCount`), only requested when
 *    APIFY_INSTAGRAM_SHARES is set.
 * When both are configured and Meta cannot read the account, Apify is used.
 */

import type { CreatorAccount, CreatorData, CreatorPost } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { SourceError, fetchWithTimeout } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow, type ApifyRunResult } from "../sources/apify";
import type { ApifyInstagramItem } from "../sources/instagram-apify";
import { GRAPH_HOST, GraphApiError, graphError, graphVersion } from "../sources/instagram-graph";
import { errorMessage, extractHashtags, scrubSecrets, toCount, toIso, uniqueTags } from "../sources/social-utils";
import type { Env } from "../sources/types";
import {
  BIO_MAX,
  buildCreatorData,
  captionParts,
  musicLabel,
  noAudienceWarning,
  plural,
  type FetchCreatorOptions,
} from "./common";
import { creatorProfileUrl } from "./handles";

export const INSTAGRAM_REEL_ACTOR = "apify~instagram-reel-scraper";
export const INSTAGRAM_PROFILE_ACTOR = "apify~instagram-profile-scraper";
export const INSTAGRAM_META_SOURCE = "API Meta (Instagram Business Discovery)";
export const INSTAGRAM_APIFY_SOURCE = "Apify · Instagram Reel Scraper + Profile Scraper";

const MISSING_CONFIG =
  "Instagram nécessite APIFY_TOKEN ou l'API Meta (INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID) : voir Réglages.";

function notFound(username: string): SourceError {
  return new SourceError(`Compte introuvable sur Instagram : vérifiez le pseudo (@${username}).`, 404);
}

/** `APIFY_INSTAGRAM_SHARES=1` opts into the reel scraper's paid shares add-on. */
export function instagramSharesEnabled(env: Env): boolean {
  return /^(1|true|yes|oui|on)$/i.test(env.APIFY_INSTAGRAM_SHARES?.trim() ?? "");
}

// ---------------------------------------------------------------------------
// Apify (pure)
// ---------------------------------------------------------------------------

/** Output row of apify/instagram-reel-scraper (fields we use; same item as the hashtag scraper plus add-ons). */
export interface ApifyInstagramReel extends ApifyInstagramItem {
  /** Only with `includeSharesCount` (paid add-on). */
  sharesCount?: number;
  /** Only with `includeTranscript` (paid add-on, not requested). */
  transcript?: string;
}

/** Output row of apify/instagram-profile-scraper (fields we use). */
export interface ApifyInstagramProfile {
  id?: string;
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  isBusinessAccount?: boolean;
}

export const INSTAGRAM_REEL_FIELDS = [
  "id",
  "type",
  "shortCode",
  "url",
  "inputUrl",
  "caption",
  "hashtags",
  "timestamp",
  "likesCount",
  "commentsCount",
  "videoPlayCount",
  "igPlayCount",
  "reshareCount",
  "sharesCount",
  "ownerUsername",
  "ownerFullName",
  "productType",
  "videoDuration",
  "isPinned",
  "musicInfo",
  "transcript",
  "error",
  "errorDescription",
];

export const INSTAGRAM_PROFILE_FIELDS = [
  "id",
  "username",
  "url",
  "fullName",
  "biography",
  "followersCount",
  "postsCount",
  "verified",
  "private",
  "isBusinessAccount",
  "inputUrl",
  "error",
  "errorDescription",
];

/** Pure: reel scraper input — latest reels of one profile, pinned ones skipped (they can be years old). */
export function buildInstagramReelInput(username: string, maxPosts: number, { includeSharesCount = false } = {}) {
  return {
    username: [username],
    resultsLimit: maxPosts,
    skipPinnedPosts: true,
    ...(includeSharesCount ? { includeSharesCount: true } : {}),
  };
}

/** Pure: profile scraper input. */
export function buildInstagramProfileInput(username: string) {
  return { usernames: [username] };
}

function shortCodeOf(item: ApifyInstagramReel): string | undefined {
  if (item.shortCode) return item.shortCode;
  return item.url?.match(/instagram\.com\/(?:p|reels?)\/([\w-]+)/)?.[1];
}

export interface ReelMapping {
  posts: CreatorPost[];
  hiddenLikes: number;
  missingViews: number;
}

/** Pure: reel scraper rows → posts (permalinks `/reel/{shortCode}/`, plays as views, -1 likes = hidden). */
export function instagramReelsToCreatorPosts(items: ApifyInstagramReel[]): ReelMapping {
  const posts: CreatorPost[] = [];
  let hiddenLikes = 0;
  let missingViews = 0;
  for (const item of items) {
    if (item.productType && item.productType !== "clips") continue;
    const shortCode = shortCodeOf(item);
    if (!shortCode) continue;
    const views = toCount(item.videoPlayCount) ?? toCount(item.igPlayCount);
    const likes = toCount(item.likesCount);
    if (views === undefined) missingViews++;
    if (likes === undefined) hiddenLikes++;
    const duration = toCount(item.videoDuration);
    const music = item.musicInfo;
    posts.push({
      id: shortCode,
      url: `https://www.instagram.com/reel/${shortCode}/`,
      ...captionParts(item.caption, "Reel sans légende"),
      publishedAt: toIso(item.timestamp),
      kind: "short_video",
      durationSec: duration ? Math.round(duration) : undefined,
      metrics: {
        views,
        likes,
        comments: toCount(item.commentsCount),
        shares: toCount(item.sharesCount) ?? toCount(item.reshareCount),
      },
      hashtags: item.hashtags?.length ? uniqueTags(item.hashtags) : extractHashtags(item.caption),
      music: music && music.uses_original_audio === false ? musicLabel(music.song_name, music.artist_name) : undefined,
      pinned: item.isPinned ? true : undefined,
      transcript: truncate(item.transcript, 3000),
    });
  }
  return { posts, hiddenLikes, missingViews };
}

export function instagramProfileToAccount(profile: ApifyInstagramProfile | undefined, username: string, fallbackName?: string): CreatorAccount {
  const handle = profile?.username?.toLowerCase() || username;
  return {
    platform: "instagram",
    handle,
    displayName: profile?.fullName?.trim() || fallbackName,
    url: creatorProfileUrl("instagram", handle),
    followers: toCount(profile?.followersCount),
    totalPosts: toCount(profile?.postsCount),
    bio: truncate(profile?.biography, BIO_MAX),
    verified: profile?.verified ?? undefined,
  };
}

function isNotFoundRow(row: ApifyErrorRow): boolean {
  return /not[_ -]?found|does not exist|doesn't exist/i.test(`${row.error} ${row.errorDescription ?? ""}`);
}

type Settled<T> = { ok: true; value: ApifyRunResult<T> } | { ok: false; error: unknown };

export interface InstagramApifyRuns {
  reels: Settled<ApifyInstagramReel>;
  profile: Settled<ApifyInstagramProfile>;
}

/**
 * Pure: both actor runs → CreatorData. Throws SourceError when the account
 * does not exist, is private or has no public reel.
 */
export function instagramApifyToCreatorData(
  username: string,
  { reels, profile }: InstagramApifyRuns,
  { now, maxPosts, sharesRequested }: { now: number; maxPosts: number; sharesRequested: boolean },
): CreatorData {
  const profileItem = profile.ok
    ? (profile.value.items.find((item) => item.username?.toLowerCase() === username) ?? profile.value.items[0])
    : undefined;
  const profileNotFound = profile.ok && !profileItem && profile.value.errorRows.some(isNotFoundRow);
  if (profileItem?.private) {
    throw new SourceError(`Le compte Instagram @${username} est privé : ses reels ne sont pas accessibles.`);
  }
  if (!reels.ok) {
    if (profileNotFound) throw notFound(username);
    throw reels.error instanceof SourceError ? reels.error : new SourceError(errorMessage(reels.error));
  }

  const { posts, hiddenLikes, missingViews } = instagramReelsToCreatorPosts(reels.value.items);
  if (posts.length === 0) {
    if (profileNotFound || (!profileItem && reels.value.errorRows.some(isNotFoundRow))) throw notFound(username);
    throw new SourceError(`Aucun reel public sur le compte Instagram @${username} (seuls les reels sont analysés).`);
  }

  const owner = reels.value.items.find((item) => item.ownerUsername?.toLowerCase() === username);
  const account = instagramProfileToAccount(profileItem, username, owner?.ownerFullName);
  const shown = Math.min(posts.length, maxPosts);
  return buildCreatorData({
    account,
    posts,
    source: INSTAGRAM_APIFY_SOURCE,
    now,
    maxPosts,
    warnings: [
      !profile.ok && `Profil Instagram indisponible (${errorMessage(profile.error)}).`,
      account.followers === undefined && noAudienceWarning("Nombre d'abonnés Instagram indisponible"),
      missingViews > 0 && `Vues non fournies par Instagram pour ${plural(missingViews, "reel")}.`,
      hiddenLikes > 0 && `Likes masqués par le créateur sur ${plural(hiddenLikes, "reel")}.`,
      sharesRequested
        ? posts.some((post) => post.metrics.shares !== undefined)
          ? undefined
          : "Partages Instagram demandés mais non renvoyés (option réservée aux offres Apify payantes)."
        : "Partages Instagram non récupérés : option payante de l'acteur Apify (≈ 0,007 $ par reel, offre Apify payante), activable avec APIFY_INSTAGRAM_SHARES=1. Instagram ne publie pas les enregistrements.",
      `Seuls les reels sont analysés (${plural(shown, "reel")}, épinglés exclus) : les photos et carrousels ne sont pas lus par cette source.`,
    ],
  });
}

async function fetchInstagramApify(username: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const token = options.env.APIFY_TOKEN?.trim() ?? "";
  const maxChargeUsd = apifyMaxChargeUsd(options.env);
  const sharesRequested = instagramSharesEnabled(options.env);
  const settle = <T>(promise: Promise<ApifyRunResult<T>>): Promise<Settled<T>> =>
    promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  const [reels, profile] = await Promise.all([
    settle(
      runApifyActorDetailed<ApifyInstagramReel>(
        INSTAGRAM_REEL_ACTOR,
        buildInstagramReelInput(username, options.maxPosts, { includeSharesCount: sharesRequested }),
        { token, signal: options.signal, maxChargeUsd, fields: INSTAGRAM_REEL_FIELDS },
      ),
    ),
    settle(
      runApifyActorDetailed<ApifyInstagramProfile>(INSTAGRAM_PROFILE_ACTOR, buildInstagramProfileInput(username), {
        token,
        signal: options.signal,
        maxChargeUsd,
        fields: INSTAGRAM_PROFILE_FIELDS,
      }),
    ),
  ]);
  return instagramApifyToCreatorData(username, { reels, profile }, { now: options.now, maxPosts: options.maxPosts, sharesRequested });
}

// ---------------------------------------------------------------------------
// Meta Business Discovery
// ---------------------------------------------------------------------------

/** Public IG Media fields readable through Business Discovery (shares/saves are not). */
export const CREATOR_DISCOVERY_MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,like_count,comments_count,view_count,permalink,shortcode,timestamp";

/**
 * Pure: Business Discovery request. Only fields Meta marks "Public" on IG User
 * are asked (`name` is not one of them).
 */
export function buildCreatorDiscoveryUrl({
  version,
  igUserId,
  token,
  username,
  limit,
}: {
  version: string;
  igUserId: string;
  token: string;
  username: string;
  limit: number;
}): string {
  const params = new URLSearchParams({
    fields: `business_discovery.username(${username}){username,biography,followers_count,media_count,media.limit(${limit}){${CREATOR_DISCOVERY_MEDIA_FIELDS}}}`,
    access_token: token,
  });
  return `${GRAPH_HOST}/${version}/${encodeURIComponent(igUserId)}?${params}`;
}

export interface CreatorDiscoveryMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  /** Omitted when the owner hides likes. */
  like_count?: number;
  comments_count?: number;
  /** Reels only; includes paid views and Facebook views of crossposted reels. */
  view_count?: number;
  permalink?: string;
  shortcode?: string;
  timestamp?: string;
}

export interface CreatorDiscoveryResponse {
  business_discovery?: {
    id?: string;
    username?: string;
    biography?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data?: CreatorDiscoveryMedia[] };
  };
  id?: string;
}

/** Pure: Business Discovery → CreatorData (reels as short videos, photos/carousels as posts). */
export function businessDiscoveryToCreatorData(
  response: CreatorDiscoveryResponse,
  username: string,
  { now, maxPosts }: { now: number; maxPosts: number },
): CreatorData {
  const user = response.business_discovery;
  if (!user) throw notProfessional(username);
  const posts: CreatorPost[] = [];
  let hiddenLikes = 0;
  let stills = 0;
  for (const media of user.media?.data ?? []) {
    if (media.media_product_type === "STORY" || media.media_product_type === "AD") continue;
    const url = media.permalink ?? (media.shortcode ? `https://www.instagram.com/p/${media.shortcode}/` : undefined);
    if (!url) continue;
    const isVideo = media.media_product_type === "REELS" || media.media_type === "VIDEO";
    if (!isVideo) stills++;
    const likes = toCount(media.like_count);
    if (likes === undefined) hiddenLikes++;
    posts.push({
      id: media.shortcode ?? media.id ?? shortHash(url),
      url,
      ...captionParts(media.caption, isVideo ? "Reel sans légende" : "Publication sans légende"),
      publishedAt: toIso(media.timestamp),
      kind: isVideo ? "short_video" : "social_post",
      metrics: { views: toCount(media.view_count), likes, comments: toCount(media.comments_count) },
      hashtags: extractHashtags(media.caption),
    });
  }
  const handle = user.username?.toLowerCase() || username;
  if (posts.length === 0) throw new SourceError(`Aucune publication publique sur le compte Instagram @${handle}.`);
  const account: CreatorAccount = {
    platform: "instagram",
    handle,
    url: creatorProfileUrl("instagram", handle),
    followers: toCount(user.followers_count),
    totalPosts: toCount(user.media_count),
    bio: truncate(user.biography, BIO_MAX),
  };
  return buildCreatorData({
    account,
    posts,
    source: INSTAGRAM_META_SOURCE,
    now,
    maxPosts,
    warnings: [
      account.followers === undefined && noAudienceWarning("Nombre d'abonnés non renvoyé par Meta"),
      "Vues fournies par Meta : elles incluent les vues sponsorisées et, pour les reels partagés sur Facebook, les vues Facebook.",
      "Partages et enregistrements non fournis par l'API Meta pour un autre compte que le vôtre.",
      hiddenLikes > 0 && `Likes masqués par le créateur sur ${plural(hiddenLikes, "publication")}.`,
      stills > 0 && `${plural(stills, "photo ou carrousel", "photos ou carrousels")} inclus : Meta ne donne des vues que pour les reels.`,
    ],
  });
}

function notProfessional(username: string): SourceError {
  return new SourceError(
    `Compte Instagram @${username} introuvable ou non professionnel : l'API Meta ne peut lire que les comptes Créateur ou Entreprise. Vérifiez le pseudo, ou renseignez APIFY_TOKEN pour analyser n'importe quel compte public.`,
    404,
  );
}

async function fetchInstagramMeta(username: string, options: FetchCreatorOptions, token: string, igUserId: string): Promise<CreatorData> {
  const url = buildCreatorDiscoveryUrl({ version: graphVersion(options.env), igUserId, token, username, limit: options.maxPosts });
  const context = { part: "discovery" as const, username };
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal: options.signal, timeoutMs: 20_000, headers: { Accept: "application/json" } });
  } catch (error) {
    throw new GraphApiError(`API Instagram : ${scrubSecrets(errorMessage(error))}`, "transient");
  }
  const text = await response.text().catch(() => "");
  let body: CreatorDiscoveryResponse & { error?: unknown };
  try {
    body = JSON.parse(text) as CreatorDiscoveryResponse & { error?: unknown };
  } catch {
    if (!response.ok) throw graphError(response.status, text, context);
    throw new GraphApiError("L'API Instagram a renvoyé une réponse JSON invalide.", "other");
  }
  if (!response.ok || body.error) {
    const error = graphError(response.status, text, context);
    throw error.kind === "not_found" ? notProfessional(username) : error;
  }
  return businessDiscoveryToCreatorData(body, username, { now: options.now, maxPosts: options.maxPosts });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Throws SourceError (French) when unavailable, not found, private or empty. */
export async function fetchInstagramCreator(username: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const metaToken = options.env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? "";
  const igUserId = options.env.INSTAGRAM_USER_ID?.trim() ?? "";
  const hasMeta = Boolean(metaToken && igUserId);
  const hasApify = Boolean(options.env.APIFY_TOKEN?.trim());
  if (!hasMeta && !hasApify) throw new SourceError(MISSING_CONFIG);
  if (!hasMeta) return fetchInstagramApify(username, options);
  try {
    return await fetchInstagramMeta(username, options, metaToken, igUserId);
  } catch (error) {
    if (!hasApify || options.signal.aborted) throw error;
    const data = await fetchInstagramApify(username, options);
    const reason =
      error instanceof SourceError && error.status === 404 ? "compte introuvable ou non professionnel" : errorMessage(error);
    return {
      ...data,
      warnings: [`API Meta inutilisable pour ce compte (${reason}) : données récupérées via Apify.`, ...data.warnings],
    };
  }
}
