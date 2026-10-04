/**
 * Saved competitor report → the compact brief sent with a script request, so
 * the script prompt can make the video stand out from that creator. Works on
 * "stats" reports too (Claude unavailable): then only real, deterministic
 * material is used (bio, hashtags, titles of the posts that over-performed).
 * Pure and client-safe. Lengths follow `competitorBriefSchema`.
 */

import type { CompetitorBrief, CompetitorReport, CreatorPost } from "../types";
import { accountLabel, clip, CREATOR_PLATFORM_LABELS, formatCompactFr, formatMultiplier, formatRatio } from "./labels";

const MAX_ITEMS = 10;
const MAX_TITLES = 15;
const STATS_HASHTAGS = 6;
const STATS_HOOKS = 5;
const STATS_FOLLOW_HINTS = 3;

function list(values: string[], maxLength: number, maxItems = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = clip(raw, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length === maxItems) break;
  }
  return result;
}

function statsPositioning(report: CompetitorReport): string {
  const { account } = report.data;
  const who = [
    account.displayName?.trim() && account.platform !== "linkedin" ? `${account.displayName.trim()} (${accountLabel(account)})` : accountLabel(account),
    `${CREATOR_PLATFORM_LABELS[account.platform]}${account.followers !== undefined ? `, ${formatCompactFr(account.followers)} abonnés` : ""}`,
  ].join(" — ");
  const parts = [`${who}.`];
  if (account.bio?.trim()) parts.push(`Bio : « ${clip(account.bio, 300)} ».`);
  const tags = report.stats.hashtags.slice(0, STATS_HASHTAGS).map((bucket) => bucket.label);
  if (tags.length) parts.push(`Hashtags les plus utilisés : ${tags.join(", ")}.`);
  return parts.join(" ");
}

export function toCompetitorBrief(report: CompetitorReport): CompetitorBrief {
  const { data, stats, insights } = report;
  const byId = new Map<string, CreatorPost>(data.posts.map((post) => [post.id, post]));
  const recentTitles = list(
    data.posts.map((post) => post.title),
    300,
    MAX_TITLES,
  );

  const base: Pick<CompetitorBrief, "platform" | "handle" | "recentTitles" | "medianViews"> = {
    platform: data.account.platform,
    handle: clip(data.account.handle.replace(/^@+/, ""), 100) || data.account.platform,
    recentTitles,
    ...(stats.medianViews !== undefined ? { medianViews: stats.medianViews } : {}),
  };

  if (insights) {
    const positioning = [
      insights.positioning,
      insights.audience ? `Audience : ${insights.audience}` : "",
      insights.tone ? `Ton : ${insights.tone}` : "",
    ]
      .map((part) => part.trim().replace(/[.\s]+$/, ""))
      .filter(Boolean)
      .join(". ");
    const followDrivers = list(
      (insights.followDrivers ?? []).map((driver) => driver.insight),
      300,
    );
    return {
      ...base,
      positioning: clip(`${positioning}.`, 1000),
      pillars: list(
        insights.pillars.map((pillar) => [pillar.name, pillar.share, pillar.performance].filter((p) => p.trim()).join(" — ")),
        200,
      ),
      hookPatterns: list(
        insights.hookPatterns.map((hook) =>
          hook.examples[0] ? `${hook.pattern} — ex. « ${clip(hook.examples[0].quote, 140)} »` : hook.pattern,
        ),
        300,
      ),
      overused: list(
        [
          ...insights.formats.map((format) => `Format récurrent : ${format.name} — ${format.description}`),
          ...insights.doNotCopy.map((item) => `Signature à ne pas reprendre : ${item}`),
        ],
        300,
      ),
      gaps: list(
        [
          ...insights.gaps.map((gap) => `${gap.opportunity} — ${gap.why}`),
          ...insights.differentiation.map((d) => `Pour te différencier : ${d.recommendation} — ${d.how}`),
        ],
        300,
      ),
      ...(followDrivers.length ? { followDrivers } : {}),
    };
  }

  // "stats" mode: only deterministic, real material.
  const hookPatterns = list(
    stats.outliers
      .map((outlier) => ({ outlier, post: byId.get(outlier.postId) }))
      .filter((entry): entry is { outlier: (typeof stats.outliers)[number]; post: CreatorPost } => Boolean(entry.post?.title.trim()))
      .slice(0, STATS_HOOKS)
      .map(({ outlier, post }) => `Accroche d'une publication à ${formatRatio(outlier.ratio)} sa médiane : « ${clip(post.title, 200)} »`),
    300,
  );
  const followDrivers = list(
    (stats.audienceMultipliers ?? [])
      .filter((entry) => entry.multiplier > 1)
      .map((entry) => ({ entry, post: byId.get(entry.postId) }))
      .filter((item): item is { entry: { postId: string; multiplier: number }; post: CreatorPost } => Boolean(item.post))
      .slice(0, STATS_FOLLOW_HINTS)
      .map(
        ({ entry, post }) =>
          `Portée au-delà de ses abonnés (vues = ${formatMultiplier(entry.multiplier)} ses abonnés) : « ${clip(post.title || "publication sans titre", 180)} »`,
      ),
    300,
  );
  return {
    ...base,
    positioning: clip(statsPositioning(report), 1000),
    pillars: list(
      stats.hashtags.slice(0, STATS_HASHTAGS).map((bucket) => `${bucket.label} (${bucket.posts} publication${bucket.posts > 1 ? "s" : ""})`),
      200,
    ),
    hookPatterns,
    overused: [],
    gaps: [],
    ...(followDrivers.length ? { followDrivers } : {}),
  };
}
