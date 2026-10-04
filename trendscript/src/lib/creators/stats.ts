/**
 * Deterministic statistics on a creator's recent posts (no AI). These are the
 * only aggregate numbers the competitor report shows and the only ones Claude
 * may cite: Claude interprets them, code computes them. Pure and client-safe.
 *
 * Conventions:
 * - Ranking metric: views when ≥ 60 % of the posts expose them, otherwise an
 *   engagement score (likes + 3 × comments + 5 × shares), the same proxy as
 *   the trend scoring of LinkedIn posts.
 * - Medians ignore missing values (hidden likes, no views on LinkedIn…).
 * - A post's "ratio" is its ranking value ÷ the creator's own median, rounded
 *   to 0.1 — "×3,4" means 3.4 times what this creator usually gets.
 * - Calendar buckets use the market's time zone (`timeZoneForGeo`).
 * - Posts published less than 48 h before the analysis are still
 *   accumulating views: they are never listed among the weakest posts.
 * - `data.ratiosAllowed === false` (YouTube API terms): no derived rates or
 *   views ÷ subscribers multipliers; rankings on raw counts remain.
 */

import type { CreatorData, CreatorPost, CreatorPostMetrics, CreatorStats, StatBucket } from "../types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A post younger than this has not finished accumulating views. */
export const FRESH_POST_MS = 48 * HOUR_MS;
/** "Outlier" = at least this many times the creator's own median. */
export const OUTLIER_RATIO = 2;
/** Below this many measured posts, a median is too fragile to call outliers. */
export const MIN_POSTS_FOR_OUTLIERS = 5;
/** Share of posts that must expose views for views to be the ranking metric. */
const VIEWS_COVERAGE = 0.6;
const TOP_POSTS = 5;
const BOTTOM_POSTS = 3;
const TOP_HASHTAGS = 10;
const TOP_MULTIPLIERS = 10;

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

const TIME_ZONES: Record<string, string> = {
  FR: "Europe/Paris",
  MC: "Europe/Monaco",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  LU: "Europe/Luxembourg",
  CA: "America/Toronto",
  US: "America/New_York",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  DE: "Europe/Berlin",
  AT: "Europe/Vienna",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  PT: "Europe/Lisbon",
  NL: "Europe/Amsterdam",
  MA: "Africa/Casablanca",
  DZ: "Africa/Algiers",
  TN: "Africa/Tunis",
  SN: "Africa/Dakar",
  CI: "Africa/Abidjan",
  CM: "Africa/Douala",
  RE: "Indian/Reunion",
  GP: "America/Guadeloupe",
  MQ: "America/Martinique",
  GF: "America/Cayenne",
  NC: "Pacific/Noumea",
  PF: "Pacific/Tahiti",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  IN: "Asia/Kolkata",
  JP: "Asia/Tokyo",
  AU: "Australia/Sydney",
};

/** IANA time zone of a market (ISO 3166-1 alpha-2). Unknown or missing → Europe/Paris. */
export function timeZoneForGeo(geo: string | undefined): string {
  return (geo && TIME_ZONES[geo.trim().toUpperCase()]) || "Europe/Paris";
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * numerator ÷ denominator rounded to `decimals`, scaling the numerator first:
 * with integer counts this avoids binary artefacts (15 000 ÷ 200 000 = 0.075
 * rounds to 0.08, not 0.07).
 */
export function roundRatio(numerator: number, denominator: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((numerator * factor) / denominator) / factor;
}

/** Median of the finite values (missing ones ignored); undefined when there are none. */
export function median(values: readonly (number | undefined)[]): number | undefined {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const percent = (count: number, total: number) => (total > 0 ? Math.round((100 * count) / total) : 0);

// ---------------------------------------------------------------------------
// Ranking metric
// ---------------------------------------------------------------------------

/** likes + 3 × comments + 5 × shares; undefined when the platform exposes none of them. */
export function engagementScore(metrics: CreatorPostMetrics): number | undefined {
  const { likes, comments, shares } = metrics;
  if (likes === undefined && comments === undefined && shares === undefined) return undefined;
  return (likes ?? 0) + 3 * (comments ?? 0) + 5 * (shares ?? 0);
}

export function chooseRankingMetric(posts: readonly CreatorPost[]): CreatorStats["rankingMetric"] {
  if (posts.length === 0) return "engagement";
  const withViews = posts.filter((post) => isNumber(post.metrics.views)).length;
  return withViews / posts.length >= VIEWS_COVERAGE ? "views" : "engagement";
}

/** The post's value on the ranking metric (undefined when the source hides it). */
export function rankingValue(post: CreatorPost, metric: CreatorStats["rankingMetric"]): number | undefined {
  const value = metric === "views" ? post.metrics.views : engagementScore(post.metrics);
  return isNumber(value) ? value : undefined;
}

/** Median of the ranking metric over the posts that expose it. */
export function rankingMedian(posts: readonly CreatorPost[], metric: CreatorStats["rankingMetric"]): number | undefined {
  return median(posts.map((post) => rankingValue(post, metric)));
}

/**
 * Ratio of each post to the creator's own median on the ranking metric,
 * rounded to 0.1 (posts without a value, or a zero median, are absent).
 */
export function performanceRatios(
  posts: readonly CreatorPost[],
  metric: CreatorStats["rankingMetric"] = chooseRankingMetric(posts),
): Map<string, number> {
  const ratios = new Map<string, number>();
  const med = rankingMedian(posts, metric);
  if (!med || med <= 0) return ratios;
  for (const post of posts) {
    const value = rankingValue(post, metric);
    if (value !== undefined) ratios.set(post.id, roundRatio(value, med, 1));
  }
  return ratios;
}

/** Views ÷ followers (2 decimals), when both are known. */
export function audienceMultiplier(post: CreatorPost, followers: number | undefined): number | undefined {
  const views = post.metrics.views;
  if (!isNumber(views) || !isNumber(followers) || followers <= 0) return undefined;
  return roundRatio(views, followers, 2);
}

/** (shares + saves) ÷ views in %, when views and at least one of them are known. */
export function shareSaveRate(metrics: CreatorPostMetrics): number | undefined {
  const { views, shares, saves } = metrics;
  if (!isNumber(views) || views <= 0 || (shares === undefined && saves === undefined)) return undefined;
  return (100 * ((shares ?? 0) + (saves ?? 0))) / views;
}

/** (likes + comments + shares) ÷ views in %, when views and likes are known. */
export function engagementRate(metrics: CreatorPostMetrics): number | undefined {
  const { views, likes, comments, shares } = metrics;
  if (!isNumber(views) || views <= 0 || !isNumber(likes)) return undefined;
  return (100 * (likes + (comments ?? 0) + (shares ?? 0))) / views;
}

// ---------------------------------------------------------------------------
// Text heuristics (French + English)
// ---------------------------------------------------------------------------

/** Unicode-aware word boundaries: JS `\b` treats "é" as a non-word character. */
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const IT = "(?:-la|-le|-les|-moi)?"; // imperative + pronoun ("partage-la")

const CTA_PATTERNS = [
  // Comments
  `commente(?:z)?${E}`,
  `en commentaires?${E}`,
  `(?:dis|dites|réponds|répondez|reponds|repondez)[- ](?:moi|nous)${E}`,
  `(?:lâche|lache|laisse|laissez|mets|met|mettez)\\s+(?:un|une|ton|ta|vos|un petit)\\s+(?:like|com|comm|commentaire|cœur|coeur|avis)`,
  // Follow
  `abonnes?[- ]toi${E}`,
  `abonnez[- ]vous${E}`,
  `(?:suis|suivez|follow)[- ]?(?:moi|nous|me|us)${E}`,
  `(?:rejoins|rejoignez)[- ](?:moi|nous|la|le|ma|mon|notre)${E}`,
  `active(?:z)? (?:la|les) (?:cloche|notifs?|notifications)`,
  // Share / send / save
  `partage(?:z)?${IT}\\s+(?:ça|ca|cette|ce|à|a|avec\\s+(?:ton|ta|tes|un|une|celui|celle|quelqu))`,
  `partage(?:z)?(?:-la|-le|-les)${E}`,
  `envoie(?:z)?${IT}\\s+(?:ça|ca|cette|ce|à|a)${E}`,
  `envoie(?:z)?(?:-la|-le|-les)${E}`,
  `enregistre(?:z)?(?:-la|-le|-les)${E}`,
  `enregistre(?:z)?\\s+(?:ce|cette|ça|ca|pour)${E}`,
  `sauvegarde(?:z)?(?:-la|-le|-les)${E}`,
  `sauvegarde(?:z)?\\s+(?:ce|cette|ça|ca|pour)${E}`,
  `tague(?:z)?${E}`,
  `(?:identifie|identifiez|mentionne|mentionnez)\\s+(?:un|une|ton|ta|tes|quelqu|\\d)`,
  // Links, DMs, offers
  `(?:lien|liens|infos?|code|guide|formation|programme|ebook|offre)\\s+(?:en|dans (?:ma|la))\\s+bio${E}`,
  `dans (?:ma|la) bio${E}`,
  `clique(?:z)?${E}`,
  `(?:en|par)\\s+(?:dm|mp|message privé|message prive)${E}`,
  `(?:dm|mp|écris|ecris|écrivez|ecrivez)[- ]moi${E}`,
  `(?:inscris[- ]toi|inscrivez[- ]vous|télécharge(?:z)?|telecharge(?:z)?)${E}`,
  `code promo${E}`,
  `like(?:z)?\\s+(?:si|la|le|cette|ce)${E}`,
  // English
  `comment\\s+(?:below|down|if|your|with|for)${E}`,
  `(?:follow|subscribe|sub)\\s+(?:me|us|for|along|now)${E}`,
  `subscribe${E}`,
  `link\\s+in\\s+(?:my\\s+)?bio${E}`,
  `(?:share|send)\\s+(?:this|it|with)${E}`,
  `save\\s+(?:this|it|for)${E}`,
  `tag\\s+(?:a|your|someone|a friend)${E}`,
  `click\\s+(?:the|on|here)${E}`,
  `dm\\s+me${E}`,
  `sign\\s+up${E}`,
  `turn on (?:post )?notifications`,
];
const CTA_REGEX = new RegExp(`${B}(?:${CTA_PATTERNS.join("|")})`, "iu");

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/[’‘ʼ]/g, "'").replace(/\s+/g, " ").toLowerCase();
}

/** True when the text contains an explicit call to action (comment, follow, share, save, link in bio…). */
export function hasCallToAction(text: string | undefined): boolean {
  return Boolean(text) && CTA_REGEX.test(normalizeText(text ?? ""));
}

/** True when the title's first line asks a question. */
export function isQuestionTitle(title: string | undefined): boolean {
  const firstLine = (title ?? "").trim().split("\n")[0] ?? "";
  return /[?？]/.test(firstLine);
}

const stripAccentsLower = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SERIES_ANYWHERE =
  /(?:^|[^a-z0-9])(?:partie|part|pt|episode|ep|chapitre|saison|season|tome)\.?\s*(?:n°|no\.?|#)?\s*\d+|(?:^|[^a-z0-9])episode(?![a-z])|\(\s*\d+\s*\/\s*\d+\s*\)|(?:^|\s)#\d+(?![\w])/;
const SERIES_DAY = /^\s*(?:jour|day|j)\s*\d+|(?:jour|day)\s*\d+\s*(?:\/|sur|of)\s*\d+/;

/** True when the post belongs to a series ("partie 2", "épisode", "ep. 3", "#4", "(1/3)", "Jour 12"). */
export function isSeriesPost(post: Pick<CreatorPost, "title" | "text">): boolean {
  const title = stripAccentsLower(post.title ?? "");
  const text = stripAccentsLower(post.text ?? "");
  return SERIES_ANYWHERE.test(title) || SERIES_ANYWHERE.test(text) || SERIES_DAY.test(title);
}

/** Caption as the creator wrote it: the text when there is one, else the title. */
export function captionOf(post: CreatorPost): string {
  return post.text?.trim() ? post.text : post.title;
}

// ---------------------------------------------------------------------------
// Calendar buckets
// ---------------------------------------------------------------------------

export const WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();

function calendarFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = { weekday: "short", hour: "numeric", hourCycle: "h23" };
    try {
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    } catch {
      // Unknown IANA name: fall back to the default market.
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "Europe/Paris" });
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Weekday (0 = lundi) and hour (0–23) of an ISO date in a time zone. */
export function localSlot(iso: string | undefined, timeZone: string): { weekday: number; hour: number } | undefined {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return undefined;
  const parts = calendarFormatter(timeZone).formatToParts(time);
  const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? ""];
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (weekday === undefined || !Number.isFinite(hour)) return undefined;
  return { weekday, hour: hour % 24 };
}

export const DURATION_BUCKETS = ["< 30 s", "30–60 s", "1–3 min", "> 3 min"] as const;

export function durationBucket(seconds: number): (typeof DURATION_BUCKETS)[number] {
  if (seconds < 30) return "< 30 s";
  if (seconds <= 60) return "30–60 s";
  if (seconds <= 180) return "1–3 min";
  return "> 3 min";
}

function bucket(label: string, posts: CreatorPost[], metric: CreatorStats["rankingMetric"]): StatBucket {
  const med = rankingMedian(posts, metric);
  return { label, posts: posts.length, ...(med !== undefined ? { median: Math.round(med) } : {}) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Ranked {
  post: CreatorPost;
  value: number;
  /** Position in `data.posts` (newest first): breaks ties deterministically. */
  index: number;
}

function ranked(posts: readonly CreatorPost[], valueOf: (post: CreatorPost) => number | undefined): Ranked[] {
  const list: Ranked[] = [];
  posts.forEach((post, index) => {
    const value = valueOf(post);
    if (value !== undefined) list.push({ post, value, index });
  });
  return list;
}

/** Sorted by value (best first by default); ties keep the newest first. */
function sortRanked(list: readonly Ranked[], direction: 1 | -1 = -1): Ranked[] {
  return [...list].sort((a, b) => (a.value === b.value ? a.index - b.index : direction * (a.value - b.value)));
}

function publicationWindow(posts: CreatorPost[]): { windowDays: number; postsPerWeek: number } {
  const timesOf = (list: CreatorPost[]) =>
    list.map((post) => (post.publishedAt ? Date.parse(post.publishedAt) : NaN)).filter((t) => !Number.isNaN(t));
  // A pinned post can be months old: it says nothing about the current rhythm.
  let times = timesOf(posts.filter((post) => !post.pinned));
  if (times.length < 2) times = timesOf(posts);
  if (times.length < 2) return { windowDays: 0, postsPerWeek: 0 };
  const span = Math.max(...times) - Math.min(...times);
  // n posts spread over the span = n − 1 intervals.
  const postsPerWeek = round(((times.length - 1) * 7) / Math.max(span / DAY_MS, 1), 1);
  return { windowDays: Math.round(span / DAY_MS), postsPerWeek };
}

export interface CreatorStatsOptions {
  /** Epoch ms of the analysis (posts younger than 48 h are not called weak). */
  now: number;
  /** IANA time zone of the market (`timeZoneForGeo(geo)`). */
  timeZone: string;
}

export function computeCreatorStats(data: CreatorData, { now, timeZone }: CreatorStatsOptions): CreatorStats {
  const posts = data.posts;
  const metric = chooseRankingMetric(posts);
  const followers = data.account.followers;
  // YouTube API terms: no derived metrics (rates, views ÷ subscribers) on
  // other channels' data unless the amendment was accepted. Rankings on raw
  // counts (top, outliers vs the creator's own median) remain.
  const ratiosAllowed = data.ratiosAllowed !== false;

  const valued = ranked(posts, (post) => rankingValue(post, metric));
  const med = median(valued.map((entry) => entry.value));

  // Outliers: at least 2× the creator's own median, with enough posts to trust it.
  const outliers: CreatorStats["outliers"] = [];
  if (valued.length >= MIN_POSTS_FOR_OUTLIERS && med !== undefined && med > 0) {
    for (const entry of sortRanked(valued)) {
      const ratio = roundRatio(entry.value, med, 1);
      if (ratio >= OUTLIER_RATIO) outliers.push({ postId: entry.post.id, ratio });
    }
  }

  const topPostIds = sortRanked(valued)
    .slice(0, TOP_POSTS)
    .map((entry) => entry.post.id);
  const top = new Set(topPostIds);
  const isMature = (post: CreatorPost) => {
    const time = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
    return Number.isNaN(time) || now - time >= FRESH_POST_MS;
  };
  const bottomPostIds = sortRanked(
    valued.filter((entry) => !top.has(entry.post.id) && isMature(entry.post)),
    1,
  )
    .slice(0, BOTTOM_POSTS)
    .map((entry) => entry.post.id);

  const medianViews = median(posts.map((post) => post.metrics.views));
  const medianLikes = median(posts.map((post) => post.metrics.likes));
  const medianComments = median(posts.map((post) => post.metrics.comments));
  const engagement = ratiosAllowed ? median(posts.map((post) => engagementRate(post.metrics))) : undefined;
  const shareSave = ratiosAllowed ? median(posts.map((post) => shareSaveRate(post.metrics))) : undefined;

  const audienceMultipliers = ratiosAllowed
    ? sortRanked(ranked(posts, (post) => audienceMultiplier(post, followers)))
        .slice(0, TOP_MULTIPLIERS)
        .map((entry) => ({ postId: entry.post.id, multiplier: entry.value }))
    : [];

  // Calendar (market time zone).
  const byWeekday: CreatorPost[][] = WEEKDAYS_FR.map(() => []);
  const byHour = new Map<number, CreatorPost[]>();
  let dated = 0;
  for (const post of posts) {
    const slot = localSlot(post.publishedAt, timeZone);
    if (!slot) continue;
    dated++;
    byWeekday[slot.weekday].push(post);
    byHour.set(slot.hour, [...(byHour.get(slot.hour) ?? []), post]);
  }
  const weekdays = dated ? WEEKDAYS_FR.map((label, index) => bucket(label, byWeekday[index], metric)) : [];
  const hours = [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, list]) => bucket(`${hour} h`, list, metric));

  // Durations (videos only).
  const videos = posts.filter((post) => post.kind !== "social_post" && isNumber(post.durationSec) && post.durationSec > 0);
  const durations = videos.length
    ? DURATION_BUCKETS.map((label) =>
        bucket(
          label,
          videos.filter((post) => durationBucket(post.durationSec as number) === label),
          metric,
        ),
      )
    : [];

  // Hashtags: frequency first, then median performance.
  const byTag = new Map<string, CreatorPost[]>();
  for (const post of posts) {
    for (const tag of new Set(post.hashtags.map((t) => t.replace(/^#+/, "").toLowerCase()).filter(Boolean))) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), post]);
    }
  }
  const hashtags = [...byTag.entries()]
    .map(([tag, list]) => bucket(`#${tag}`, list, metric))
    .sort((a, b) => b.posts - a.posts || (b.median ?? -1) - (a.median ?? -1) || a.label.localeCompare(b.label, "fr"))
    .slice(0, TOP_HASHTAGS);

  const captionLengths = posts.map((post) => Array.from(captionOf(post).trim()).length);

  return {
    postCount: posts.length,
    ...publicationWindow(posts),
    rankingMetric: metric,
    ...(medianViews !== undefined ? { medianViews: Math.round(medianViews) } : {}),
    ...(medianLikes !== undefined ? { medianLikes: Math.round(medianLikes) } : {}),
    ...(medianComments !== undefined ? { medianComments: Math.round(medianComments) } : {}),
    ...(engagement !== undefined ? { engagementRate: round(engagement, 2) } : {}),
    ...(ratiosAllowed && medianViews !== undefined && isNumber(followers) && followers > 0
      ? { reachRate: roundRatio(100 * medianViews, followers, 1) }
      : {}),
    outliers,
    ...(audienceMultipliers.length ? { audienceMultipliers } : {}),
    ...(shareSave !== undefined ? { shareSaveRate: round(shareSave, 2) } : {}),
    topPostIds,
    bottomPostIds,
    weekdays,
    hours,
    durations,
    hashtags,
    medianCaptionLength: Math.round(median(captionLengths) ?? 0),
    ctaShare: percent(posts.filter((post) => hasCallToAction(`${post.title}\n${post.text ?? ""}`)).length, posts.length),
    questionShare: percent(posts.filter((post) => isQuestionTitle(post.title)).length, posts.length),
    seriesShare: percent(posts.filter(isSeriesPost).length, posts.length),
  };
}
