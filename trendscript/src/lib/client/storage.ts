/**
 * Browser persistence. Everything stays in this browser:
 * - `trendscript:profile:v1` (localStorage) — the creator profile;
 * - `trendscript:history:v1` (localStorage) — up to 50 scripts + 10 analyses;
 * - `trendscript:studio:v1` (sessionStorage) — the Studio draft, so a refresh
 *   doesn't lose the current analysis.
 *
 * Every access is wrapped in try/catch (private mode, disabled storage,
 * quota). React reads go through `useSyncExternalStore` with a server
 * snapshot, so hydration never sees browser data; values are cached and
 * only re-read after our own writes or a `storage` event from another tab.
 */

import { useSyncExternalStore } from "react";
import type {
  Analysis,
  Angle,
  CreatorProfile,
  GeneratedScript,
  ScriptSettings,
  Signal,
  Topic,
} from "../types";

export const STORAGE_KEYS = {
  profile: "trendscript:profile:v1",
  history: "trendscript:history:v1",
  studio: "trendscript:studio:v1",
} as const;

export const MAX_SAVED_SCRIPTS = 50;
export const MAX_SAVED_ANALYSES = 10;

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
