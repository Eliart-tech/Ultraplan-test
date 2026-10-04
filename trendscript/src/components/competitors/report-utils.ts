/**
 * Pure helpers of the competitor pages and of the Studio integration:
 * platform mapping, handle detection, post metrics and ratios, audience
 * multipliers, bucket highlights, chart scaling. No React, unit-tested.
 */

import { reportKey } from "@/lib/client/storage";
import { formatCompact, formatCount, formatDuration } from "@/lib/client/format";
import {
  audienceMultiplier,
  median,
  rankingMedian as statsRankingMedian,
  rankingValue,
} from "@/lib/creators/stats";
import type {
  CompetitorInsights,
  CompetitorReport,
  CreatorPlatform,
  CreatorPlatformStatus,
  CreatorPost,
  CreatorStats,
  ScriptPlatform,
  StatBucket,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

/** Order of the platform picker. */
export const CREATOR_PLATFORM_ORDER: CreatorPlatform[] = ["instagram", "tiktok", "youtube", "linkedin"];

/** Example handle / URL per platform, for placeholders. */
export const HANDLE_PLACEHOLDERS: Record<CreatorPlatform, string> = {
  instagram: "@pseudo ou instagram.com/pseudo",
  tiktok: "@pseudo ou tiktok.com/@pseudo",
  youtube: "@chaine ou youtube.com/@chaine",
  linkedin: "linkedin.com/in/prenom-nom",
};

/** Script target matching a competitor's platform (TikTok creator → TikTok script). */
export function scriptPlatformFor(platform: CreatorPlatform): ScriptPlatform {
  if (platform === "instagram") return "instagram_reels";
  if (platform === "youtube") return "youtube_shorts";
  if (platform === "linkedin") return "linkedin";
  return "tiktok";
}

/** Competitor platform behind a script target. */
export function creatorPlatformFor(platform: ScriptPlatform): CreatorPlatform {
  if (platform === "instagram_reels") return "instagram";
  if (platform === "youtube_shorts") return "youtube";
  if (platform === "linkedin") return "linkedin";
  return "tiktok";
}

const HOSTS: { pattern: RegExp; platform: CreatorPlatform }[] = [
  { pattern: /(^|\.)instagram\.com$/i, platform: "instagram" },
  { pattern: /(^|\.)tiktok\.com$/i, platform: "tiktok" },
  { pattern: /(^|\.)(youtube\.com|youtu\.be)$/i, platform: "youtube" },
  { pattern: /(^|\.)linkedin\.com$/i, platform: "linkedin" },
];

/**
 * Platform of a pasted profile URL ("https://www.tiktok.com/@x" → "tiktok"),
 * null for a bare handle or an unknown site. The server does the real
 * normalisation; this only lets the form follow what the user pasted.
 */
export function detectPlatformFromInput(input: string): CreatorPlatform | null {
  const value = input.trim();
  if (!/[./]/.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return HOSTS.find((host) => host.pattern.test(url.hostname))?.platform ?? null;
  } catch {
    return null;
  }
}

/**
 * Platform the form uses: the explicit choice, else the first available one
 * (Instagram → TikTok → YouTube → LinkedIn), else Instagram while
 * capabilities are unknown.
 */
export function effectivePlatform(
  chosen: CreatorPlatform | null,
  capabilities: CreatorPlatformStatus[] | null,
): CreatorPlatform {
  if (chosen) return chosen;
  const available = CREATOR_PLATFORM_ORDER.find((platform) =>
    capabilities?.some((status) => status.platform === platform && status.available),
  );
  return available ?? "instagram";
}

/**
 * Default "Se différencier de" selection for a script platform: the saved
 * competitors of the same platform (newest first, max 3), else none.
 */
export function defaultCompetitorKeys(reports: CompetitorReport[], platform: ScriptPlatform, max = 3): string[] {
  const target = creatorPlatformFor(platform);
  return reports
    .filter((report) => report.data.account.platform === target)
    .slice(0, max)
    .map(reportKey);
}

/** Selected reports, in the saved order, ignoring keys that are no longer saved. */
export function selectReports(reports: CompetitorReport[], keys: string[], max = 3): CompetitorReport[] {
  const wanted = new Set(keys);
  return reports.filter((report) => wanted.has(reportKey(report))).slice(0, max);
}

/** URL of the report page of an account. */
export function reportHref(key: string): string {
  return `/concurrents?rapport=${encodeURIComponent(key)}`;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

// Same definitions as the statistics module (ranking value, medians, views ÷ followers).
export { audienceMultiplier, median, rankingValue };

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 3.42 → "×3,4", 12.6 → "×13", 0.42 → "×0,4". */
export function formatRatio(ratio: number): string {
  if (!isNumber(ratio)) return "—";
  return `×${ratio >= 10 ? integer.format(Math.round(ratio)) : decimal.format(Math.round(ratio * 10) / 10)}`;
}

/** Views ÷ followers: 4.23 → "×4,2", 0.042 → "×0,04" (2 decimals below 1). */
export function formatMultiplier(multiplier: number): string {
  if (!isNumber(multiplier)) return "—";
  if (multiplier >= 1) return formatRatio(multiplier);
  const precise = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return `×${precise.format(Math.round(multiplier * 100) / 100)}`;
}

/** Percentage already in % units: 4.236 → "4,2 %", 37.4 → "37 %". */
export function formatPct(value: number | undefined): string {
  if (!isNumber(value)) return "—";
  return `${value >= 10 ? integer.format(Math.round(value)) : decimal.format(Math.round(value * 10) / 10)} %`;
}

/** 2.333 → "2,3". */
export function formatDecimal(value: number | undefined): string {
  return isNumber(value) ? decimal.format(Math.round(value * 10) / 10) : "—";
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type RankingMetric = CreatorStats["rankingMetric"];

/** Unit of the ranking metric ("vues" / "pts d'engagement"). */
export function metricUnit(metric: RankingMetric, value = 2): string {
  if (metric === "views") return value < 2 ? "vue" : "vues";
  return value < 2 ? "pt d'engagement" : "pts d'engagement";
}

/** Median of the ranking metric over the analysed posts (views: the stats value when present). */
export function rankingMedian(report: Pick<CompetitorReport, "data" | "stats">): number | undefined {
  const { stats } = report;
  if (stats.rankingMetric === "views" && isNumber(stats.medianViews)) return stats.medianViews;
  return statsRankingMedian(report.data.posts, stats.rankingMetric);
}

/**
 * False when the source's terms forbid derived metrics (YouTube Data API):
 * the UI then shows raw counts only and never computes a ratio itself.
 */
export function ratiosAllowed(report: Pick<CompetitorReport, "data">): boolean {
  return report.data.ratiosAllowed !== false;
}

/** Post value ÷ creator's median on the ranking metric (undefined when unknown or median 0). */
export function postRatio(post: CreatorPost, metric: RankingMetric, medianValue: number | undefined): number | undefined {
  const value = rankingValue(post, metric);
  if (!isNumber(value) || !isNumber(medianValue) || medianValue <= 0) return undefined;
  return value / medianValue;
}

/** Posts by id. */
export function postIndex(posts: CreatorPost[]): Map<string, CreatorPost> {
  return new Map(posts.map((post) => [post.id, post]));
}

/** Posts referenced by ids, in order, unknown ids and duplicates skipped. */
export function resolvePosts<P extends CreatorPost>(ids: readonly string[] | undefined, index: Map<string, P>): P[] {
  const seen = new Set<string>();
  const posts: P[] = [];
  for (const id of ids ?? []) {
    const post = index.get(id);
    if (post && !seen.has(id)) {
      seen.add(id);
      posts.push(post);
    }
  }
  return posts;
}

/** "12,3 k vues · 1,2 k j'aime · 340 comm. · 56 partages · 120 enreg." parts. */
export function postMetricLabels(post: CreatorPost): string[] {
  const { views, likes, comments, shares, saves } = post.metrics;
  const parts: string[] = [];
  if (isNumber(views)) parts.push(formatCount(views, "vue", "vues"));
  if (isNumber(likes) && likes >= 0) parts.push(`${formatCompact(likes)} j'aime`);
  if (isNumber(comments)) parts.push(`${formatCompact(comments)} comm.`);
  if (isNumber(shares)) parts.push(formatCount(shares, "partage", "partages"));
  if (isNumber(saves)) parts.push(`${formatCompact(saves)} enreg.`);
  return parts;
}

/** "Vidéo courte · 42 s" */
export function postKindLabel(post: CreatorPost): string {
  const kind = post.kind === "short_video" ? "Vidéo courte" : post.kind === "video" ? "Vidéo" : "Publication";
  return isNumber(post.durationSec) && post.durationSec > 0 ? `${kind} · ${formatDuration(post.durationSec)}` : kind;
}

/** Posts sorted by date (newest first; undated last) or by ranking value (best first). */
export function sortPosts(
  posts: CreatorPost[],
  by: "recent" | "performance",
  metric: RankingMetric,
): CreatorPost[] {
  const time = (post: CreatorPost) => (post.publishedAt ? Date.parse(post.publishedAt) : Number.NaN);
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      if (by === "performance") {
        const diff = (rankingValue(b.post, metric) ?? -1) - (rankingValue(a.post, metric) ?? -1);
        if (diff !== 0) return diff;
      } else {
        const ta = time(a.post);
        const tb = time(b.post);
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
        if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.post);
}

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------

export interface RankedPost {
  post: CreatorPost;
  /** × the creator's median on the ranking metric. */
  ratio?: number;
  /** Views ÷ followers. */
  multiplier?: number;
}

/** A post with its ratios — none when the source forbids derived metrics. */
export function rankPost(post: CreatorPost, report: CompetitorReport, medianValue: number | undefined): RankedPost {
  if (!ratiosAllowed(report)) return { post };
  return {
    post,
    ratio: postRatio(post, report.stats.rankingMetric, medianValue),
    multiplier: audienceMultiplier(post, report.data.account.followers),
  };
}

/**
 * "Ce qui surperforme": the outliers (≥ 2× the median, best first) with their
 * ratio as computed by the stats; falls back to the top posts when nothing
 * stands out (`fallback: true`).
 */
export function overperformers(report: CompetitorReport, max = 6): { items: RankedPost[]; fallback: boolean } {
  const index = postIndex(report.data.posts);
  const medianValue = rankingMedian(report);
  const outliers = report.stats.outliers
    .map(({ postId, ratio }): RankedPost | null => {
      const post = index.get(postId);
      if (!post) return null;
      const item = rankPost(post, report, medianValue);
      return ratiosAllowed(report) ? { ...item, ratio } : item;
    })
    .filter((item): item is RankedPost => item !== null)
    .slice(0, max);
  if (outliers.length > 0) return { items: outliers, fallback: false };
  const top = resolvePosts(report.stats.topPostIds, index).slice(0, Math.min(max, 3));
  return { items: top.map((post) => rankPost(post, report, medianValue)), fallback: true };
}

/** The 3 weakest posts of the stats (bottomPostIds). */
export function underperformers(report: CompetitorReport, max = 3): RankedPost[] {
  const index = postIndex(report.data.posts);
  const medianValue = rankingMedian(report);
  return resolvePosts(report.stats.bottomPostIds, index)
    .slice(0, max)
    .map((post) => rankPost(post, report, medianValue));
}

/**
 * Posts watched beyond the account's audience (views ÷ followers ≥ `min`,
 * default 1), best first: the stats' `audienceMultipliers` when present,
 * else computed from the posts (older reports). Empty when followers or
 * views are unknown, or when the source forbids derived metrics.
 */
export function audienceLeaders(report: CompetitorReport, max = 5, min = 1): RankedPost[] {
  if (!ratiosAllowed(report)) return [];
  const index = postIndex(report.data.posts);
  const medianValue = rankingMedian(report);
  const fromStats = report.stats.audienceMultipliers;
  if (fromStats && fromStats.length > 0) {
    return fromStats
      .map(({ postId, multiplier }): RankedPost | null => {
        const post = index.get(postId);
        return post && multiplier >= min ? { ...rankPost(post, report, medianValue), multiplier } : null;
      })
      .filter((item): item is RankedPost => item !== null)
      .slice(0, max);
  }
  return report.data.posts
    .map((post) => rankPost(post, report, medianValue))
    .filter((item) => isNumber(item.multiplier) && item.multiplier >= min)
    .sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))
    .slice(0, max);
}

/** Bucket with the best median among those with at least `minPosts` posts (only when there is a real choice). */
export function bestBucket(buckets: StatBucket[], minPosts = 2): StatBucket | undefined {
  const candidates = buckets.filter((bucket) => bucket.posts >= minPosts && isNumber(bucket.median));
  if (candidates.length < 2) return undefined;
  return candidates.reduce((best, bucket) => ((bucket.median ?? 0) > (best.median ?? 0) ? bucket : best));
}

/** True when the report is older than `days` (YouTube's 30-day rule, stale data). */
export function isStale(report: Pick<CompetitorReport, "createdAt">, now: number, days = 30): boolean {
  const created = Date.parse(report.createdAt);
  return Number.isFinite(created) && now - created > days * 24 * 60 * 60_000;
}

type FollowDriver = NonNullable<CompetitorInsights["followDrivers"]>[number];

/** Follow driver sharing the most evidence posts with an idea's `inspiredBy` (none when nothing overlaps). */
export function ideaFollowDriver(
  idea: CompetitorInsights["ideas"][number],
  drivers: FollowDriver[] | undefined,
): FollowDriver | undefined {
  if (!drivers?.length || !idea.inspiredBy.length) return undefined;
  const inspired = new Set(idea.inspiredBy);
  let best: FollowDriver | undefined;
  let bestOverlap = 0;
  for (const driver of drivers) {
    const overlap = driver.postIds.filter((id) => inspired.has(id)).length;
    if (overlap > bestOverlap) {
      best = driver;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * Splits a "why for you" text into sentences, flagging the ones about
 * subscribers (abonnés, s'abonner, follow…) so the UI can surface them.
 */
export function splitFollowSentences(text: string): { text: string; follow: boolean }[] {
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [text];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => ({ text: sentence, follow: /abonn|follow/i.test(sentence) }));
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

export interface ChartBar {
  postId: string;
  title: string;
  url: string;
  publishedAt?: string;
  value: number;
  ratio?: number;
  outlier: boolean;
}

export interface ChartSeries {
  /** Oldest → newest. */
  bars: ChartBar[];
  /** Posts left out because the source hides the metric. */
  excluded: number;
  median?: number;
  metric: RankingMetric;
}

/** Bars of the performance chart: chronological, outliers flagged by the stats. */
export function chartSeries(report: CompetitorReport): ChartSeries {
  const { stats } = report;
  const metric = stats.rankingMetric;
  const medianValue = rankingMedian(report);
  const allowed = ratiosAllowed(report);
  const outliers = new Map(stats.outliers.map((item) => [item.postId, item.ratio]));
  const chronological = sortPosts(report.data.posts, "recent", metric).reverse();
  const bars: ChartBar[] = [];
  let excluded = 0;
  for (const post of chronological) {
    const value = rankingValue(post, metric);
    if (!isNumber(value)) {
      excluded++;
      continue;
    }
    bars.push({
      postId: post.id,
      title: post.title,
      url: post.url,
      publishedAt: post.publishedAt,
      value,
      ratio: allowed ? (outliers.get(post.id) ?? postRatio(post, metric, medianValue)) : undefined,
      outlier: outliers.has(post.id),
    });
  }
  return { bars, excluded, median: medianValue, metric };
}

/**
 * Round axis maximum and ticks for a value maximum: steps of 1, 2, 2.5 or 5
 * × 10^n so that labels read "0 · 10 k · 20 k · 30 k".
 */
export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  if (!isNumber(max) || max <= 0) return { max: 1, ticks: [0, 1] };
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return { max: top, ticks };
}

export interface BarGeometry {
  x: number;
  width: number;
  /** Top of the bar (SVG y). */
  y: number;
  height: number;
}

/**
 * Pixel layout of `count` bars in a plot of `width` × `height`: equal slots,
 * bars ≤ 24 px with a 2 px gap, heights proportional to value / scaleMax.
 */
export function barLayout(
  values: number[],
  { width, height, scaleMax, maxBar = 24, gap = 2 }: { width: number; height: number; scaleMax: number; maxBar?: number; gap?: number },
): { slot: number; bars: BarGeometry[] } {
  const count = values.length;
  if (count === 0 || width <= 0) return { slot: 0, bars: [] };
  const slot = width / count;
  const barWidth = Math.max(1, Math.min(maxBar, slot - gap));
  const bars = values.map((value, index) => {
    const barHeight = scaleMax > 0 ? Math.max(0, Math.min(1, value / scaleMax)) * height : 0;
    return {
      x: index * slot + (slot - barWidth) / 2,
      width: barWidth,
      y: height - barHeight,
      height: barHeight,
    };
  });
  return { slot, bars };
}

/** SVG path of a bar with 4 px rounded data-end (top) and a square baseline. */
export function barPath({ x, y, width, height }: BarGeometry, radius = 4): string {
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  const bottom = y + height;
  const right = x + width;
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${right - r}Q${right},${y} ${right},${y + r}V${bottom}Z`;
}
