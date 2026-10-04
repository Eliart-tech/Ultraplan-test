/**
 * "Écrire ce script" from a competitor idea: turns one of Claude's ideas into
 * what the Studio's script step expects — a real Topic whose evidence signals
 * are the competitor's real posts the idea is inspired by, and a custom Angle
 * carrying the idea. Nothing is invented: metrics come from the posts,
 * scores from the deterministic scoring module. Pure and client-safe.
 */

import { scoreSignals, scoreTopic } from "../analysis/scoring";
import { detectSensitivity } from "../analysis/sensitivity";
import { shortHash, truncate } from "../analysis/text";
import type { Angle, CompetitorReport, CreatorData, CreatorPost, Signal, SignalMetrics, Topic } from "../types";
import {
  accountLabel,
  clip,
  CREATOR_PLATFORM_LABELS,
  CREATOR_SIGNAL_PLATFORMS,
  CREATOR_SOURCE_IDS,
  formatCompactFr,
  formatRatio,
  postLabel,
} from "./labels";
import { performanceRatios } from "./stats";

export interface StudioHandoff {
  topic: Topic;
  signals: Signal[];
  angle: Angle;
}

const MAX_KEYWORDS = 6;

function reportTime(report: CompetitorReport): number {
  const fetched = Date.parse(report.data.fetchedAt);
  if (!Number.isNaN(fetched)) return fetched;
  const created = Date.parse(report.createdAt);
  return Number.isNaN(created) ? 0 : created;
}

function metricsOf(post: CreatorPost, followers: number | undefined): SignalMetrics {
  const metrics: SignalMetrics = {};
  const { views, likes, comments, shares, saves } = post.metrics;
  if (views !== undefined) metrics.views = views;
  if (likes !== undefined) metrics.likes = likes;
  if (comments !== undefined) metrics.comments = comments;
  if (shares !== undefined) metrics.shares = shares;
  if (saves !== undefined) metrics.saves = saves;
  if (followers !== undefined) metrics.followers = followers;
  if (post.durationSec !== undefined) metrics.durationSec = post.durationSec;
  return metrics;
}

/**
 * One competitor post as a script evidence signal (strength filled by
 * `scoreSignals`). Only the report's account and data policy are read, so any
 * real post with a known author fits (the "Ce qui cartonne" lab reuses it).
 */
export function postToSignal(report: { data: Pick<CreatorData, "account" | "ratiosAllowed"> }, post: CreatorPost): Signal {
  const { account, ratiosAllowed } = report.data;
  const source = CREATOR_SOURCE_IDS[account.platform];
  const title = post.title.trim() || truncate(post.text, 120) || `Publication de ${accountLabel(account)}`;
  const text = truncate(post.text, 500);
  return {
    id: `${source}:cmp-${shortHash(`${account.platform}|${account.handle}|${post.id}`)}`,
    source,
    platform: CREATOR_SIGNAL_PLATFORMS[account.platform],
    kind: post.kind,
    title: clip(title, 500),
    ...(text && text !== title ? { text } : {}),
    url: post.url,
    author: clip(accountLabel(account), 200),
    ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
    // Without the follower count, scoring derives no views ÷ followers ratio
    // (forbidden on YouTube data unless the derived-metrics amendment is accepted).
    metrics: metricsOf(post, ratiosAllowed === false ? undefined : account.followers),
    tags: [...new Set(post.hashtags.map((tag) => clip(tag.replace(/^#+/, "").toLowerCase(), 100)).filter(Boolean))].slice(0, 50),
    related: [],
    strength: 0,
  };
}

function evidenceLine(post: CreatorPost, ratio: number | undefined): string {
  const facts = [
    post.metrics.views !== undefined ? `${formatCompactFr(post.metrics.views)} vues` : undefined,
    ratio !== undefined ? `${formatRatio(ratio)} sa médiane` : undefined,
  ].filter(Boolean);
  return `${postLabel(post, 80)}${facts.length ? ` (${facts.join(", ")})` : ""}`;
}

const sentence = (value: string) => value.trim().replace(/[.\s]+$/, "");

/**
 * @throws RangeError (French message) when the report has no idea at this index.
 */
export function ideaToStudio(report: CompetitorReport, ideaIndex: number): StudioHandoff {
  const idea = report.insights?.ideas[ideaIndex];
  if (!idea) throw new RangeError("Idée introuvable dans cette analyse : relancez l'analyse du concurrent.");

  const { account, posts } = report.data;
  const who = accountLabel(account);
  const now = reportTime(report);
  const byId = new Map(posts.map((post) => [post.id, post]));
  const inspired = [...new Set(idea.inspiredBy)]
    .map((id) => byId.get(id))
    .filter((post): post is CreatorPost => post !== undefined);

  const signals = scoreSignals(
    inspired.map((post) => postToSignal(report, post)),
    now,
  );
  // Over-performance against the creator's own median is the stronger proof.
  const outlierIds = new Set(report.stats.outliers.map((outlier) => outlier.postId));
  inspired.forEach((post, index) => {
    if (outlierIds.has(post.id)) signals[index].outlier = true;
  });

  // YouTube API terms forbid derived metrics on other channels: raw counts only then.
  const ratios = report.data.ratiosAllowed === false ? new Map<string, number>() : performanceRatios(posts, report.stats.rankingMetric);
  const fallbackTitle = `Idée inspirée de ${who}`;
  const title = clip(idea.title, 200).length >= 3 ? clip(idea.title, 200) : fallbackTitle;
  const id = `competitor-${shortHash(`${report.id}|${ideaIndex}|${idea.title}`)}`;

  const angle: Angle = {
    id: `${id}-custom`,
    type: "custom",
    title,
    pitch: clip(`${sentence(idea.angle)}.${idea.format.trim() ? ` Format : ${sentence(idea.format)}.` : ""}`, 1000),
    hook: clip(idea.hook, 500),
    whyItWorks: clip(idea.whyForYou, 1000),
  };

  const evidence = inspired.map((post) => evidenceLine(post, ratios.get(post.id)));
  const whyNow = evidence.length
    ? `Mécanique qui marche chez ${who} : ${evidence.join(" ; ")}. ${sentence(idea.whyForYou)}.`
    : `${sentence(idea.whyForYou)}.`;

  const keywords = [
    ...new Set(inspired.flatMap((post) => post.hashtags.map((tag) => tag.replace(/^#+/, "").toLowerCase().trim()))),
  ]
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS)
    .map((keyword) => clip(keyword, 100));

  const topic: Topic = {
    id,
    title: clip(idea.title, 300) || fallbackTitle,
    summary: clip(
      `Idée de vidéo issue de l'analyse concurrentielle de ${who} (${CREATOR_PLATFORM_LABELS[account.platform]}) : ${sentence(idea.angle)}.`,
      2000,
    ),
    whyNow: clip(whyNow, 2000),
    category: "Veille concurrentielle",
    platforms: [CREATOR_SIGNAL_PLATFORMS[account.platform]],
    signalIds: signals.map((signal) => signal.id),
    keywords,
    lifespan: "durable",
    // The competitor already exploits this mechanic: room left, but not empty.
    saturation: "moyenne",
    sensitivity: detectSensitivity(idea.title, [idea.angle, idea.hook, ...inspired.map((post) => post.title)]),
    scores: scoreTopic({ signals, now }),
    angles: [angle],
  };
  return { topic, signals, angle };
}
