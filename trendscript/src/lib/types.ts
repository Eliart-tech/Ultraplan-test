/**
 * Domain model shared by the server (connectors, analysis, script generation)
 * and the browser (studio UI, history). Client-safe: no secrets, no Node APIs.
 */

// ---------------------------------------------------------------------------
// Sources & signals
// ---------------------------------------------------------------------------

export const SOURCE_IDS = [
  "google_trends",
  "google_news",
  "wikipedia",
  "serpapi_trends",
  "youtube",
  "instagram_graph",
  "instagram_apify",
  "tiktok_apify",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const PLATFORMS = [
  "google",
  "news",
  "wikipedia",
  "youtube",
  "instagram",
  "tiktok",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type SignalKind =
  | "search_trend" // a trending search query (Google Trends)
  | "news" // a news article (Google News)
  | "article_views" // a most-read encyclopedia article (Wikipedia pageviews)
  | "short_video" // Reel / TikTok / Short
  | "video"; // long-form video

export interface SignalMetrics {
  /** Approximate search volume (Google Trends "20K+" → 20000). */
  searchVolume?: number;
  /** Percentage increase reported by the source (SerpApi trending now). */
  increasePct?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  /** Followers / subscribers of the author, when the source exposes it. */
  followers?: number;
  /** Position in the source's own ranking (1 = top). */
  rank?: number;
  durationSec?: number;
}

export interface RelatedLink {
  title: string;
  url: string;
  source?: string;
}

/** One normalized observation coming from a single source. */
export interface Signal {
  /** Stable id: `${source}:${hash}` — unique within an analysis. */
  id: string;
  source: SourceId;
  platform: Platform;
  kind: SignalKind;
  title: string;
  /** Caption, description or snippet — plain text, truncated (~500 chars). */
  text?: string;
  url?: string;
  thumbnailUrl?: string;
  /** Account, channel or news outlet. */
  author?: string;
  /** ISO 8601. */
  publishedAt?: string;
  metrics: SignalMetrics;
  /** Hashtags / related queries — lowercase, without '#'. */
  tags: string[];
  /** Articles attached to a search trend, related videos, etc. */
  related: RelatedLink[];
  /** The niche keyword or hashtag that produced this signal, if any. */
  query?: string;
  /**
   * 0–100 strength of the signal relative to the other signals of the same
   * source in this run (computed by the scoring module, not by connectors).
   */
  strength: number;
  /** True when the item clearly outperforms its peers (views vs. median/followers). */
  outlier?: boolean;
}

export interface SourceRunSummary {
  source: SourceId;
  ok: boolean;
  /** Not configured (missing env vars) — skipped, not an error. */
  skipped?: boolean;
  count: number;
  durationMs: number;
  cached: boolean;
  error?: string;
  warning?: string;
}

/** Client-safe description of a source and whether the server has it configured. */
export interface SourceStatus {
  id: SourceId;
  label: string;
  platform: Platform;
  configured: boolean;
  /** Free to use (no paid account needed). */
  free: boolean;
  /** Needs niche keywords / hashtags to return anything. */
  needsKeywords: boolean;
  description: string;
  /** Env vars to set to enable the source. */
  envVars: string[];
  /** Short French setup guide (markdown-free plain text steps). */
  setup: string[];
  /** Cost / quota note shown in the UI. */
  costNote: string;
  docsUrl: string;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface AnalyzeRequest {
  /** ISO 3166-1 alpha-2, upper-case (FR, BE, CH, CA, US, GB…). */
  geo: string;
  /** ISO 639-1 (fr, en…). */
  language: string;
  /** Free-text description of the creator's niche ("finance perso pour jeunes actifs"). */
  niche: string;
  /** Niche keywords / hashtags used by keyword-driven sources (max 8). */
  keywords: string[];
  sources: SourceId[];
  /** Number of topics to propose (5–15). */
  maxTopics: number;
}

export type Lifespan = "flash" | "court" | "durable";
export type Level3 = "faible" | "moyenne" | "elevee";

export const ANGLE_TYPES = [
  "pedagogique",
  "analyse",
  "opinion",
  "storytelling",
  "humour",
  "reaction",
  "conseil",
  "debunk",
  "coulisses",
  "comparaison",
] as const;
export type AngleType = (typeof ANGLE_TYPES)[number];

export interface Angle {
  id: string;
  type: AngleType | "custom";
  title: string;
  /** 1–2 sentences: what the video says and why this audience cares. */
  pitch: string;
  /** Example opening line. */
  hook: string;
  whyItWorks: string;
}

export interface TopicScores {
  /** How fast it is rising (traffic, increase %, recency of signals). */
  momentum: number;
  /** Absolute audience size (search volume, views). */
  reach: number;
  /** Presence across platforms/sources. */
  crossPlatform: number;
  /** Recency of the freshest evidence. */
  freshness: number;
  /** Relevance for the creator's niche. */
  nicheFit: number;
  /** Weighted total. */
  total: number;
}

export interface Topic {
  id: string;
  title: string;
  /** What is happening, factual, 2–3 sentences. */
  summary: string;
  /** Why it is trending right now. */
  whyNow: string;
  category: string;
  platforms: Platform[];
  /** Evidence: ids of signals of this analysis. */
  signalIds: string[];
  keywords: string[];
  lifespan: Lifespan;
  saturation: Level3;
  sensitivity: { level: Level3; reason: string };
  scores: TopicScores;
  angles: Angle[];
}

export interface Analysis {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  request: AnalyzeRequest;
  /** "ai": topics clustered and framed by Claude; "basic": deterministic grouping only. */
  mode: "ai" | "basic";
  model?: string;
  sources: SourceRunSummary[];
  signals: Signal[];
  topics: Topic[];
  /** Human-readable notes (French) about limits, skipped sources, etc. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------

export const SCRIPT_PLATFORMS = [
  "instagram_reels",
  "tiktok",
  "youtube_shorts",
] as const;
export type ScriptPlatform = (typeof SCRIPT_PLATFORMS)[number];

export const DURATIONS = [15, 30, 45, 60, 90] as const;
export type DurationSec = (typeof DURATIONS)[number];

export const TONES = [
  "expert",
  "decontracte",
  "humoristique",
  "inspirant",
  "provocateur",
  "journalistique",
] as const;
export type Tone = (typeof TONES)[number];

export const VIDEO_FORMATS = [
  "face_camera",
  "voice_over_broll",
  "green_screen",
  "screen_tutorial",
] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const HOOK_STYLES = [
  "auto",
  "question",
  "chiffre_choc",
  "contre_intuitif",
  "story",
  "pov",
  "erreur_courante",
  "promesse",
  "polemique_mesuree",
  "liste",
] as const;
export type HookStyle = (typeof HOOK_STYLES)[number];

export const CTA_TYPES = [
  "auto",
  "comment_keyword",
  "share",
  "save",
  "follow",
  "link_in_bio",
  "none",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export interface ScriptSettings {
  platform: ScriptPlatform;
  durationSec: DurationSec;
  /** 0 = sobre/informatif … 100 = ultra-viral. */
  virality: number;
  /** 0 = divertissement pur … 100 = cours structuré. */
  pedagogy: number;
  tone: Tone;
  format: VideoFormat;
  hookStyle: HookStyle;
  cta: CtaType;
  /** Keyword to comment, product in bio, etc. */
  ctaDetail?: string;
  /** Output language (ISO 639-1). */
  language: string;
  /** Let Claude search the web for fresh, sourced facts before writing. */
  research: boolean;
  extraInstructions?: string;
}

/** Saved in the browser and sent with every generation request. */
export interface CreatorProfile {
  name: string;
  niche: string;
  audience: string;
  positioning: string;
  /** Tics de langage, expressions, tutoiement/vouvoiement… */
  voice: string;
  /** Topics / words to avoid. */
  avoid: string;
  defaultCta: string;
}

export interface ScriptHook {
  style: string;
  spoken: string;
  onScreenText: string;
  visual: string;
  rationale: string;
}

export interface ScriptBeat {
  startSec: number;
  endSec: number;
  label: string;
  voiceover: string;
  onScreenText: string;
  visual: string;
  editing: string;
}

export interface FactToVerify {
  claim: string;
  sourceUrl: string | null;
  confidence: "haute" | "moyenne" | "faible";
}

export interface ScriptChecklistItem {
  criterion: string;
  passed: boolean;
  comment: string;
}

/** What Claude returns (validated with zod on the server). */
export interface ScriptDraft {
  title: string;
  /** Exactly 3 hook variants; the first one is used in `beats` and `fullScript`. */
  hooks: ScriptHook[];
  beats: ScriptBeat[];
  /** Teleprompter-ready voice-over, starting with hooks[0].spoken. */
  fullScript: string;
  caption: string;
  hashtags: string[];
  cta: string;
  strengths: string[];
  risks: string[];
  checklist: ScriptChecklistItem[];
  factsToVerify: FactToVerify[];
  sources: RelatedLink[];
}

/** Draft + server-computed metadata. */
export interface GeneratedScript extends ScriptDraft {
  id: string;
  createdAt: string;
  model: string;
  wordCount: number;
  /** Estimated from wordCount and the language's speaking rate. */
  estimatedDurationSec: number;
  /** Research brief produced with web search, when enabled. */
  research?: ResearchBrief;
}

export interface ResearchBrief {
  /** Plain-text bullet points of verified facts (French). */
  facts: string;
  sources: RelatedLink[];
}

export interface ScriptRequest {
  topic: Topic;
  /** Evidence signals of the topic (subset of the analysis signals). */
  signals: Signal[];
  angle: Angle;
  settings: ScriptSettings;
  profile: CreatorProfile;
  /** When refining, the previous version and what to change. */
  refine?: { previous: ScriptDraft; instruction: string };
}

// ---------------------------------------------------------------------------
// Streaming events (Server-Sent Events payloads)
// ---------------------------------------------------------------------------

export type AnalyzeEvent =
  | { type: "source_start"; source: SourceId }
  | { type: "source_done"; summary: SourceRunSummary }
  | { type: "synthesis_start"; signalCount: number; mode: "ai" | "basic" }
  | { type: "result"; analysis: Analysis }
  | { type: "error"; message: string };

export type ScriptEvent =
  | { type: "status"; step: "research" | "writing" | "finalizing"; message: string }
  | { type: "research"; brief: ResearchBrief }
  | { type: "progress"; chars: number }
  | { type: "result"; script: GeneratedScript }
  | { type: "error"; message: string };
