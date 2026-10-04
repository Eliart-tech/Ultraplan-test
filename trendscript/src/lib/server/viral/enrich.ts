/**
 * "Ce qui cartonne" — follower counts of the authors, so views can be
 * compared with each creator's own audience.
 *
 * - Instagram: reel rows carry no follower count. For the unique owners of
 *   the ~15 most viewed reels: Meta Business Discovery when
 *   INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID are set (free, exact, one call
 *   per owner, Creator / Business accounts only), and ONE run of
 *   `apify/instagram-profile-scraper` for the owners Meta could not read (or
 *   all of them without Meta; ≈ 0,0026 $ per profile).
 * - YouTube: `channels.list?part=snippet,statistics&id=…` (≤ 50 ids, 1 quota
 *   unit): subscribers (rounded by YouTube; none when hidden) and handles.
 * - TikTok: already on every row (`authorMeta.fans`); nothing to do.
 *
 * Enrichment never fails the analysis: what could not be read is left
 * unknown (no multiplier) and explained in French notes.
 */

import type { ViralPlatform } from "../../types";
import type { ViralPostInput } from "../../viral/score";
import { cached } from "../cache";
import { YOUTUBE_CHANNEL_ID, creatorProfileUrl } from "../creators/handles";
import { INSTAGRAM_PROFILE_ACTOR, INSTAGRAM_PROFILE_FIELDS, type ApifyInstagramProfile } from "../creators/instagram";
import type { YoutubeChannelsResponse } from "../creators/youtube";
import { SourceError, fetchWithTimeout } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed } from "../sources/apify";
import { GRAPH_HOST, GraphApiError, graphError, graphVersion } from "../sources/instagram-graph";
import { errorMessage, mapWithConcurrency, scrubSecrets, toCount } from "../sources/social-utils";
import type { Env } from "../sources/types";
import { YOUTUBE_API } from "../sources/youtube";
import { youtubeJson } from "./collect";

/** Owners of the most viewed reels whose followers are fetched. */
export const INSTAGRAM_ENRICH_REELS = 15;
const INSTAGRAM_FOLLOWERS_TTL_MS = 24 * 60 * 60 * 1000;
const YOUTUBE_CHANNELS_TTL_MS = 6 * 60 * 60 * 1000;
const META_CONCURRENCY = 4;

export interface EnrichContext {
  env: Env;
  /** Timeout signal owned by the orchestrator (results are shared through the cache). */
  signal: AbortSignal;
}

export interface EnrichResult {
  /** Same videos, with the authors' followers (and YouTube handles) filled in where they could be read. */
  posts: ViralPostInput[];
  /** French notes per platform (what was read, through what, what is missing). */
  notes: Partial<Record<ViralPlatform, string[]>>;
}

export interface AuthorFacts {
  followers?: number;
  handle?: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Unique owners of the most viewed Instagram reels whose followers are unknown. */
export function topInstagramOwners(posts: readonly ViralPostInput[], maxReels = INSTAGRAM_ENRICH_REELS): string[] {
  const owners: string[] = [];
  const ranked = posts
    .filter((post) => post.platform === "instagram" && post.author.followers === undefined)
    .sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0))
    .slice(0, maxReels);
  for (const post of ranked) if (!owners.includes(post.author.handle)) owners.push(post.author.handle);
  return owners;
}

/** Channel ids of the YouTube videos (the author handle is the channel id until enrichment). */
export function youtubeChannelIds(posts: readonly ViralPostInput[]): string[] {
  return [
    ...new Set(
      posts.filter((post) => post.platform === "youtube" && YOUTUBE_CHANNEL_ID.test(post.author.handle)).map((post) => post.author.handle),
    ),
  ];
}

/** Business Discovery restricted to what the lab needs (one call per owner). */
export function buildFollowersDiscoveryUrl({
  version,
  igUserId,
  token,
  username,
}: {
  version: string;
  igUserId: string;
  token: string;
  username: string;
}): string {
  const params = new URLSearchParams({
    fields: `business_discovery.username(${username}){username,followers_count}`,
    access_token: token,
  });
  return `${GRAPH_HOST}/${version}/${encodeURIComponent(igUserId)}?${params}`;
}

/** channels.list for up to 50 ids — 1 quota unit whatever the parts. */
export function buildYoutubeChannelsStatsUrl(ids: string[], apiKey: string): string {
  const params = new URLSearchParams({ part: "snippet,statistics", id: ids.slice(0, 50).join(","), maxResults: "50", key: apiKey });
  return `${YOUTUBE_API}/channels?${params}`;
}

/** Pure: channels.list → channel id → subscribers (undefined when hidden) and handle. */
export function youtubeChannelFacts(response: YoutubeChannelsResponse): Map<string, AuthorFacts> {
  const facts = new Map<string, AuthorFacts>();
  for (const channel of response.items ?? []) {
    if (!channel.id) continue;
    const custom = channel.snippet?.customUrl?.trim();
    facts.set(channel.id, {
      followers: channel.statistics?.hiddenSubscriberCount ? undefined : toCount(channel.statistics?.subscriberCount),
      handle: custom?.startsWith("@") ? custom.slice(1) : undefined,
      displayName: channel.snippet?.title?.trim() || undefined,
    });
  }
  return facts;
}

/** Pure: profile scraper rows → username → followers. */
export function instagramProfileFollowers(items: ApifyInstagramProfile[]): Map<string, number> {
  const followers = new Map<string, number>();
  for (const item of items) {
    const username = item.username?.trim().toLowerCase();
    const count = toCount(item.followersCount);
    if (username && count !== undefined) followers.set(username, count);
  }
  return followers;
}

/** Pure: copies of the posts of `platform` with the authors' facts applied (keyed by the current author handle). */
export function applyAuthorFacts(
  posts: readonly ViralPostInput[],
  platform: ViralPlatform,
  facts: ReadonlyMap<string, AuthorFacts>,
): ViralPostInput[] {
  return posts.map((post) => {
    const fact = post.platform === platform ? facts.get(post.author.handle) : undefined;
    if (!fact) return post;
    const handle = fact.handle ?? post.author.handle;
    const displayName = fact.displayName ?? post.author.displayName;
    return {
      ...post,
      author: {
        ...post.author,
        handle,
        ...(displayName ? { displayName } : {}),
        ...(fact.followers !== undefined ? { followers: fact.followers } : {}),
        url: creatorProfileUrl(platform, handle),
      },
    };
  });
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

interface InstagramFollowers {
  /** username → followers, as [username, followers] pairs (JSON-safe for the cache). */
  followers: [string, number][];
  viaMeta: number;
  viaApify: number;
  failures: string[];
}

async function metaFollowers(username: string, env: Env, signal: AbortSignal): Promise<number> {
  const url = buildFollowersDiscoveryUrl({
    version: graphVersion(env),
    igUserId: env.INSTAGRAM_USER_ID?.trim() ?? "",
    token: env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? "",
    username,
  });
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal, timeoutMs: 15_000, headers: { Accept: "application/json" } });
  } catch (error) {
    throw new GraphApiError(`API Instagram : ${scrubSecrets(errorMessage(error))}`, "transient");
  }
  const text = await response.text().catch(() => "");
  let body: { business_discovery?: { followers_count?: number }; error?: unknown } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // handled below
  }
  if (!response.ok || body.error) throw graphError(response.status, text, { part: "discovery", username });
  const followers = toCount(body.business_discovery?.followers_count);
  if (followers === undefined) throw new GraphApiError(`Compte @${username} : nombre d'abonnés non renvoyé par Meta.`, "not_found");
  return followers;
}

async function fetchInstagramFollowers(owners: string[], env: Env, signal: AbortSignal): Promise<InstagramFollowers> {
  const result = new Map<string, number>();
  const failures: string[] = [];
  let viaMeta = 0;
  let viaApify = 0;
  const hasMeta = Boolean(env.INSTAGRAM_ACCESS_TOKEN?.trim() && env.INSTAGRAM_USER_ID?.trim());
  const apifyToken = env.APIFY_TOKEN?.trim();

  if (hasMeta) {
    const settled = await mapWithConcurrency(owners, META_CONCURRENCY, (username) => metaFollowers(username, env, signal));
    const blocking = new Set<string>();
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        result.set(owners[index], outcome.value);
        viaMeta++;
      } else if (!(outcome.reason instanceof GraphApiError && outcome.reason.kind === "not_found")) {
        // Token, permission or rate limit: say it once.
        blocking.add(errorMessage(outcome.reason));
      }
    });
    for (const message of blocking) failures.push(`API Meta : ${message}`);
  }

  const remaining = owners.filter((username) => !result.has(username));
  if (remaining.length > 0 && apifyToken) {
    try {
      const { items } = await runApifyActorDetailed<ApifyInstagramProfile>(
        INSTAGRAM_PROFILE_ACTOR,
        { usernames: remaining },
        { token: apifyToken, signal, maxChargeUsd: apifyMaxChargeUsd(env), fields: INSTAGRAM_PROFILE_FIELDS },
      );
      for (const [username, followers] of instagramProfileFollowers(items)) {
        if (!remaining.includes(username) || result.has(username)) continue;
        result.set(username, followers);
        viaApify++;
      }
    } catch (error) {
      failures.push(`Apify (profils Instagram) : ${errorMessage(error)}`);
    }
  }
  return { followers: [...result], viaMeta, viaApify, failures };
}

function instagramRoute(env: Env): string {
  const meta = Boolean(env.INSTAGRAM_ACCESS_TOKEN?.trim() && env.INSTAGRAM_USER_ID?.trim());
  return `${meta ? "meta" : ""}${env.APIFY_TOKEN?.trim() ? "+apify" : ""}`;
}

async function enrichInstagram(posts: ViralPostInput[], { env, signal }: EnrichContext): Promise<{ posts: ViralPostInput[]; notes: string[] }> {
  const owners = topInstagramOwners(posts);
  if (owners.length === 0) return { posts, notes: [] };
  const key = `viral:followers:instagram:${instagramRoute(env)}:${[...owners].sort().join(",")}`;
  const { value } = await cached(key, INSTAGRAM_FOLLOWERS_TTL_MS, async () => {
    const fetched = await fetchInstagramFollowers(owners, env, signal);
    // Never keep a failed lookup for 24 h.
    if (fetched.followers.length === 0 && fetched.failures.length > 0) throw new SourceError(fetched.failures.join(" ; "));
    return fetched;
  }).catch((error: unknown) => ({
    value: { followers: [], viaMeta: 0, viaApify: 0, failures: [errorMessage(error)] } as InstagramFollowers,
  }));

  const facts = new Map<string, AuthorFacts>(value.followers.map(([username, followers]) => [username, { followers }]));
  const enriched = applyAuthorFacts(posts, "instagram", facts);
  const reels = enriched.filter((post) => post.platform === "instagram");
  const known = reels.filter((post) => post.author.followers !== undefined).length;
  const via = [
    value.viaMeta > 0 ? `${value.viaMeta} via l'API Meta` : "",
    value.viaApify > 0 ? `${value.viaApify} via Apify` : "",
  ].filter(Boolean);
  const notes = [
    `Abonnés lus pour ${facts.size} des ${plural(owners.length, "auteur")} des ${INSTAGRAM_ENRICH_REELS} reels les plus vus${via.length ? ` (${via.join(", ")})` : ""} : multiplicateur calculable pour ${plural(known, "reel")} sur ${reels.length}.`,
    facts.size < owners.length && value.viaMeta > 0
      ? "L'API Meta ne lit que les comptes Créateur ou Entreprise ; les autres comptes restent sans abonnés connus sans APIFY_TOKEN."
      : "",
    ...value.failures.map((failure) => `Abonnés Instagram en partie indisponibles (${failure}).`),
  ].filter(Boolean);
  return { posts: enriched, notes };
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

async function fetchYoutubeChannels(ids: string[], apiKey: string, signal: AbortSignal): Promise<[string, AuthorFacts][]> {
  const facts: [string, AuthorFacts][] = [];
  for (let start = 0; start < ids.length; start += 50) {
    const response = await youtubeJson<YoutubeChannelsResponse>(
      buildYoutubeChannelsStatsUrl(ids.slice(start, start + 50), apiKey),
      "YouTube (chaînes)",
      signal,
    );
    facts.push(...youtubeChannelFacts(response));
  }
  return facts;
}

async function enrichYoutube(posts: ViralPostInput[], { env, signal }: EnrichContext): Promise<{ posts: ViralPostInput[]; notes: string[] }> {
  const ids = youtubeChannelIds(posts);
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (ids.length === 0 || !apiKey) return { posts, notes: [] };
  try {
    const { value } = await cached(`viral:channels:youtube:${[...ids].sort().join(",")}`, YOUTUBE_CHANNELS_TTL_MS, () =>
      fetchYoutubeChannels(ids, apiKey, signal),
    );
    const facts = new Map(value);
    const hidden = value.filter(([, fact]) => fact.followers === undefined).length;
    return {
      posts: applyAuthorFacts(posts, "youtube", facts),
      notes: [
        `Abonnés lus pour ${plural(value.length - hidden, "chaîne")} sur ${ids.length} (arrondis par YouTube à 3 chiffres significatifs).`,
        hidden > 0 ? `${plural(hidden, "chaîne masque", "chaînes masquent")} son nombre d'abonnés.` : "",
      ].filter(Boolean),
    };
  } catch (error) {
    return { posts, notes: [`Abonnés YouTube indisponibles (${errorMessage(error)}).`] };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Fills the authors' followers where they can be read (Instagram and YouTube
 * in parallel; TikTok rows already carry them). Never throws for an upstream
 * failure.
 */
export async function enrichFollowers(posts: ViralPostInput[], ctx: EnrichContext): Promise<EnrichResult> {
  const [instagram, youtube] = await Promise.all([enrichInstagram(posts, ctx), enrichYoutube(posts, ctx)]);
  const notes: EnrichResult["notes"] = {};
  if (instagram.notes.length) notes.instagram = instagram.notes;
  if (youtube.notes.length) notes.youtube = youtube.notes;
  // Both return one copy per input post, in the same order.
  const merged = posts.map((post, index) =>
    post.platform === "instagram" ? instagram.posts[index] : post.platform === "youtube" ? youtube.posts[index] : post,
  );
  return { posts: merged, notes };
}
