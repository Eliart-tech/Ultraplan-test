/**
 * "Already covered by a competitor you follow": finds, in the saved
 * competitor reports, the posts that already treat a radar topic — a
 * differentiation hint shown on the topic cards. Deterministic token
 * matching (no AI). Pure and client-safe.
 *
 * A post matches when it contains a whole multi-word keyword of the topic
 * ("changement d'heure"), a hashtag equal to a keyword written as one word
 * (#changementdheure), or at least two words of the topic title covering
 * half of it.
 */

import { containment, stripAccents, tokenSet } from "../analysis/text";
import type { CompetitorReport, CreatorPlatform, CreatorPost, Topic } from "../types";
import { performanceRatios } from "./stats";

export interface CoverageHit {
  platform: CreatorPlatform;
  handle: string;
  postId: string;
  title: string;
  url: string;
  publishedAt?: string;
  views?: number;
  /** Performance vs the competitor's own median (×1,0 = usual). */
  ratio?: number;
}

const MAX_HITS = 3;
const MIN_TITLE_HITS = 2;
const MIN_TITLE_CONTAINMENT = 0.5;
const MIN_COMPACT_KEYWORD = 6;

const compactForm = (value: string) => stripAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, "");

interface TopicMatcher {
  titleTokens: Set<string>;
  phrases: Set<string>[];
  compactKeywords: Set<string>;
}

function matcherFor(topic: Topic): TopicMatcher {
  const keywords = topic.keywords.map((keyword) => keyword.replace(/^#/, "")).filter((k) => k.trim());
  return {
    titleTokens: tokenSet(topic.title),
    phrases: keywords.map((keyword) => tokenSet(keyword)).filter((tokens) => tokens.size >= 2),
    compactKeywords: new Set(keywords.map(compactForm).filter((k) => k.length >= MIN_COMPACT_KEYWORD)),
  };
}

function postTreatsTopic(post: CreatorPost, matcher: TopicMatcher): boolean {
  const tokens = tokenSet(post.title, post.text, post.hashtags.join(" "));
  if (matcher.phrases.some((phrase) => containment(phrase, tokens) === 1)) return true;
  if (post.hashtags.some((tag) => matcher.compactKeywords.has(compactForm(tag)))) return true;
  let hits = 0;
  for (const token of matcher.titleTokens) if (tokens.has(token)) hits++;
  return hits >= MIN_TITLE_HITS && containment(matcher.titleTokens, tokens) >= MIN_TITLE_CONTAINMENT;
}

const timeOf = (iso: string | undefined) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
};

/** Posts of the saved competitors that already treat the topic, most recent first (3 at most). */
export function competitorCoverage(topic: Topic, reports: readonly CompetitorReport[]): CoverageHit[] {
  const matcher = matcherFor(topic);
  if (matcher.titleTokens.size === 0 && matcher.phrases.length === 0 && matcher.compactKeywords.size === 0) return [];
  const hits: CoverageHit[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    const { account, posts } = report.data;
    const ratios = performanceRatios(posts, report.stats.rankingMetric);
    for (const post of posts) {
      const key = `${account.platform}:${account.handle}:${post.id}`;
      if (seen.has(key) || !postTreatsTopic(post, matcher)) continue;
      seen.add(key);
      const ratio = ratios.get(post.id);
      hits.push({
        platform: account.platform,
        handle: account.handle,
        postId: post.id,
        title: post.title,
        url: post.url,
        ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
        ...(post.metrics.views !== undefined ? { views: post.metrics.views } : {}),
        ...(ratio !== undefined ? { ratio } : {}),
      });
    }
  }
  return hits.sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt)).slice(0, MAX_HITS);
}
