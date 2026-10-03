/**
 * Pure helpers of the Studio: topic sorting/filtering, evidence lookup,
 * safe links and request shaping. Unit-tested, no React.
 */

import type {
  AnalyzeRequest,
  GeneratedScript,
  Platform,
  ScriptDraft,
  ScriptSettings,
  Signal,
  SourceId,
  SourceStatus,
  Topic,
} from "@/lib/types";
import { CTA_DETAIL, type TopicSort } from "./studio-options";

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

const SORT_KEYS: Record<TopicSort, keyof Topic["scores"]> = {
  score: "total",
  momentum: "momentum",
  freshness: "freshness",
  niche: "nicheFit",
};

/** New array sorted by the chosen score (descending), ties broken by total. */
export function sortTopics(topics: Topic[], sort: TopicSort): Topic[] {
  const key = SORT_KEYS[sort] ?? "total";
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort(
      (a, b) =>
        b.topic.scores[key] - a.topic.scores[key] ||
        b.topic.scores.total - a.topic.scores.total ||
        a.index - b.index,
    )
    .map((entry) => entry.topic);
}

export interface TopicFilterOptions {
  /** Keep topics present on at least one of these platforms ([] = all). */
  platforms: Platform[];
  /** Hide topics whose sensitivity is "elevee". */
  hideSensitive: boolean;
}

export function isHighlySensitive(topic: Topic): boolean {
  return topic.sensitivity.level === "elevee";
}

/** Visible topics plus how many highly sensitive ones the toggle hides. */
export function filterTopics(
  topics: Topic[],
  { platforms, hideSensitive }: TopicFilterOptions,
): { visible: Topic[]; hiddenSensitive: number } {
  const byPlatform =
    platforms.length === 0 ? topics : topics.filter((topic) => topic.platforms.some((p) => platforms.includes(p)));
  if (!hideSensitive) return { visible: byPlatform, hiddenSensitive: 0 };
  const visible = byPlatform.filter((topic) => !isHighlySensitive(topic));
  return { visible, hiddenSensitive: byPlatform.length - visible.length };
}

/** Platforms present in the topics, with the number of topics on each, in a stable order. */
export function platformCounts(topics: Topic[]): { platform: Platform; count: number }[] {
  const order: Platform[] = ["google", "news", "wikipedia", "youtube", "instagram", "tiktok", "linkedin"];
  const counts = new Map<Platform, number>();
  for (const topic of topics) {
    for (const platform of new Set(topic.platforms)) counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return order.filter((platform) => counts.has(platform)).map((platform) => ({ platform, count: counts.get(platform) ?? 0 }));
}

/** Evidence signals of a topic, strongest first (unknown ids skipped). */
export function evidenceFor(topic: Topic, signals: Map<string, Signal>): Signal[] {
  const seen = new Set<string>();
  const evidence: Signal[] = [];
  for (const id of topic.signalIds) {
    const signal = signals.get(id);
    if (signal && !seen.has(id)) {
      seen.add(id);
      evidence.push(signal);
    }
  }
  return evidence.sort((a, b) => b.strength - a.strength);
}

/** True when the analysis had a niche or keywords (the niche score is meaningful). */
export function hasNiche(request: Pick<AnalyzeRequest, "niche" | "keywords">): boolean {
  return request.niche.trim() !== "" || request.keywords.length > 0;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Free sources the server has configured: the Radar's default selection. */
export function defaultSourceIds(statuses: SourceStatus[]): SourceId[] {
  return statuses.filter((source) => source.configured && source.free).map((source) => source.id);
}

/**
 * Sources the analysis will use: the explicit choice (or the defaults when
 * the user never touched the list), minus anything not configured.
 */
export function effectiveSources(chosen: SourceId[] | null, statuses: SourceStatus[] | null): SourceId[] {
  if (!statuses) return chosen ?? [];
  const configured = new Set(statuses.filter((source) => source.configured).map((source) => source.id));
  const base = chosen ?? defaultSourceIds(statuses);
  return statuses.map((source) => source.id).filter((id) => base.includes(id) && configured.has(id));
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** The URL when it is an absolute http(s) link, else undefined (never `javascript:`…). */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** "lemonde.fr" for "https://www.lemonde.fr/…" ("" when not a URL). */
export function hostnameOf(url: string | null | undefined): string {
  const href = safeHref(url);
  if (!href) return "";
  return new URL(href).hostname.replace(/^www\./, "");
}

// ---------------------------------------------------------------------------
// Script requests
// ---------------------------------------------------------------------------

/**
 * Settings as sent to the API: optional texts trimmed (and dropped when
 * empty), the CTA detail only for CTA types that use one.
 */
export function cleanSettings(settings: ScriptSettings): ScriptSettings {
  const { ctaDetail, extraInstructions, ...rest } = settings;
  const detail = CTA_DETAIL[settings.cta] ? ctaDetail?.trim().slice(0, 200) : undefined;
  const extra = extraInstructions?.trim().slice(0, 1000);
  return {
    ...rest,
    ...(detail ? { ctaDetail: detail } : {}),
    ...(extra ? { extraInstructions: extra } : {}),
  };
}

/** The draft part of a generated script (what `refine.previous` expects). */
export function toScriptDraft(script: ScriptDraft | GeneratedScript): ScriptDraft {
  return {
    title: script.title,
    hooks: script.hooks,
    beats: script.beats,
    fullScript: script.fullScript,
    caption: script.caption,
    hashtags: script.hashtags,
    cta: script.cta,
    strengths: script.strengths,
    risks: script.risks,
    checklist: script.checklist,
    factsToVerify: script.factsToVerify,
    sources: script.sources,
  };
}

/** Hashtags as one line ("#a #b"), whatever the model returned ("a", "#a"). */
export function hashtagLine(hashtags: string[]): string {
  return hashtags
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(" ");
}

/** Splits text on `{À VÉRIFIER : …}` placeholders so the UI can highlight them. */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  const parts: { text: string; placeholder: boolean }[] = [];
  const pattern = /\{[^{}]*\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), placeholder: false });
    parts.push({ text: match[0], placeholder: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false });
  return parts;
}

/**
 * Random id for client-made objects (custom angles). `crypto.randomUUID`
 * only exists in secure contexts (HTTPS, localhost): fall back otherwise.
 * Call from event handlers, never during render.
 */
export function makeId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}
