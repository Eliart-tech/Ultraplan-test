/**
 * Browser persistence. Everything stays in this browser:
 * - `trendscript:profile:v1` (localStorage) — the creator profile;
 * - `trendscript:history:v1` (localStorage) — up to 50 scripts + 10 analyses;
 * - `trendscript:competitors:v1` (localStorage) — up to 12 competitor reports,
 *   one per platform + handle (a re-analysis replaces the previous one);
 *   YouTube statistics are erased after 30 days when the source forbids
 *   keeping them (`ratiosAllowed === false`);
 * - `trendscript:viral:v1` (localStorage) — up to 6 "Ce qui cartonne" lab
 *   reports, one per keywords + platforms (a re-run replaces the previous
 *   one); statistics of YouTube videos are erased after 30 days when the
 *   source forbids keeping them (`ratiosAllowed === false`);
 * - `trendscript:studio:v1` (sessionStorage) — the Studio draft, so a refresh
 *   doesn't lose the current analysis;
 * - `trendscript:handoff:v1` (sessionStorage) — a one-shot hand-off to the
 *   Studio ("Écrire ce script" from a competitor or lab idea), read once.
 *
 * Every access is wrapped in try/catch (private mode, disabled storage,
 * quota). React reads go through `useSyncExternalStore` with a server
 * snapshot, so hydration never sees browser data; values are cached and
 * only re-read after our own writes or a `storage` event from another tab.
 */

import { useEffect, useSyncExternalStore } from "react";
import { stripAccents } from "../analysis/text";
import {
  CREATOR_PLATFORMS,
  VIRAL_PLATFORMS,
  type Analysis,
  type Angle,
  type CompetitorReport,
  type CreatorPlatform,
  type CreatorProfile,
  type GeneratedScript,
  type ScriptPlatform,
  type ScriptSettings,
  type Signal,
  type Topic,
  type ViralPlatform,
  type ViralPost,
  type ViralReport,
} from "../types";

export const STORAGE_KEYS = {
  profile: "trendscript:profile:v1",
  history: "trendscript:history:v1",
  competitors: "trendscript:competitors:v1",
  viral: "trendscript:viral:v1",
  studio: "trendscript:studio:v1",
  handoff: "trendscript:handoff:v1",
} as const;

export const MAX_SAVED_SCRIPTS = 50;
export const MAX_SAVED_ANALYSES = 10;
export const MAX_SAVED_COMPETITORS = 12;
export const MAX_SAVED_VIRAL = 6;
/** Captions / transcripts are cut to this length in storage (the report keeps its meaning, the quota breathes). */
export const STORED_POST_TEXT_MAX = 1000;
/** A Studio hand-off older than this is ignored (the user moved on). */
export const HANDOFF_TTL_MS = 30 * 60_000;
/** YouTube developer policies: no storage of a channel's statistics beyond 30 days. */
export const YOUTUBE_RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Note added to a report whose YouTube statistics were erased after 30 days. */
export const RETENTION_NOTE =
  "Statistiques YouTube effacées de ce navigateur après 30 jours (règles développeurs de YouTube) : relancez l'analyse pour des chiffres à jour.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A generated script with everything needed to display, export or refine it. */
export interface SavedScript {
  /** Same as `script.id`. */
  id: string;
  /** ISO 8601 — when it was saved (re-saving a refined version updates it). */
  savedAt: string;
  script: GeneratedScript;
  topic: Topic;
  angle: Angle;
  settings: ScriptSettings;
  /** Evidence signals of the topic (what the script was generated from). */
  signals: Signal[];
  /** Analysis the topic came from, when it is still in the history. */
  analysisId?: string;
  /** Country of the analysis (ISO 3166-1 alpha-2). */
  geo?: string;
}

export interface HistoryData {
  /** Newest first. */
  scripts: SavedScript[];
  /** Newest first; signals trimmed to the ones topics reference. */
  analyses: Analysis[];
}

export interface SaveResult {
  ok: boolean;
  /** Entries dropped (oldest first) to fit in the storage quota. */
  evicted: number;
}

export const EMPTY_PROFILE: CreatorProfile = Object.freeze({
  name: "",
  niche: "",
  audience: "",
  positioning: "",
  voice: "",
  avoid: "",
  defaultCta: "",
}) as CreatorProfile;

const EMPTY_HISTORY: HistoryData = Object.freeze({ scripts: [], analyses: [] }) as unknown as HistoryData;
const EMPTY_COMPETITORS: CompetitorReport[] = Object.freeze([]) as unknown as CompetitorReport[];
const EMPTY_VIRAL: ViralReport[] = Object.freeze([]) as unknown as ViralReport[];

// ---------------------------------------------------------------------------
// Low-level access
// ---------------------------------------------------------------------------

type StorageKind = "local" | "session";

function getStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // SecurityError when storage is disabled.
    return null;
  }
}

function readRaw(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readJson(kind: StorageKind, key: string): unknown {
  const raw = readRaw(kind, key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(kind: StorageKind, key: string, value: unknown): boolean {
  const storage = getStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(kind: StorageKind, key: string): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    // ignore
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Tiny external store (one per key) for useSyncExternalStore
// ---------------------------------------------------------------------------

interface Store<T> {
  get(): T;
  /** Drop the cache and notify (after a write or a cross-tab change). */
  invalidate(): void;
  subscribe(listener: () => void): () => void;
}

function createStore<T>(key: string, read: () => T): Store<T> {
  let cache: { value: T } | undefined;
  const listeners = new Set<() => void>();

  function onStorage(event: StorageEvent) {
    // key === null means storage.clear() in another tab.
    if (event.key === key || event.key === null) store.invalidate();
  }

  const store: Store<T> = {
    get() {
      if (!cache) cache = { value: read() };
      return cache.value;
    },
    invalidate() {
      cache = undefined;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
  return store;
}

const subscribeNothing = () => () => {};

/**
 * False during the server render and hydration, true afterwards. Use it to
 * avoid flashing an empty state before browser data is read, or to mount a
 * subtree whose initial state comes from storage (e.g. the Studio reducer).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Keeps only known string fields; anything else falls back to "". */
export function sanitizeProfile(value: unknown): CreatorProfile {
  if (!isRecord(value)) return EMPTY_PROFILE;
  const profile = { ...EMPTY_PROFILE };
  for (const field of Object.keys(EMPTY_PROFILE) as (keyof CreatorProfile)[]) {
    const candidate = value[field];
    if (typeof candidate === "string") profile[field] = candidate;
  }
  return profile;
}

const profileStore = createStore(STORAGE_KEYS.profile, () =>
  sanitizeProfile(readJson("local", STORAGE_KEYS.profile)),
);

/** Current profile (EMPTY_PROFILE when nothing is saved). */
export function getProfile(): CreatorProfile {
  return profileStore.get();
}

/** Saves the profile; false when the browser refused (private mode, quota). */
export function saveProfile(profile: CreatorProfile): boolean {
  const ok = writeJson("local", STORAGE_KEYS.profile, sanitizeProfile(profile));
  profileStore.invalidate();
  return ok;
}

/** True when at least one profile field is filled. */
export function isProfileFilled(profile: CreatorProfile): boolean {
  return Object.values(profile).some((value) => value.trim() !== "");
}

/**
 * The saved creator profile, live (updates after `saveProfile` and from
 * other tabs). `hydrated` is false until browser data has been read.
 */
export function useProfile(): { profile: CreatorProfile; hydrated: boolean; saveProfile: typeof saveProfile } {
  const profile = useSyncExternalStore(profileStore.subscribe, profileStore.get, () => EMPTY_PROFILE);
  const hydrated = useHydrated();
  return { profile, hydrated, saveProfile };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function isSavedScript(value: unknown): value is SavedScript {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.savedAt === "string" &&
    isRecord(value.script) &&
    Array.isArray(value.script.beats) &&
    Array.isArray(value.script.hooks) &&
    isRecord(value.topic) &&
    isRecord(value.angle) &&
    isRecord(value.settings)
  );
}

function isAnalysis(value: unknown): value is Analysis {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.topics) &&
    Array.isArray(value.signals) &&
    Array.isArray(value.sources) &&
    isRecord(value.request)
  );
}

/** Drops malformed entries (older versions, manual edits) instead of failing. */
export function sanitizeHistory(value: unknown): HistoryData {
  if (!isRecord(value)) return EMPTY_HISTORY;
  const scripts = Array.isArray(value.scripts)
    ? value.scripts.filter(isSavedScript).map((entry) => ({ ...entry, signals: Array.isArray(entry.signals) ? entry.signals : [] }))
    : [];
  const analyses = Array.isArray(value.analyses) ? value.analyses.filter(isAnalysis) : [];
  if (scripts.length === 0 && analyses.length === 0) return EMPTY_HISTORY;
  return { scripts: scripts.slice(0, MAX_SAVED_SCRIPTS), analyses: analyses.slice(0, MAX_SAVED_ANALYSES) };
}

/** Analysis without the signals no topic references (keeps storage small). */
export function trimAnalysis(analysis: Analysis): Analysis {
  const referenced = new Set(analysis.topics.flatMap((topic) => topic.signalIds));
  return { ...analysis, signals: analysis.signals.filter((signal) => referenced.has(signal.id)) };
}

const historyStore = createStore(STORAGE_KEYS.history, () =>
  sanitizeHistory(readJson("local", STORAGE_KEYS.history)),
);

/** Current history (newest first). */
export function getHistory(): HistoryData {
  return historyStore.get();
}

/** Mutations start from storage, not the cache, so another tab's changes survive. */
function freshHistory(): HistoryData {
  return sanitizeHistory(readJson("local", STORAGE_KEYS.history));
}

/**
 * Writes the history; when the quota is exceeded, drops the oldest analysis
 * (then the oldest script) until it fits.
 */
function writeHistory(data: HistoryData): SaveResult {
  const scripts = [...data.scripts];
  const analyses = [...data.analyses];
  let evicted = 0;
  for (;;) {
    if (writeJson("local", STORAGE_KEYS.history, { version: 1, scripts, analyses })) {
      historyStore.invalidate();
      return { ok: true, evicted };
    }
    if (!getStorage("local")) break;
    if (analyses.length > 0) analyses.pop();
    else if (scripts.length > 1) scripts.pop();
    else break;
    evicted++;
  }
  historyStore.invalidate();
  return { ok: false, evicted };
}

/** Adds (or replaces, by id) a script at the top of the history. */
export function saveScriptToHistory(entry: SavedScript): SaveResult {
  const current = freshHistory();
  const scripts = [entry, ...current.scripts.filter((item) => item.id !== entry.id)].slice(0, MAX_SAVED_SCRIPTS);
  return writeHistory({ scripts, analyses: current.analyses });
}

/** Adds (or replaces, by id) an analysis at the top, trimmed with `trimAnalysis`. */
export function saveAnalysisToHistory(analysis: Analysis): SaveResult {
  const current = freshHistory();
  const analyses = [trimAnalysis(analysis), ...current.analyses.filter((item) => item.id !== analysis.id)].slice(
    0,
    MAX_SAVED_ANALYSES,
  );
  return writeHistory({ scripts: current.scripts, analyses });
}

export function removeScriptFromHistory(id: string): SaveResult {
  const current = freshHistory();
  return writeHistory({ scripts: current.scripts.filter((item) => item.id !== id), analyses: current.analyses });
}

export function removeAnalysisFromHistory(id: string): SaveResult {
  const current = freshHistory();
  return writeHistory({ scripts: current.scripts, analyses: current.analyses.filter((item) => item.id !== id) });
}

/** Deletes every saved script and analysis. */
export function clearHistory(): void {
  removeKey("local", STORAGE_KEYS.history);
  historyStore.invalidate();
}

/** Pretty JSON of the whole history, for "Exporter tout (.json)". */
export function exportHistoryJson(data: HistoryData = getHistory()): string {
  return JSON.stringify({ app: "TrendScript", version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

/**
 * Saved scripts and analyses, live. `hydrated` is false during the server
 * render and hydration (lists are empty then — don't show the empty state yet).
 */
export function useHistory(): HistoryData & { hydrated: boolean } {
  const data = useSyncExternalStore(historyStore.subscribe, historyStore.get, () => EMPTY_HISTORY);
  const hydrated = useHydrated();
  return { scripts: data.scripts, analyses: data.analyses, hydrated };
}

// ---------------------------------------------------------------------------
// Studio draft (sessionStorage)
// ---------------------------------------------------------------------------

interface DraftEnvelope {
  version: 1;
  savedAt: string;
  data: unknown;
}

/**
 * Reads the Studio draft. Pass a type guard to validate the shape; returns
 * null when absent, unreadable or rejected by the guard. Call it from an
 * event handler, an effect or a lazy initializer that only runs on the
 * client (e.g. `useReducer(reducer, null, init)` in a subtree mounted once
 * `useHydrated()` is true).
 */
export function loadStudioDraft<T>(isValid?: (value: unknown) => value is T): T | null {
  const envelope = readJson("session", STORAGE_KEYS.studio);
  if (!isRecord(envelope) || envelope.version !== 1 || !("data" in envelope)) return null;
  const data = (envelope as unknown as DraftEnvelope).data;
  if (isValid && !isValid(data)) return null;
  return data as T;
}

/** Saves the Studio draft; false when sessionStorage refused it (quota…). */
export function saveStudioDraft(data: unknown): boolean {
  const envelope: DraftEnvelope = { version: 1, savedAt: new Date().toISOString(), data };
  return writeJson("session", STORAGE_KEYS.studio, envelope);
}

export function clearStudioDraft(): void {
  removeKey("session", STORAGE_KEYS.studio);
}

// ---------------------------------------------------------------------------
// Competitor reports (localStorage)
// ---------------------------------------------------------------------------

/** "tiktok:squeezie" — one saved report per platform + handle (case-insensitive, without "@"). */
export function competitorKey(platform: CreatorPlatform, handle: string): string {
  return `${platform}:${handle.trim().replace(/^@+/, "").toLowerCase()}`;
}

/** Key of a report's account (see `competitorKey`). */
export function reportKey(report: CompetitorReport): string {
  return competitorKey(report.data.account.platform, report.data.account.handle);
}

function isCompetitorReport(value: unknown): value is CompetitorReport {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string") return false;
  if (value.mode !== "ai" && value.mode !== "stats") return false;
  const { data, stats } = value;
  if (!isRecord(data) || !isRecord(data.account) || !Array.isArray(data.posts) || !Array.isArray(data.warnings)) return false;
  const { account } = data;
  if (typeof account.handle !== "string" || !account.handle) return false;
  if (!(CREATOR_PLATFORMS as readonly unknown[]).includes(account.platform)) return false;
  if (!data.posts.every((post) => isRecord(post) && typeof post.id === "string" && isRecord(post.metrics))) return false;
  return (
    isRecord(stats) &&
    typeof stats.postCount === "number" &&
    Array.isArray(stats.outliers) &&
    Array.isArray(stats.weekdays) &&
    Array.isArray(stats.hours) &&
    Array.isArray(stats.durations) &&
    Array.isArray(stats.hashtags) &&
    Array.isArray(value.notes) &&
    (value.insights === undefined || isRecord(value.insights))
  );
}

/**
 * Valid reports, newest first, one per platform + handle (the first — newest —
 * wins), capped at MAX_SAVED_COMPETITORS. Accepts the stored envelope
 * `{ version, reports }` or a bare array.
 */
export function sanitizeCompetitors(value: unknown): CompetitorReport[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.reports) ? value.reports : null;
  if (!list) return EMPTY_COMPETITORS;
  const seen = new Set<string>();
  const reports: CompetitorReport[] = [];
  for (const entry of list) {
    if (!isCompetitorReport(entry)) continue;
    const key = reportKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(entry);
    if (reports.length >= MAX_SAVED_COMPETITORS) break;
  }
  return reports.length > 0 ? reports : EMPTY_COMPETITORS;
}

/** Report with long captions / transcripts shortened for storage. */
export function trimCompetitorReport(report: CompetitorReport): CompetitorReport {
  const cut = (text: string | undefined) =>
    text && text.length > STORED_POST_TEXT_MAX ? `${text.slice(0, STORED_POST_TEXT_MAX - 1)}…` : text;
  return {
    ...report,
    data: {
      ...report.data,
      posts: report.data.posts.map((post) => {
        const next = { ...post };
        if (post.text !== undefined) next.text = cut(post.text);
        if (post.transcript !== undefined) next.transcript = cut(post.transcript);
        return next;
      }),
    },
  };
}

/**
 * True for a YouTube report whose statistics must not be kept any more: the
 * source forbids derived metrics (`ratiosAllowed === false`, YouTube Data API
 * terms) and the data is older than 30 days.
 */
export function isRetentionExpired(report: CompetitorReport, now: number): boolean {
  if (report.data.account.platform !== "youtube" || report.data.ratiosAllowed !== false) return false;
  const fetched = Date.parse(report.data.fetchedAt);
  const time = Number.isFinite(fetched) ? fetched : Date.parse(report.createdAt);
  return Number.isFinite(time) && now - time > YOUTUBE_RETENTION_MS;
}

/** True once `stripReportMetrics` has been applied. */
export function isMetricsStripped(report: CompetitorReport): boolean {
  return report.notes.includes(RETENTION_NOTE);
}

const withoutMedian = (bucket: CompetitorReport["stats"]["weekdays"][number]) => ({ label: bucket.label, posts: bucket.posts });

/**
 * The report without any audience statistic (views, likes, comments,
 * followers, medians, outliers…): what stays is the account, the posts'
 * titles and links, and Claude's text. Idempotent.
 */
export function stripReportMetrics(report: CompetitorReport): CompetitorReport {
  if (isMetricsStripped(report)) return report;
  const { account } = report.data;
  const { stats } = report;
  return {
    ...report,
    data: {
      ...report.data,
      account: {
        platform: account.platform,
        handle: account.handle,
        url: account.url,
        ...(account.displayName !== undefined ? { displayName: account.displayName } : {}),
        ...(account.bio !== undefined ? { bio: account.bio } : {}),
        ...(account.verified !== undefined ? { verified: account.verified } : {}),
      },
      posts: report.data.posts.map((post) => ({ ...post, metrics: {} })),
    },
    stats: {
      postCount: stats.postCount,
      windowDays: stats.windowDays,
      postsPerWeek: stats.postsPerWeek,
      rankingMetric: stats.rankingMetric,
      outliers: [],
      topPostIds: [],
      bottomPostIds: [],
      weekdays: stats.weekdays.map(withoutMedian),
      hours: stats.hours.map(withoutMedian),
      durations: stats.durations.map(withoutMedian),
      hashtags: stats.hashtags.map(withoutMedian),
      medianCaptionLength: stats.medianCaptionLength,
      ctaShare: stats.ctaShare,
      questionShare: stats.questionShare,
      seriesShare: stats.seriesShare,
    },
    notes: [RETENTION_NOTE, ...report.notes],
  };
}

/** Reports with the expired YouTube statistics stripped (see `isRetentionExpired`). */
export function applyRetention(reports: CompetitorReport[], now: number): CompetitorReport[] {
  if (!reports.some((report) => isRetentionExpired(report, now) && !isMetricsStripped(report))) return reports;
  return reports.map((report) =>
    isRetentionExpired(report, now) && !isMetricsStripped(report) ? stripReportMetrics(report) : report,
  );
}

const competitorsStore = createStore(STORAGE_KEYS.competitors, () =>
  applyRetention(sanitizeCompetitors(readJson("local", STORAGE_KEYS.competitors)), Date.now()),
);

/** Saved competitor reports, newest first. */
export function getCompetitors(): CompetitorReport[] {
  return competitorsStore.get();
}

/** The saved report of an account (`competitorKey`), if any. */
export function findCompetitor(key: string): CompetitorReport | undefined {
  return getCompetitors().find((report) => reportKey(report) === key);
}

/** Writes the list; when the quota is exceeded, drops the oldest reports until it fits (the first one is kept). */
function writeCompetitors(reports: CompetitorReport[]): SaveResult {
  const list = [...reports];
  let evicted = 0;
  for (;;) {
    if (writeJson("local", STORAGE_KEYS.competitors, { version: 1, reports: list })) {
      competitorsStore.invalidate();
      return { ok: true, evicted };
    }
    if (!getStorage("local") || list.length <= 1) break;
    list.pop();
    evicted++;
  }
  competitorsStore.invalidate();
  return { ok: false, evicted };
}

/**
 * Saves a report at the top of the list, replacing the previous report of the
 * same platform + handle. Captions are trimmed (`trimCompetitorReport`).
 */
export function saveCompetitorReport(report: CompetitorReport): SaveResult {
  const key = reportKey(report);
  const current = sanitizeCompetitors(readJson("local", STORAGE_KEYS.competitors));
  const reports = [trimCompetitorReport(report), ...current.filter((item) => reportKey(item) !== key)].slice(
    0,
    MAX_SAVED_COMPETITORS,
  );
  return writeCompetitors(reports);
}

/** Removes the saved report of an account (`competitorKey`). */
export function removeCompetitorReport(key: string): SaveResult {
  const current = sanitizeCompetitors(readJson("local", STORAGE_KEYS.competitors));
  return writeCompetitors(current.filter((item) => reportKey(item) !== key));
}

/**
 * Rewrites storage without the expired YouTube statistics (30-day rule).
 * Returns how many reports were stripped. Called from an effect of
 * `useCompetitors`, never during render.
 */
export function purgeExpiredCompetitors(now: number = Date.now()): number {
  const current = sanitizeCompetitors(readJson("local", STORAGE_KEYS.competitors));
  const next = applyRetention(current, now);
  if (next === current) return 0;
  const stripped = next.filter((report, index) => report !== current[index]).length;
  writeCompetitors(next);
  return stripped;
}

/** Deletes every saved competitor report. */
export function clearCompetitors(): void {
  removeKey("local", STORAGE_KEYS.competitors);
  competitorsStore.invalidate();
}

/**
 * Saved competitor reports, live (updates after saves, deletions and from
 * other tabs). `hydrated` is false during the server render and hydration.
 */
export function useCompetitors(): { reports: CompetitorReport[]; hydrated: boolean } {
  const reports = useSyncExternalStore(competitorsStore.subscribe, competitorsStore.get, () => EMPTY_COMPETITORS);
  const hydrated = useHydrated();
  // Reads already hide expired YouTube statistics; this erases them from storage too.
  useEffect(() => {
    purgeExpiredCompetitors();
  }, []);
  return { reports, hydrated };
}

// ---------------------------------------------------------------------------
// "Ce qui cartonne" lab reports (localStorage)
// ---------------------------------------------------------------------------

/** Note added to a lab report whose YouTube statistics were erased after 30 days. */
export const VIRAL_RETENTION_NOTE =
  "Statistiques des vidéos YouTube effacées de ce navigateur après 30 jours (règles développeurs de YouTube) : relancez l'analyse pour des chiffres à jour.";

const normalizeKeyword = (keyword: string) =>
  stripAccents(keyword).replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * "instagram+tiktok:budget|epargne" — one saved lab report per set of
 * platforms and keywords (order, case, accents and "#" ignored).
 */
export function viralKey(keywords: readonly string[], platforms: readonly ViralPlatform[]): string {
  const words = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))].sort();
  const sources = [...new Set(platforms)].sort();
  return `${sources.join("+")}:${words.join("|")}`;
}

/** Key of a lab report (see `viralKey`). */
export function viralReportKey(report: ViralReport): string {
  return viralKey(report.request.keywords, report.request.platforms);
}

const isViralPlatform = (value: unknown): value is ViralPlatform =>
  (VIRAL_PLATFORMS as readonly unknown[]).includes(value);

function isViralPost(value: unknown): value is ViralPost {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    isViralPlatform(value.platform) &&
    isRecord(value.metrics) &&
    isRecord(value.author) &&
    typeof value.author.handle === "string" &&
    typeof value.tier === "string" &&
    Array.isArray(value.hashtags)
  );
}

function isViralReport(value: unknown): value is ViralReport {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string") return false;
  if (value.mode !== "ai" && value.mode !== "stats") return false;
  const { request } = value;
  if (!isRecord(request) || !Array.isArray(request.keywords) || !Array.isArray(request.platforms)) return false;
  if (!request.keywords.every((keyword) => typeof keyword === "string")) return false;
  if (!request.platforms.every(isViralPlatform)) return false;
  return (
    Array.isArray(value.posts) &&
    value.posts.every(isViralPost) &&
    Array.isArray(value.platforms) &&
    value.platforms.every((summary) => isRecord(summary) && isViralPlatform(summary.platform)) &&
    Array.isArray(value.notes) &&
    (value.patterns === undefined || isRecord(value.patterns))
  );
}

/**
 * Valid lab reports, newest first, one per keywords + platforms (the first —
 * newest — wins), capped at MAX_SAVED_VIRAL. Accepts the stored envelope
 * `{ version, reports }` or a bare array.
 */
export function sanitizeViralReports(value: unknown): ViralReport[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.reports) ? value.reports : null;
  if (!list) return EMPTY_VIRAL;
  const seen = new Set<string>();
  const reports: ViralReport[] = [];
  for (const entry of list) {
    if (!isViralReport(entry)) continue;
    const key = viralReportKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(entry);
    if (reports.length >= MAX_SAVED_VIRAL) break;
  }
  return reports.length > 0 ? reports : EMPTY_VIRAL;
}

/** Lab report with long captions / transcripts shortened for storage. */
export function trimViralReport(report: ViralReport): ViralReport {
  const cut = (text: string | undefined) =>
    text && text.length > STORED_POST_TEXT_MAX ? `${text.slice(0, STORED_POST_TEXT_MAX - 1)}…` : text;
  return {
    ...report,
    posts: report.posts.map((post) => {
      const next = { ...post };
      if (post.text !== undefined) next.text = cut(post.text);
      if (post.transcript !== undefined) next.transcript = cut(post.transcript);
      return next;
    }),
  };
}

/** YouTube statistics in this report come from the Data API without the derived-metrics amendment. */
function hasRestrictedYoutube(report: ViralReport): boolean {
  const summary = report.platforms.find((item) => item.platform === "youtube");
  if (summary) return summary.ratiosAllowed === false;
  return false;
}

/**
 * True for a lab report holding YouTube statistics that must not be kept any
 * more: the source forbids derived metrics (`ratiosAllowed === false` on the
 * YouTube summary) and the report is older than 30 days.
 */
export function isViralRetentionExpired(report: ViralReport, now: number): boolean {
  if (!hasRestrictedYoutube(report) || !report.posts.some((post) => post.platform === "youtube")) return false;
  const time = Date.parse(report.createdAt);
  return Number.isFinite(time) && now - time > YOUTUBE_RETENTION_MS;
}

/** True once `stripViralYoutubeMetrics` has been applied. */
export function isViralMetricsStripped(report: ViralReport): boolean {
  return report.notes.includes(VIRAL_RETENTION_NOTE);
}

/**
 * The report without any YouTube audience statistic (views, likes, comments,
 * subscribers, velocity, ranking): YouTube videos keep their title, link and
 * author; the other platforms are untouched. Idempotent.
 */
export function stripViralYoutubeMetrics(report: ViralReport): ViralReport {
  if (isViralMetricsStripped(report)) return report;
  return {
    ...report,
    posts: report.posts.map((post): ViralPost => {
      if (post.platform !== "youtube") return post;
      const { author } = post;
      return {
        id: post.id,
        url: post.url,
        title: post.title,
        ...(post.text !== undefined ? { text: post.text } : {}),
        ...(post.publishedAt !== undefined ? { publishedAt: post.publishedAt } : {}),
        kind: post.kind,
        ...(post.durationSec !== undefined ? { durationSec: post.durationSec } : {}),
        metrics: {},
        hashtags: post.hashtags,
        platform: post.platform,
        author: {
          handle: author.handle,
          ...(author.displayName !== undefined ? { displayName: author.displayName } : {}),
          ...(author.url !== undefined ? { url: author.url } : {}),
        },
        ...(post.query !== undefined ? { query: post.query } : {}),
        tier: "normal",
      };
    }),
    platforms: report.platforms.map((summary) => {
      if (summary.platform !== "youtube") return summary;
      const next = { ...summary };
      delete next.medianViews;
      delete next.medianMultiplier;
      return next;
    }),
    notes: [VIRAL_RETENTION_NOTE, ...report.notes],
  };
}

/** Reports with the expired YouTube statistics stripped (see `isViralRetentionExpired`). */
export function applyViralRetention(reports: ViralReport[], now: number): ViralReport[] {
  if (!reports.some((report) => isViralRetentionExpired(report, now) && !isViralMetricsStripped(report))) return reports;
  return reports.map((report) =>
    isViralRetentionExpired(report, now) && !isViralMetricsStripped(report) ? stripViralYoutubeMetrics(report) : report,
  );
}

const viralStore = createStore(STORAGE_KEYS.viral, () =>
  applyViralRetention(sanitizeViralReports(readJson("local", STORAGE_KEYS.viral)), Date.now()),
);

/** Saved lab reports, newest first. */
export function getViralReports(): ViralReport[] {
  return viralStore.get();
}

/** The saved lab report with this key (`viralReportKey`), if any. */
export function findViralReport(key: string): ViralReport | undefined {
  return getViralReports().find((report) => viralReportKey(report) === key);
}

/** Writes the list; when the quota is exceeded, drops the oldest reports until it fits (the first one is kept). */
function writeViralReports(reports: ViralReport[]): SaveResult {
  const list = [...reports];
  let evicted = 0;
  for (;;) {
    if (writeJson("local", STORAGE_KEYS.viral, { version: 1, reports: list })) {
      viralStore.invalidate();
      return { ok: true, evicted };
    }
    if (!getStorage("local") || list.length <= 1) break;
    list.pop();
    evicted++;
  }
  viralStore.invalidate();
  return { ok: false, evicted };
}

/**
 * Saves a lab report at the top of the list, replacing the previous report
 * with the same keywords + platforms. Captions are trimmed (`trimViralReport`).
 */
export function saveViralReport(report: ViralReport): SaveResult {
  const key = viralReportKey(report);
  const current = sanitizeViralReports(readJson("local", STORAGE_KEYS.viral));
  const reports = [trimViralReport(report), ...current.filter((item) => viralReportKey(item) !== key)].slice(
    0,
    MAX_SAVED_VIRAL,
  );
  return writeViralReports(reports);
}

/** Removes the saved lab report with this key (`viralReportKey`). */
export function removeViralReport(key: string): SaveResult {
  const current = sanitizeViralReports(readJson("local", STORAGE_KEYS.viral));
  return writeViralReports(current.filter((item) => viralReportKey(item) !== key));
}

/**
 * Rewrites storage without the expired YouTube statistics (30-day rule).
 * Returns how many reports were stripped. Called from an effect of
 * `useViralReports`, never during render.
 */
export function purgeExpiredViralReports(now: number = Date.now()): number {
  const current = sanitizeViralReports(readJson("local", STORAGE_KEYS.viral));
  const next = applyViralRetention(current, now);
  if (next === current) return 0;
  const stripped = next.filter((report, index) => report !== current[index]).length;
  writeViralReports(next);
  return stripped;
}

/** Deletes every saved lab report. */
export function clearViralReports(): void {
  removeKey("local", STORAGE_KEYS.viral);
  viralStore.invalidate();
}

/**
 * Saved lab reports, live (updates after saves, deletions and from other
 * tabs). `hydrated` is false during the server render and hydration.
 */
export function useViralReports(): { reports: ViralReport[]; hydrated: boolean } {
  const reports = useSyncExternalStore(viralStore.subscribe, viralStore.get, () => EMPTY_VIRAL);
  const hydrated = useHydrated();
  // Reads already hide expired YouTube statistics; this erases them from storage too.
  useEffect(() => {
    purgeExpiredViralReports();
  }, []);
  return { reports, hydrated };
}

// ---------------------------------------------------------------------------
// Studio hand-off (sessionStorage, read once by the Studio)
// ---------------------------------------------------------------------------

/** What "Écrire ce script" hands to the Studio: a real topic, its evidence and an angle. */
export interface PendingStudioHandoff {
  version: 1;
  /** ISO 8601 — hand-offs older than HANDOFF_TTL_MS are ignored. */
  createdAt: string;
  topic: Topic;
  signals: Signal[];
  angle: Angle;
  /** Competitor the idea comes from (`competitorKey`), pre-selected in "Se différencier de". */
  competitorKey?: string;
  /** Lab report the idea comes from (`viralReportKey`), pre-selected in "S'appuyer sur ce qui cartonne". */
  viralKey?: string;
  /** Script platform to preselect (the competitor's platform). */
  scriptPlatform?: ScriptPlatform;
  /** "@handle" (or the lab's niche) shown in the Studio notice. */
  label?: string;
}

function isHandoff(value: unknown): value is PendingStudioHandoff {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.createdAt === "string" &&
    isRecord(value.topic) &&
    typeof value.topic.id === "string" &&
    typeof value.topic.title === "string" &&
    Array.isArray(value.topic.signalIds) &&
    Array.isArray(value.signals) &&
    isRecord(value.angle) &&
    typeof value.angle.id === "string" &&
    typeof value.angle.title === "string"
  );
}

/** Stores the hand-off for the next Studio mount; false when sessionStorage refused it. */
export function saveStudioHandoff(
  handoff: Omit<PendingStudioHandoff, "version" | "createdAt">,
  now: number = Date.now(),
): boolean {
  const envelope: PendingStudioHandoff = { version: 1, createdAt: new Date(now).toISOString(), ...handoff };
  return writeJson("session", STORAGE_KEYS.handoff, envelope);
}

/**
 * The pending hand-off, without consuming it (React may call initializers
 * twice): null when absent, malformed or older than HANDOFF_TTL_MS. Clear it
 * with `clearStudioHandoff` once applied.
 */
export function peekStudioHandoff(now: number = Date.now()): PendingStudioHandoff | null {
  const value = readJson("session", STORAGE_KEYS.handoff);
  if (!isHandoff(value)) return null;
  const age = now - Date.parse(value.createdAt);
  if (!Number.isFinite(age) || age > HANDOFF_TTL_MS || age < -60_000) return null;
  return value;
}

export function clearStudioHandoff(): void {
  removeKey("session", STORAGE_KEYS.handoff);
}
