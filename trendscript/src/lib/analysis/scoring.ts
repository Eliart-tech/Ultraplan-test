/**
 * Transparent, deterministic scoring. Claude clusters signals into topics
 * and judges niche fit; every other number shown to the user is computed
 * here from real metrics so it can be explained and audited.
 */

import type { Platform, Signal, TopicScores } from "../types";

const HOUR = 3_600_000;
/** Freshness halves every 24 h. */
const FRESHNESS_HALF_LIFE_H = 24;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function freshness(publishedAt: string | undefined, now: number): number {
  if (!publishedAt) return 50;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return 50;
  const ageHours = Math.max(0, (now - time) / HOUR);
  return Math.round(100 * Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_H));
}

/**
 * The single metric that best measures audience for a signal, or undefined
 * when the source gives none (news articles).
 */
export function primaryMetric(signal: Signal): number | undefined {
  const m = signal.metrics;
  if (m.searchVolume !== undefined) return m.searchVolume;
  if (m.views !== undefined) return m.views;
  if (m.likes !== undefined || m.comments !== undefined) {
    // Engagement proxy when views are hidden (Instagram hashtag media).
    return (m.likes ?? 0) * 20 + (m.comments ?? 0) * 60;
  }
  return undefined;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Percentile rank (0–100) of each value inside its own list. */
function percentileRanks(values: number[]): number[] {
  if (values.length === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => {
    let below = 0;
    let equal = 0;
    for (const v of sorted) {
      if (v < value) below++;
      else if (v === value) equal++;
    }
    return Math.round((100 * (below + (equal - 1) / 2)) / (values.length - 1));
  });
}

/**
 * Fills `strength` (0–100, relative to the same source in this run) and
 * `outlier` on every signal. Mutates and returns the array.
 */
export function scoreSignals(signals: Signal[], now = Date.now()): Signal[] {
  const bySource = new Map<string, Signal[]>();
  for (const signal of signals) {
    const list = bySource.get(signal.source) ?? [];
    list.push(signal);
    bySource.set(signal.source, list);
  }

  for (const group of bySource.values()) {
    const measured = group.filter((s) => primaryMetric(s) !== undefined);
    const ranks = percentileRanks(measured.map((s) => Math.log10(1 + (primaryMetric(s) ?? 0))));
    measured.forEach((signal, i) => {
      signal.strength = Math.round(0.75 * ranks[i] + 0.25 * freshness(signal.publishedAt, now));
    });

    for (const signal of group) {
      if (primaryMetric(signal) !== undefined) continue;
      // No audience metric (news): rely on recency and on the source's own rank.
      const rankScore = signal.metrics.rank ? clamp(100 - (signal.metrics.rank - 1) * 4) : 50;
      signal.strength = Math.round(0.6 * freshness(signal.publishedAt, now) + 0.4 * rankScore);
    }

    // Outliers: videos that clearly beat their peers or their own audience.
    const videos = group.filter((s) => s.kind === "short_video" || s.kind === "video");
    const views = videos.map((s) => s.metrics.views).filter((v): v is number => v !== undefined);
    const med = median(views);
    for (const video of videos) {
      const v = video.metrics.views;
      const f = video.metrics.followers;
      video.outlier =
        (v !== undefined && views.length >= 5 && med > 0 && v >= 3 * med) ||
        (v !== undefined && f !== undefined && f > 0 && v >= 2 * f);
    }

    // Social posts (LinkedIn) expose no views: compare their engagement.
    const posts = group.filter((s) => s.kind === "social_post");
    const engagement = (s: Signal) =>
      s.metrics.likes === undefined && s.metrics.comments === undefined
        ? undefined
        : (s.metrics.likes ?? 0) + 3 * (s.metrics.comments ?? 0) + 5 * (s.metrics.shares ?? 0);
    const scores = posts.map(engagement).filter((v): v is number => v !== undefined);
    const postMedian = median(scores);
    for (const post of posts) {
      const e = engagement(post);
      post.outlier = e !== undefined && scores.length >= 5 && postMedian > 0 && e >= 3 * postMedian;
    }
  }
  return signals;
}

export interface TopicScoreInput {
  signals: Signal[];
  /** 0–100 from Claude, or from keyword overlap in basic mode. Undefined when no niche. */
  nicheFit?: number;
  now?: number;
}

const PLATFORM_SPREAD = [0, 25, 55, 80, 92, 100];

export function scoreTopic({ signals, nicheFit, now = Date.now() }: TopicScoreInput): TopicScores {
  if (signals.length === 0) {
    return { momentum: 0, reach: 0, crossPlatform: 0, freshness: 0, nicheFit: nicheFit ?? 0, total: 0 };
  }

  const strengths = signals.map((s) => s.strength).sort((a, b) => b - a);
  const top3 = strengths.slice(0, 3);
  const reach = clamp(Math.round(0.6 * strengths[0] + 0.4 * (top3.reduce((a, b) => a + b, 0) / top3.length)));

  const fresh = Math.max(...signals.map((s) => freshness(s.publishedAt, now)));

  const platforms = new Set<Platform>(signals.map((s) => s.platform));
  const crossPlatform = PLATFORM_SPREAD[Math.min(platforms.size, PLATFORM_SPREAD.length - 1)];

  // Momentum: is it accelerating right now?
  const isTrendingSearch = signals.some((s) => s.kind === "search_trend");
  const increase = Math.max(0, ...signals.map((s) => s.metrics.increasePct ?? 0));
  const outlierShare = signals.filter((s) => s.outlier).length / signals.length;
  const recentCount = signals.filter((s) => freshness(s.publishedAt, now) >= 70).length;
  const momentum = clamp(
    Math.round(
      0.45 * fresh +
        (isTrendingSearch ? 20 : 0) +
        Math.min(15, increase / 100) +
        25 * outlierShare +
        Math.min(15, recentCount * 3),
    ),
  );

  const weights =
    nicheFit === undefined
      ? { momentum: 0.35, reach: 0.3, crossPlatform: 0.2, freshness: 0.15, nicheFit: 0 }
      : { momentum: 0.25, reach: 0.2, crossPlatform: 0.15, freshness: 0.1, nicheFit: 0.3 };

  const total = Math.round(
    weights.momentum * momentum +
      weights.reach * reach +
      weights.crossPlatform * crossPlatform +
      weights.freshness * fresh +
      weights.nicheFit * (nicheFit ?? 0),
  );

  return { momentum, reach, crossPlatform, freshness: fresh, nicheFit: nicheFit ?? 0, total: clamp(total) };
}

/** Human-readable explanation of the formula, displayed in the UI. */
export const SCORE_EXPLANATION = [
  "Force d'un signal : rang percentile de son audience (volume de recherche, vues) parmi les signaux de la même source, pondéré par sa fraîcheur. Les articles sans audience mesurée sont classés par fraîcheur et position.",
  "Momentum : fraîcheur, présence dans les recherches en forte hausse, pourcentage de hausse, vidéos virales (3× la médiane ou 2× l'audience du compte) et publications LinkedIn à l'engagement 3× supérieur à la médiane.",
  "Portée : force des 3 meilleurs signaux du sujet.",
  "Multi-plateforme : nombre de plateformes où le sujet apparaît.",
  "Fraîcheur : demi-vie de 24 h sur le signal le plus récent.",
  "Pertinence niche : évaluée par Claude au regard de votre niche (ou recouvrement de mots-clés en mode sans IA).",
  "Score total : 25 % momentum, 20 % portée, 15 % multi-plateforme, 10 % fraîcheur, 30 % pertinence niche (sans niche : 35/30/20/15).",
];
