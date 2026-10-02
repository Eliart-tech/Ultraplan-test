/**
 * Deterministic topic grouping used when no Anthropic key is configured
 * ("mode sans IA"), and as a safety net if the AI synthesis fails. Groups
 * signals that talk about the same thing using token overlap only.
 */

import type { AnalyzeRequest, Platform, Signal, Topic } from "../types";
import { scoreTopic } from "./scoring";
import { detectSensitivity } from "./sensitivity";
import { containment, jaccard, shortHash, tokenSet, tokenSetExact, tokenize } from "./text";

interface Cluster {
  seed: Signal;
  key: Set<string>;
  members: Signal[];
  /** Overrides the title derived from the seed. */
  title?: string;
}

const SEED_KINDS = new Set(["search_trend", "article_views"]);

function signalTokens(signal: Signal): Set<string> {
  return tokenSet(signal.title, signal.text, signal.tags.join(" "), ...signal.related.map((r) => r.title));
}

/**
 * Tokens used to attach a signal to a trend: the author's name is removed so
 * a "tf1" search trend does not swallow every "…｜TF1 INFO" video.
 */
function matchTokens(signal: Signal): Set<string> {
  const tokens = signalTokens(signal);
  for (const token of tokenSet(signal.author)) tokens.delete(token);
  return tokens;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const formatter = new Intl.NumberFormat("fr-FR");

function whyNow(members: Signal[]): string {
  const parts: string[] = [];
  const search = members.filter((s) => s.kind === "search_trend");
  if (search.length) {
    const volume = Math.max(...search.map((s) => s.metrics.searchVolume ?? 0));
    parts.push(
      volume > 0
        ? `Recherche en forte hausse sur Google (${formatter.format(volume)}+ recherches récentes)`
        : "Recherche en forte hausse sur Google",
    );
  }
  const news = members.filter((s) => s.kind === "news").length;
  const related = members.reduce((n, s) => n + s.related.length, 0);
  if (news + related > 0) parts.push(`${news + related} article(s) de presse récents`);
  const wiki = members.find((s) => s.kind === "article_views");
  if (wiki?.metrics.views) parts.push(`${formatter.format(wiki.metrics.views)} lectures Wikipédia hier`);
  const videos = members.filter((s) => s.kind === "short_video" || s.kind === "video");
  if (videos.length) {
    const views = videos.reduce((n, s) => n + (s.metrics.views ?? 0), 0);
    const outliers = videos.filter((s) => s.outlier).length;
    parts.push(
      `${videos.length} vidéo(s)${views ? ` cumulant ${formatter.format(views)} vues` : ""}${
        outliers ? `, dont ${outliers} virale(s)` : ""
      }`,
    );
  }
  return parts.length ? `${parts.join(" · ")}.` : "Signal détecté dans les sources analysées.";
}

/** Token sets of a topic: `core` = titles and hashtags, `all` adds texts and related headlines. */
interface TopicTokens {
  core: Set<string>;
  all: Set<string>;
  coreExact: Set<string>;
  allExact: Set<string>;
}

function topicTokens(members: Signal[]): TopicTokens {
  const result: TopicTokens = { core: new Set(), all: new Set(), coreExact: new Set(), allExact: new Set() };
  const add = (into: Set<string>, from: Set<string>) => from.forEach((token) => into.add(token));
  for (const member of members) {
    const core = [member.title, member.tags.join(" ")];
    const extra = [member.text, ...member.related.map((r) => r.title)];
    add(result.core, tokenSet(...core));
    add(result.coreExact, tokenSetExact(...core));
    add(result.all, tokenSet(...core, ...extra));
    add(result.allExact, tokenSetExact(...core, ...extra));
  }
  return result;
}

/**
 * Explicit keywords are strong intent: a topic whose titles contain one fully
 * fits; a keyword found only in a related headline counts 70 % (homonyms such
 * as "retraite" of a cyclist). Words of the free-text niche description
 * ("jeunes", "actifs"…) are weaker evidence and reach 60 at most.
 * A keyword typed with accents is matched with accents ("épargne" ≠ "épargné").
 */
function nicheFitFromKeywords(request: AnalyzeRequest, tokens: TopicTokens): number | undefined {
  const hasAccent = (value: string) => /[^\u0000-\u007f]/.test(value);
  const keywordFits = request.keywords.map((keyword) => {
    const exact = hasAccent(keyword);
    const set = exact ? tokenSetExact(keyword) : tokenSet(keyword);
    const core = containment(set, exact ? tokens.coreExact : tokens.core);
    const all = containment(set, exact ? tokens.allExact : tokens.all);
    return Math.max(core, 0.7 * all);
  });
  const niche = tokenSet(request.niche);
  if (keywordFits.length === 0 && niche.size === 0) return undefined;
  const keywordFit = Math.max(0, ...keywordFits);
  const nicheFit = Math.min(1, containment(niche, tokens.all) * 1.5) * 0.6;
  return Math.round(100 * Math.max(keywordFit, nicheFit));
}

function buildTopic(cluster: Cluster, request: AnalyzeRequest, now: number): Topic {
  const { seed, members } = cluster;

  const headlines = [
    ...members.flatMap((m) => m.related.map((r) => r.title)),
    ...members.filter((m) => m.kind === "news").map((m) => m.title),
  ];
  const platforms = [...new Set<Platform>(members.map((m) => m.platform))];
  const isVideoOnly = members.every((m) => m.kind === "short_video" || m.kind === "video");
  const newsVolume = headlines.length;

  const tokenFrequency = new Map<string, number>();
  for (const member of members) {
    for (const token of tokenize(`${member.title} ${member.tags.join(" ")}`)) {
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
    }
  }
  const keywords = [...tokenFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token);

  const title =
    cluster.title ??
    (seed.kind === "short_video" || seed.kind === "video"
      ? `Ce qui performe sur #${seed.query ?? keywords[0] ?? "niche"}`
      : capitalize(seed.title));

  const summary = headlines.length
    ? `À la une : ${headlines.slice(0, 3).map((h) => `« ${h} »`).join(" ; ")}.`
    : seed.text ?? `Sujet détecté via ${platforms.join(", ")}.`;

  return {
    id: `topic-${shortHash(seed.id)}`,
    title,
    summary,
    whyNow: whyNow(members),
    category: isVideoOnly ? "Tendance de niche" : "Actualité",
    platforms,
    signalIds: members.map((m) => m.id),
    keywords,
    lifespan: isVideoOnly ? "court" : seed.kind === "search_trend" ? "flash" : "court",
    saturation: newsVolume >= 8 ? "elevee" : newsVolume >= 3 ? "moyenne" : "faible",
    sensitivity: detectSensitivity(title, [...headlines, ...members.filter((m) => m.kind !== "news").map((m) => m.title)]),
    scores: scoreTopic({ signals: members, nicheFit: nicheFitFromKeywords(request, topicTokens(members)), now }),
    angles: [],
  };
}

export function basicTopics(signals: Signal[], request: AnalyzeRequest, now = Date.now()): Topic[] {
  const byStrength = [...signals].sort((a, b) => b.strength - a.strength);
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];

  // 1. Search trends and most-read articles seed topics.
  for (const seed of byStrength.filter((s) => SEED_KINDS.has(s.kind))) {
    if (assigned.has(seed.id)) continue;
    const key = tokenSet(seed.title);
    if (key.size === 0) continue;
    // Merge seeds that are the same query from two sources.
    const existing = clusters.find((c) => jaccard(c.key, key) >= 0.6);
    if (existing) {
      existing.members.push(seed);
      assigned.add(seed.id);
      continue;
    }
    clusters.push({ seed, key, members: [seed] });
    assigned.add(seed.id);
  }

  // 2. Attach news and videos that mention a seed.
  for (const signal of byStrength) {
    if (assigned.has(signal.id)) continue;
    const tokens = matchTokens(signal);
    const match = clusters.find((c) => containment(c.key, tokens) >= (c.key.size === 1 ? 1 : 0.6));
    if (match) {
      match.members.push(signal);
      assigned.add(signal.id);
    }
  }

  // 3. Niche keyword searches: one topic per keyword, so ten articles about
  //    "intelligence artificielle" do not become ten topics.
  const byQuery = new Map<string, Signal[]>();
  for (const signal of byStrength) {
    if (assigned.has(signal.id) || !signal.query) continue;
    byQuery.set(signal.query, [...(byQuery.get(signal.query) ?? []), signal]);
    assigned.add(signal.id);
  }
  for (const [query, members] of byQuery) {
    const isVideo = members.every((m) => m.kind === "short_video" || m.kind === "video");
    clusters.push({
      seed: members[0],
      key: tokenSet(query),
      members,
      title: isVideo ? `Ce qui performe sur #${query.replace(/\s+/g, "")}` : `Actualité « ${query} »`,
    });
  }

  // 4. Everything else (general news, channel videos): greedy grouping by
  //    headline similarity — an article and a video on the same story make a
  //    cross-platform topic.
  for (const signal of byStrength) {
    if (assigned.has(signal.id)) continue;
    const key = tokenSet(signal.title);
    const cluster: Cluster = { seed: signal, key, members: [signal] };
    assigned.add(signal.id);
    for (const other of byStrength) {
      if (assigned.has(other.id)) continue;
      if (jaccard(key, tokenSet(other.title)) >= 0.3) {
        cluster.members.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(cluster);
  }

  return clusters
    .map((cluster) => buildTopic(cluster, request, now))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, request.maxTopics);
}
