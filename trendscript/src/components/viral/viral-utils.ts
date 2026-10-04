/**
 * Pure helpers of the "Ce qui cartonne" page and of its Studio integration:
 * tiers, platform summaries, filters and sorting of the videos, default lab
 * report for a script, keyword suggestions, scatter-plot geometry (log
 * scales). No React, unit-tested.
 */

import { resolvePosts } from "@/components/competitors/report-utils";
import { formatCompact } from "@/lib/client/format";
import { isViralMetricsStripped, viralReportKey } from "@/lib/client/storage";
import { stripAccents, tokenize } from "@/lib/analysis/text";
import type {
  ScriptPlatform,
  Topic,
  ViralPatterns,
  ViralPlatform,
  ViralPlatformSummary,
  ViralPost,
  ViralReport,
  ViralTier,
} from "@/lib/types";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// ---------------------------------------------------------------------------
// Platforms, links, titles
// ---------------------------------------------------------------------------

/** Order of the platform toggles and filters. */
export const VIRAL_PLATFORM_ORDER: ViralPlatform[] = ["instagram", "tiktok", "youtube"];

/** Keywords per lab run (API schema limit). */
export const MAX_VIRAL_KEYWORDS = 5;

/** URL of a saved lab report (by `viralReportKey`). */
export function viralReportHref(key: string): string {
  return `/ce-qui-cartonne?rapport=${encodeURIComponent(key)}`;
}

/** "budget · épargne · #frugalite" — the keywords as the user typed them. */
export function keywordsLabel(keywords: readonly string[]): string {
  return keywords.map((keyword) => keyword.trim()).filter(Boolean).join(" · ");
}

/** Name of a report: its niche, else its keywords. */
export function viralReportTitle(report: Pick<ViralReport, "request">): string {
  return report.request.niche.trim() || keywordsLabel(report.request.keywords) || "Ma niche";
}

/** A platform's availability on this server (GET /api/sources `viral`). */
export interface PlatformAvailability {
  platform: ViralPlatform;
  available: boolean;
}

/**
 * Platforms a run will ask for: the explicit choice, else every available
 * one; unavailable platforms are dropped once the server said so. Display
 * order. While capabilities are unknown (loading, older server) the choice —
 * or all three — is kept: the server reports unconfigured platforms itself.
 */
export function effectiveViralPlatforms(
  chosen: readonly ViralPlatform[] | null,
  capabilities: readonly PlatformAvailability[] | null,
): ViralPlatform[] {
  const wanted = new Set(chosen ?? VIRAL_PLATFORM_ORDER);
  if (!capabilities) return VIRAL_PLATFORM_ORDER.filter((platform) => wanted.has(platform));
  const available = new Set(capabilities.filter((item) => item.available).map((item) => item.platform));
  return VIRAL_PLATFORM_ORDER.filter((platform) => wanted.has(platform) && available.has(platform));
}

/** Script target matching a lab platform (TikTok video → TikTok script). */
export function scriptPlatformForViral(platform: ViralPlatform): ScriptPlatform {
  if (platform === "instagram") return "instagram_reels";
  if (platform === "youtube") return "youtube_shorts";
  return "tiktok";
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const TIER_ORDER: ViralTier[] = ["explose", "cartonne", "bon", "normal"];

export interface TierMeta {
  /** "Explose" */
  label: string;
  /** Plural for counters: "explosent". */
  verb: string;
  /** The rule, in French ("≥ ×10 son audience"). */
  rule: string;
}

/**
 * Starting thresholds of the scoring (views ÷ the author's followers): to be
 * calibrated on real French data — the UI says so.
 */
export const TIER_META: Record<ViralTier, TierMeta> = {
  explose: { label: "Explose", verb: "explosent", rule: "au moins ×10 son audience" },
  cartonne: { label: "Cartonne", verb: "cartonnent", rule: "au moins ×3 son audience, ou ×3 les comptes de sa taille" },
  bon: { label: "Bon", verb: "au-dessus de leur audience", rule: "plus de vues que d'abonnés (×1)" },
  normal: { label: "Dans la norme", verb: "dans la norme", rule: "moins de vues que d'abonnés, ou audience inconnue" },
};

/** Videos per tier. */
export function tierCounts(posts: readonly ViralPost[]): Record<ViralTier, number> {
  const counts: Record<ViralTier, number> = { explose: 0, cartonne: 0, bon: 0, normal: 0 };
  for (const post of posts) counts[TIER_ORDER.includes(post.tier) ? post.tier : "normal"]++;
  return counts;
}

/** Explose + cartonne. */
export function isBreakout(post: Pick<ViralPost, "tier">): boolean {
  return post.tier === "explose" || post.tier === "cartonne";
}

// ---------------------------------------------------------------------------
// Ratios and expiry
// ---------------------------------------------------------------------------

/** Summary of a platform in a report. */
export function platformSummary(report: Pick<ViralReport, "platforms">, platform: ViralPlatform): ViralPlatformSummary | undefined {
  return report.platforms.find((summary) => summary.platform === platform);
}

/**
 * False when the source's terms forbid derived metrics for this platform
 * (YouTube Data API without the amendment): raw counts only, no ratio ever
 * computed by the UI. YouTube without a summary is treated as restricted.
 */
export function ratiosAllowedFor(report: Pick<ViralReport, "platforms">, platform: ViralPlatform): boolean {
  const summary = platformSummary(report, platform);
  if (summary) return summary.ratiosAllowed !== false;
  return platform !== "youtube";
}

/** True for a YouTube video whose statistics were erased (30-day rule). */
export function isExpiredPost(report: ViralReport, post: Pick<ViralPost, "platform">): boolean {
  return post.platform === "youtube" && isViralMetricsStripped(report);
}

/** Platforms of the report that returned at least one video, in display order. */
export function reportPlatforms(report: Pick<ViralReport, "posts">): ViralPlatform[] {
  const present = new Set(report.posts.map((post) => post.platform));
  return VIRAL_PLATFORM_ORDER.filter((platform) => present.has(platform));
}

// ---------------------------------------------------------------------------
// Filters and sorting
// ---------------------------------------------------------------------------

export type ViralSort = "rank" | "multiplier" | "views" | "velocity" | "recent";
export type TierFilter = ViralTier | "all" | "top";

export interface ViralFilters {
  platform: ViralPlatform | "all";
  tier: TierFilter;
  sort: ViralSort;
}

export const DEFAULT_FILTERS: ViralFilters = { platform: "all", tier: "all", sort: "rank" };

export const SORT_LABELS: Record<ViralSort, string> = {
  rank: "Classement (niveau, puis × audience)",
  multiplier: "× son audience",
  views: "Vues",
  velocity: "Vues par jour",
  recent: "Plus récentes",
};

export function matchesTier(post: Pick<ViralPost, "tier">, tier: TierFilter): boolean {
  if (tier === "all") return true;
  if (tier === "top") return isBreakout(post);
  return post.tier === tier;
}

/** Posts of a platform / tier (the server order is kept). */
export function filterViralPosts(posts: readonly ViralPost[], filters: Pick<ViralFilters, "platform" | "tier">): ViralPost[] {
  return posts.filter(
    (post) => (filters.platform === "all" || post.platform === filters.platform) && matchesTier(post, filters.tier),
  );
}

/** Descending by a numeric key, missing values last, then the server order. */
function byValue(posts: readonly ViralPost[], value: (post: ViralPost) => number | undefined): ViralPost[] {
  return posts
    .map((post, index) => ({ post, index, value: value(post) }))
    .sort((a, b) => {
      const known = Number(isNumber(b.value)) - Number(isNumber(a.value));
      if (known !== 0) return known;
      if (isNumber(a.value) && isNumber(b.value) && a.value !== b.value) return b.value - a.value;
      return a.index - b.index;
    })
    .map((entry) => entry.post);
}

/** New array sorted for the list ("rank" keeps the server order: tier, then multiplier or views). */
export function sortViralPosts(posts: readonly ViralPost[], sort: ViralSort): ViralPost[] {
  switch (sort) {
    case "multiplier":
      return byValue(posts, (post) => post.multiplier);
    case "views":
      return byValue(posts, (post) => post.metrics.views);
    case "velocity":
      return byValue(posts, (post) => post.viewsPerDay);
    case "recent":
      return byValue(posts, (post) => {
        const time = post.publishedAt ? Date.parse(post.publishedAt) : Number.NaN;
        return Number.isFinite(time) ? time : undefined;
      });
    default:
      return [...posts];
  }
}

// ---------------------------------------------------------------------------
// Posts referenced by Claude
// ---------------------------------------------------------------------------

/** Posts by id (resolve Claude's references with `resolvePosts`). */
export function viralPostIndex(posts: readonly ViralPost[]): Map<string, ViralPost> {
  return new Map(posts.map((post) => [post.id, post]));
}

type Idea = ViralPatterns["ideas"][number];

/** Script platform of an idea: the platform most of its inspiring videos come from. */
export function ideaScriptPlatform(report: ViralReport, idea: Pick<Idea, "inspiredBy">): ScriptPlatform | undefined {
  const index = viralPostIndex(report.posts);
  const counts = new Map<ViralPlatform, number>();
  for (const post of resolvePosts(idea.inspiredBy, index)) counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1);
  let best: ViralPlatform | undefined;
  for (const platform of VIRAL_PLATFORM_ORDER) {
    if ((counts.get(platform) ?? 0) > (best ? (counts.get(best) ?? 0) : 0)) best = platform;
  }
  if (best) return scriptPlatformForViral(best);
  const only = reportPlatforms(report);
  return only.length === 1 ? scriptPlatformForViral(only[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Form: keyword suggestions from the creator profile
// ---------------------------------------------------------------------------

/**
 * Starting keywords from the profile's niche ("Finance perso pour jeunes
 * actifs, budget" → ["Finance perso pour jeunes actifs", "budget"]): the
 * comma / slash / "et" separated parts of 2–40 characters, max 3.
 */
export function keywordsFromNiche(niche: string): string[] {
  const parts = niche
    .split(/[,;/|\n]|\s+(?:et|&|\+)\s+/i)
    .map((part) => part.replace(/^#+/, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2 && part.length <= 40);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of parts) {
    const key = stripAccents(part.toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(part);
    if (keywords.length >= 3) break;
  }
  return keywords;
}

// ---------------------------------------------------------------------------
// Studio: which lab report a script relies on
// ---------------------------------------------------------------------------

/** Select value meaning "don't rely on any lab report". */
export const VIRAL_NONE = "none";

function tokensOf(...values: (string | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of values) if (value) for (const token of tokenize(value)) set.add(token);
  return [...set];
}

/** Same token, or one is a prefix of the other ("budget" ~ "budgets", "epargne" ~ "epargner"). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

/** True when the report's keywords / niche share a meaningful word with the context. */
export function viralReportMatches(report: Pick<ViralReport, "request">, context: string[]): boolean {
  const reportTokens = tokensOf(report.request.niche, ...report.request.keywords);
  return reportTokens.some((token) => context.some((other) => tokensMatch(token, other)));
}

export interface ViralContext {
  topic?: Pick<Topic, "title" | "keywords" | "category"> | null;
  /** The creator profile's niche. */
  niche?: string;
}

/**
 * Default "S'appuyer sur ce qui cartonne": the most recent saved report
 * whose keywords overlap the topic or the creator's niche, else none.
 */
export function defaultViralReport(reports: readonly ViralReport[], context: ViralContext): ViralReport | undefined {
  const words = tokensOf(context.topic?.title, context.topic?.category, ...(context.topic?.keywords ?? []), context.niche);
  if (words.length === 0) return undefined;
  return reports.find((report) => viralReportMatches(report, words));
}

/**
 * The report a script request carries: the explicit choice (a report key, or
 * VIRAL_NONE), else the default. A choice whose report was deleted falls
 * back to the default.
 */
export function selectViralReport(
  reports: readonly ViralReport[],
  choice: string | null | undefined,
  context: ViralContext,
): { report: ViralReport | undefined; auto: boolean } {
  if (choice === VIRAL_NONE) return { report: undefined, auto: false };
  if (choice) {
    const chosen = reports.find((report) => viralReportKey(report) === choice);
    if (chosen) return { report: chosen, auto: false };
  }
  return { report: defaultViralReport(reports, context), auto: true };
}

// ---------------------------------------------------------------------------
// Scatter plot: views vs the author's followers, log scales
// ---------------------------------------------------------------------------

/** Followers are floored at 1 000 in the multiplier: the plot uses the same floor. */
export const FOLLOWER_FLOOR = 1000;

export interface ScatterPoint {
  postId: string;
  /** Author followers, floored at FOLLOWER_FLOOR. */
  followers: number;
  views: number;
  multiplier: number;
  tier: ViralTier;
  platform: ViralPlatform;
  title: string;
  handle: string;
}

/**
 * Videos that can be placed: views and followers known, ratios allowed for
 * the platform, statistics not expired. `excluded` counts the others.
 */
export function scatterPoints(report: ViralReport, posts: readonly ViralPost[]): { points: ScatterPoint[]; excluded: number } {
  const points: ScatterPoint[] = [];
  let excluded = 0;
  for (const post of posts) {
    const views = post.metrics.views;
    const followers = post.author.followers;
    if (
      !isNumber(views) ||
      views <= 0 ||
      !isNumber(followers) ||
      followers < 0 ||
      !ratiosAllowedFor(report, post.platform) ||
      isExpiredPost(report, post)
    ) {
      excluded++;
      continue;
    }
    const floored = Math.max(followers, FOLLOWER_FLOOR);
    points.push({
      postId: post.id,
      followers: floored,
      views,
      multiplier: isNumber(post.multiplier) ? post.multiplier : views / floored,
      tier: post.tier,
      platform: post.platform,
      title: post.title,
      handle: post.author.handle,
    });
  }
  return { points, excluded };
}

/** Powers of ten enclosing the values ([1 000, 1 000 000] for 3 400 … 820 000). */
export function logDomain(values: readonly number[]): [number, number] {
  const positive = values.filter((value) => isNumber(value) && value > 0);
  if (positive.length === 0) return [1, 10];
  const min = 10 ** Math.floor(Math.log10(Math.min(...positive)));
  let max = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  if (max <= min) max = min * 10;
  return [min, max];
}

/** One tick per power of ten of the domain. */
export function logTicks([min, max]: [number, number]): number[] {
  const ticks: number[] = [];
  for (let exponent = Math.round(Math.log10(min)); exponent <= Math.round(Math.log10(max)); exponent++) ticks.push(10 ** exponent);
  return ticks;
}

/** Position of a value on a log axis mapped to [start, end] pixels (start may be > end for y). */
export function logPosition(value: number, [min, max]: [number, number], [start, end]: [number, number]): number {
  if (!(value > 0) || !(min > 0) || !(max > min)) return start;
  const t = (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return start + t * (end - start);
}

/** Index of the point closest to (x, y) within `radius` px, or null. */
export function nearestPoint(points: readonly { x: number; y: number }[], x: number, y: number, radius = 24): number | null {
  let best: number | null = null;
  let bestDistance = radius * radius;
  points.forEach((point, index) => {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** "1 k", "10 k", "1 M" — axis ticks. */
export function formatTick(value: number): string {
  return formatCompact(value);
}
