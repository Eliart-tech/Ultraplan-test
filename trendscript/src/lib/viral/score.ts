/**
 * "Ce qui cartonne" scoring: how far each niche video went beyond its
 * creator's own audience. Deterministic and client-safe — these are the
 * only numbers the lab shows and the only ones Claude may cite.
 *
 * Public signals only (no platform publishes follows per video for other
 * accounts):
 * - multiplier = views ÷ max(followers, 1 000): a video watched far beyond
 *   its creator's audience was pushed to non-followers for its content —
 *   where new followers come from. The floor keeps tiny accounts from
 *   producing absurd ratios.
 * - vsBand = multiplier ÷ median multiplier of the same platform and
 *   follower band (small accounts naturally have higher ratios), when the
 *   band holds at least 8 videos.
 * - viewsPerDay = views ÷ days since publication (at least one day), to
 *   tell fresh breakouts from old evergreen videos.
 * - shareSaveRate = (shares + saves) ÷ views, the "send / save" signals
 *   platforms reward.
 *
 * YouTube (API Developer Policies III.E.4): without the "derived metrics"
 * amendment (YT_DERIVED_METRICS_APPROVED=true) no multiplier, band, vsBand
 * or rate is computed on YouTube data; raw counts and velocity only, and the
 * tier comes from the rank by views within the YouTube videos of the run
 * (top 10 % = "cartonne").
 *
 * Tier thresholds are starting values to calibrate on real French data.
 */

import { median, round, roundRatio, shareSaveRate as rawShareSaveRate } from "../creators/stats";
import type { ViralPlatform, ViralPlatformSummary, ViralPost, ViralTier } from "../types";

const DAY_MS = 86_400_000;

/** Followers counted at least this much in the multiplier. */
export const FOLLOWER_FLOOR = 1_000;
export const EXPLOSE_MULTIPLIER = 10;
export const CARTONNE_MULTIPLIER = 3;
export const CARTONNE_VS_BAND = 3;
export const BON_MULTIPLIER = 1;
/** A band median is only trusted with at least this many videos. */
export const MIN_BAND_VIDEOS = 8;
/** YouTube without ratios: share of the YouTube videos (by views) that "cartonne". */
export const YOUTUBE_TOP_SHARE = 0.1;
/** YouTube API data of other channels may not be kept longer than this. */
export const YOUTUBE_RETENTION_DAYS = 30;

export const FOLLOWER_BANDS = [
  { label: "< 10 k", max: 10_000 },
  { label: "10–100 k", max: 100_000 },
  { label: "100 k–1 M", max: 1_000_000 },
  { label: "> 1 M", max: Number.POSITIVE_INFINITY },
] as const;

const TIER_ORDER: Record<ViralTier, number> = { explose: 0, cartonne: 1, bon: 2, normal: 3 };

/** A collected video before scoring. */
export type ViralPostInput = Omit<ViralPost, "multiplier" | "band" | "vsBand" | "viewsPerDay" | "shareSaveRate" | "tier">;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** "< 10 k", "10–100 k", "100 k–1 M" or "> 1 M"; undefined when followers are unknown. */
export function followerBand(followers: number | undefined): string | undefined {
  if (!isNumber(followers) || followers < 0) return undefined;
  return FOLLOWER_BANDS.find((band) => followers < band.max)?.label;
}

/** views ÷ max(followers, 1 000), 2 decimals; undefined when either is unknown. */
export function audienceMultiplier(views: number | undefined, followers: number | undefined): number | undefined {
  if (!isNumber(views) || views < 0 || !isNumber(followers) || followers < 0) return undefined;
  return roundRatio(views, Math.max(followers, FOLLOWER_FLOOR), 2);
}

/** Views per day since publication (age counted as at least one day), rounded. */
export function viewsPerDay(views: number | undefined, publishedAt: string | undefined, now: number): number | undefined {
  if (!isNumber(views) || !publishedAt) return undefined;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return undefined;
  const days = Math.max(1, (now - time) / DAY_MS);
  return Math.round(views / days);
}

/** (shares + saves) ÷ views in %, 2 decimals. */
export function shareSaveRate(metrics: ViralPost["metrics"]): number | undefined {
  const rate = rawShareSaveRate(metrics);
  return rate === undefined ? undefined : round(rate, 2);
}

/** Tier from the multiplier (and the band comparison). */
export function tierFor(multiplier: number | undefined, vsBand: number | undefined): ViralTier {
  if (multiplier === undefined) return "normal";
  if (multiplier >= EXPLOSE_MULTIPLIER) return "explose";
  if (multiplier >= CARTONNE_MULTIPLIER || (vsBand ?? 0) >= CARTONNE_VS_BAND) return "cartonne";
  if (multiplier >= BON_MULTIPLIER) return "bon";
  return "normal";
}

/** Best first: tier, then multiplier, then views (unknown values last). */
export function compareViralPosts(a: ViralPost, b: ViralPost): number {
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
    (b.multiplier ?? -1) - (a.multiplier ?? -1) ||
    (b.metrics.views ?? -1) - (a.metrics.views ?? -1) ||
    a.id.localeCompare(b.id)
  );
}

export interface ScoreOptions {
  now: number;
  /** false for a platform whose terms forbid derived metrics (YouTube without the amendment). Default true. */
  ratiosAllowed?: Partial<Record<ViralPlatform, boolean>>;
}

function bandKey(platform: ViralPlatform, band: string): string {
  return `${platform}|${band}`;
}

/** YouTube without ratios: the top 10 % by views (at least one video) "cartonne", the rest is "normal". */
function rankTiers(posts: ViralPost[]): void {
  const ranked = posts.filter((post) => isNumber(post.metrics.views)).sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0));
  const top = new Set(ranked.slice(0, Math.ceil(ranked.length * YOUTUBE_TOP_SHARE)).map((post) => post.id));
  for (const post of posts) post.tier = top.has(post.id) ? "cartonne" : "normal";
}

/**
 * Pure: collected videos → scored videos, best first. Never mutates its
 * input; derived values are left undefined when they cannot be computed.
 */
export function scoreViralPosts(posts: readonly ViralPostInput[], { now, ratiosAllowed = {} }: ScoreOptions): ViralPost[] {
  const allowed = (platform: ViralPlatform) => ratiosAllowed[platform] !== false;

  const scored: ViralPost[] = posts.map((input) => {
    const post: ViralPost = { ...input, metrics: { ...input.metrics }, author: { ...input.author }, tier: "normal" };
    const velocity = viewsPerDay(post.metrics.views, post.publishedAt, now);
    if (velocity !== undefined) post.viewsPerDay = velocity;
    if (!allowed(post.platform)) return post;
    const multiplier = audienceMultiplier(post.metrics.views, post.author.followers);
    if (multiplier !== undefined) post.multiplier = multiplier;
    const band = followerBand(post.author.followers);
    if (band) post.band = band;
    const rate = shareSaveRate(post.metrics);
    if (rate !== undefined) post.shareSaveRate = rate;
    return post;
  });

  // Median multiplier per platform × follower band (only bands with enough videos).
  const groups = new Map<string, number[]>();
  for (const post of scored) {
    if (post.band === undefined || post.multiplier === undefined) continue;
    const key = bandKey(post.platform, post.band);
    groups.set(key, [...(groups.get(key) ?? []), post.multiplier]);
  }
  const bandMedians = new Map<string, number>();
  for (const [key, values] of groups) {
    const value = median(values);
    if (values.length >= MIN_BAND_VIDEOS && value !== undefined && value > 0) bandMedians.set(key, value);
  }

  for (const post of scored) {
    if (!allowed(post.platform)) continue;
    const bandMedian = post.band ? bandMedians.get(bandKey(post.platform, post.band)) : undefined;
    if (bandMedian !== undefined && post.multiplier !== undefined) post.vsBand = round(post.multiplier / bandMedian, 1);
    post.tier = tierFor(post.multiplier, post.vsBand);
  }

  const restricted = [...new Set(scored.map((post) => post.platform))].filter((platform) => !allowed(platform));
  for (const platform of restricted) rankTiers(scored.filter((post) => post.platform === platform));

  return scored.sort(compareViralPosts);
}

/** Deterministic part of a platform summary (counts and medians of the scored videos). */
export function platformStats(
  posts: readonly ViralPost[],
  platform: ViralPlatform,
): Pick<ViralPlatformSummary, "count" | "withFollowers" | "medianViews" | "medianMultiplier"> {
  const own = posts.filter((post) => post.platform === platform);
  const medianViews = median(own.map((post) => post.metrics.views));
  const medianMultiplier = median(own.map((post) => post.multiplier));
  return {
    count: own.length,
    withFollowers: own.filter((post) => isNumber(post.author.followers)).length,
    ...(medianViews !== undefined ? { medianViews: Math.round(medianViews) } : {}),
    ...(medianMultiplier !== undefined ? { medianMultiplier: round(medianMultiplier, 2) } : {}),
  };
}

/**
 * True when a report's YouTube statistics are older than YouTube allows for
 * other channels' data (30 days without the derived-metrics amendment): the
 * browser must then drop or hide them.
 */
export function isYoutubeDataExpired(createdAt: string, now: number): boolean {
  const time = Date.parse(createdAt);
  return Number.isNaN(time) || now - time > YOUTUBE_RETENTION_DAYS * DAY_MS;
}
