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
  "youtube_rss",
  "youtube",
  "instagram_graph",
  "instagram_apify",
  "tiktok_apify",
  "linkedin_web",
  "linkedin_apify",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const PLATFORMS = [
  "google",
  "news",
  "wikipedia",
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type SignalKind =
  | "search_trend" // a trending search query (Google Trends)
  | "news" // a news article (Google News)
  | "article_views" // a most-read encyclopedia article (Wikipedia pageviews)
  | "short_video" // Reel / TikTok / Short
  | "video" // long-form video
  | "social_post"; // LinkedIn post (text, image, document or video)

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
  "linkedin",
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
  /** Speaking pace: "pose" ≈ 2.2 words/s, "normal" ≈ 2.5, "dynamique" ≈ 2.8. */
  pace: SpeakingPace;
  /** Paid partnership → legal "Publicité / Collaboration commerciale" mention. */
  sponsored: boolean;
  /** Realistic AI-generated visuals → AI label reminder. */
  aiVisuals: boolean;
  /**
   * Second pass: Claude rereads the draft as a demanding editor (rubric,
   * retention, differentiation from competitors) and returns an improved
   * version. Slower, better.
   */
  review: boolean;
}

export const SPEAKING_PACES = ["pose", "normal", "dynamique"] as const;
export type SpeakingPace = (typeof SPEAKING_PACES)[number];

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
  /** Target voice-over word count for the requested duration and pace. */
  wordBudget: number;
  /** Estimated from wordCount and the speaking pace. */
  estimatedDurationSec: number;
  /** Checks computed in code (hashtag caps, hook length, platform rules…), in French. */
  warnings: string[];
  /** Research brief produced with web search, when enabled. */
  research?: ResearchBrief;
  /** What the critical review pass changed (settings.review), in French. */
  reviewNotes?: string[];
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
  /** Competitors to stand out from (saved competitor analyses, max 3). */
  competitors?: CompetitorBrief[];
  /**
   * Country of the analysis (ISO 3166-1 alpha-2) — locale of the web research
   * and of the Google News enrichment. Optional: derived from the language
   * when absent (fr → FR).
   */
  geo?: string;
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
  | { type: "status"; step: "research" | "writing" | "review" | "finalizing"; message: string }
  | { type: "research"; brief: ResearchBrief }
  | { type: "progress"; chars: number }
  | { type: "result"; script: GeneratedScript }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Competitor analysis (creator handle → what works for them, what it means for you)
// ---------------------------------------------------------------------------

export const CREATOR_PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin"] as const;
export type CreatorPlatform = (typeof CREATOR_PLATFORMS)[number];

export interface CreatorAccount {
  platform: CreatorPlatform;
  /** Handle without "@" (LinkedIn: the public profile identifier, e.g. "romainfargeot"). */
  handle: string;
  displayName?: string;
  /** Public profile URL. */
  url: string;
  followers?: number;
  /** Total posts / videos on the account, when the source gives it. */
  totalPosts?: number;
  bio?: string;
  verified?: boolean;
}

export interface CreatorPostMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
}

/** One real post of the analysed creator. */
export interface CreatorPost {
  /** Stable id within the report (platform id or hash of the URL). */
  id: string;
  /** Permalink. */
  url: string;
  /** Video title (YouTube) or first line of the caption. */
  title: string;
  /** Caption / description, plain text, truncated (~1 500 chars). */
  text?: string;
  /** ISO 8601. */
  publishedAt?: string;
  kind: "short_video" | "video" | "social_post";
  durationSec?: number;
  metrics: CreatorPostMetrics;
  /** Lowercase, without "#". */
  hashtags: string[];
  /** Third-party audio used ("Titre – Artiste"), when known. */
  music?: string;
  pinned?: boolean;
  /** Spoken transcript, when the source provides one. */
  transcript?: string;
}

/** Raw, real data collected for a handle. */
export interface CreatorData {
  account: CreatorAccount;
  /** Most recent first. */
  posts: CreatorPost[];
  /** Where the data comes from, in French ("YouTube Data API", "Apify · Instagram Reel Scraper"…). */
  source: string;
  /** ISO 8601. */
  fetchedAt: string;
  /** French notices (partial data, missing metrics, limits). */
  warnings: string[];
  /**
   * False when the source's terms forbid derived metrics on this data
   * (YouTube Data API: no views ÷ subscribers ratio for other channels unless
   * the developer accepted the 2026 "derived metrics" amendment —
   * YT_DERIVED_METRICS_APPROVED=true). Stats then omit reachRate and
   * audienceMultipliers. Undefined = allowed.
   */
  ratiosAllowed?: boolean;
}

export interface StatBucket {
  label: string;
  posts: number;
  /** Median of the ranking metric for the posts of the bucket. */
  median?: number;
}

/** Deterministic statistics computed from CreatorData (no AI). */
export interface CreatorStats {
  postCount: number;
  /** Days between the oldest and the newest analysed post. */
  windowDays: number;
  postsPerWeek: number;
  /** Metric used to rank posts: views when available, otherwise engagement (likes + 3×comments + 5×shares). */
  rankingMetric: "views" | "engagement";
  medianViews?: number;
  medianLikes?: number;
  medianComments?: number;
  /** Median of (likes + comments + shares) / views, in %. */
  engagementRate?: number;
  /** Median views / followers, in %. */
  reachRate?: number;
  /** Posts at ≥ 2× the creator's own median on the ranking metric, best first. */
  outliers: { postId: string; ratio: number }[];
  /**
   * Views ÷ followers per post (when both are known), best first, top 10.
   * A video watched far beyond the account's own audience reached
   * non-followers: the best public proxy of the posts that bring new
   * subscribers (no platform publishes follows per post for other accounts).
   */
  audienceMultipliers?: { postId: string; multiplier: number }[];
  /** Median of (shares + saves) / views, in % — "send / save" signals that platforms reward. */
  shareSaveRate?: number;
  /** Best 5 and worst 3 posts on the ranking metric. */
  topPostIds: string[];
  bottomPostIds: string[];
  /** By weekday / hour of publication (time zone of the market). */
  weekdays: StatBucket[];
  hours: StatBucket[];
  /** "< 30 s", "30–60 s", "1–3 min", "> 3 min" (videos only). */
  durations: StatBucket[];
  /** Most used hashtags with their median performance. */
  hashtags: StatBucket[];
  medianCaptionLength: number;
  /** Share (%) of posts whose caption contains an explicit call to action. */
  ctaShare: number;
  /** Share (%) of posts whose title / first line is a question. */
  questionShare: number;
  /** Share (%) of posts that belong to a series ("partie 2", "épisode", "#3"…). */
  seriesShare: number;
}

export interface PostReference {
  postId: string;
  /** Verbatim extract of the creator's title or caption. */
  quote: string;
}

/** Qualitative analysis by Claude, grounded in the posts (ids are validated). */
export interface CompetitorInsights {
  /** What the creator does, for whom, with which promise. */
  positioning: string;
  audience: string;
  tone: string;
  pillars: { name: string; description: string; share: string; performance: string; postIds: string[] }[];
  formats: { name: string; description: string; postIds: string[] }[];
  hookPatterns: { pattern: string; whyItWorks: string; examples: PostReference[] }[];
  whatWorks: { insight: string; evidence: string; postIds: string[] }[];
  whatFlops: { insight: string; evidence: string; postIds: string[] }[];
  /**
   * What most plausibly converts viewers into subscribers for this creator
   * (series, promise of a follow-up, niche identity, value density, CTA…),
   * grounded in the posts that reached far beyond their audience.
   */
  followDrivers?: { insight: string; evidence: string; postIds: string[] }[];
  ctaAndEngagement: string;
  /** Angles / topics / audiences the creator leaves uncovered. */
  gaps: { opportunity: string; why: string }[];
  /** How the user should stand out, given their own creator profile. */
  differentiation: { recommendation: string; how: string }[];
  /** What must not be copied (content, signature elements, catchphrases). */
  doNotCopy: string[];
  /** Ready-to-script video ideas for the user, inspired by — not copied from — the creator. */
  ideas: {
    title: string;
    angle: string;
    hook: string;
    format: string;
    whyForYou: string;
    inspiredBy: string[];
  }[];
}

export interface CompetitorReport {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  /** "ai": stats + Claude insights; "stats": deterministic part only (Claude unavailable). */
  mode: "ai" | "stats";
  model?: string;
  /** What the user asked to focus on, if anything. */
  focus?: string;
  data: CreatorData;
  stats: CreatorStats;
  insights?: CompetitorInsights;
  /** French notes (limits, fallbacks). */
  notes: string[];
}

export interface CompetitorRequest {
  platform: CreatorPlatform;
  /** Handle, "@handle" or profile URL — normalised by the server. */
  handle: string;
  /** Optional question: "ses hooks", "comment il traite l'actu"… */
  focus?: string;
  /** Posts to analyse (10–50, default 30). */
  maxPosts: number;
  /** The user's own profile, to tailor differentiation advice and ideas. */
  profile: CreatorProfile;
  language: string;
  geo: string;
}

/** Compact differentiation context sent with a script request. */
export interface CompetitorBrief {
  platform: CreatorPlatform;
  handle: string;
  positioning: string;
  pillars: string[];
  hookPatterns: string[];
  /** Angles the competitor already exploits a lot (to avoid repeating). */
  overused: string[];
  /** Openings the competitor leaves (to exploit). */
  gaps: string[];
  /** Recent titles / first lines of the competitor (max 15). */
  recentTitles: string[];
  medianViews?: number;
  /**
   * What most plausibly makes viewers subscribe to the competitor (from
   * CompetitorInsights.followDrivers; hypotheses from public signals, max 10).
   */
  followDrivers?: string[];
}

/** Which platforms the server can analyse, and through what. */
export interface CreatorPlatformStatus {
  platform: CreatorPlatform;
  available: boolean;
  /** French: "YouTube Data API (50 dernières vidéos)", "Apify", "flux RSS public (15 dernières vidéos)"… */
  via: string;
  /** French: what is missing or limited. */
  note: string;
}

export type CompetitorEvent =
  | { type: "status"; step: "fetch" | "stats" | "analysis"; message: string }
  | { type: "data"; data: CreatorData; stats: CreatorStats }
  | { type: "progress"; chars: number }
  | { type: "result"; report: CompetitorReport }
  | { type: "error"; message: string };
