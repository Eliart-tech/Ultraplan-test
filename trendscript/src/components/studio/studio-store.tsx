"use client";

/**
 * Studio state: one reducer + context for the 4-step wizard
 * (Radar → Sujets → Angle → Script).
 *
 * - `draft` is the durable part (form, analysis, chosen topic/angle,
 *   settings, last script). It is persisted to sessionStorage (debounced, and
 *   flushed on page hide/unmount) so a refresh keeps the work in progress.
 * - `analysisRun` / `scriptRun` describe the request in flight; they are not
 *   persisted (a stream cannot survive a reload).
 *
 * The provider must be mounted on the client only (after `useHydrated()`),
 * because its initial state is read from browser storage in the reducer
 * initializer — never in an effect.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { errorMessage, isAbortError, streamAnalyze, streamScript } from "@/lib/client/api";
import {
  clearStudioHandoff,
  getHistory,
  loadStudioDraft,
  peekStudioHandoff,
  saveAnalysisToHistory,
  saveScriptToHistory,
  saveStudioDraft,
  trimAnalysis,
  type PendingStudioHandoff,
  type SavedScript,
  type SaveResult,
} from "@/lib/client/storage";
import { scriptSettingsSchema } from "@/lib/schemas";
import type {
  Analysis,
  AnalyzeEvent,
  AnalyzeRequest,
  Angle,
  GeneratedScript,
  Platform,
  ResearchBrief,
  ScriptEvent,
  ScriptRequest,
  ScriptSettings,
  Signal,
  SourceId,
  SourceRunSummary,
  Topic,
} from "@/lib/types";
import { PLATFORMS, SOURCE_IDS } from "@/lib/types";
import {
  DEFAULT_TOPICS,
  MAX_KEYWORDS,
  MAX_TOPICS,
  MIN_TOPICS,
  SOURCE_FALLBACK,
  defaultScriptSettings,
  type TopicSort,
} from "./studio-options";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const STUDIO_STEPS = ["radar", "sujets", "angle", "script"] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export interface RadarForm {
  geo: string;
  language: string;
  niche: string;
  keywords: string[];
  /** Explicit source choice; null = "free configured sources" (resolved once /api/sources answers). */
  sources: SourceId[] | null;
  maxTopics: number;
}

export interface TopicFilters {
  platforms: Platform[];
  hideSensitive: boolean;
  sort: TopicSort;
}

export interface CustomAngleDraft {
  title: string;
  pitch: string;
}

export interface ScriptResultState {
  /** As generated (hooks[0] in use); the chosen hook is applied at render with `applyHook`. */
  script: GeneratedScript;
  hookIndex: number;
  /** Effective settings the script was generated with (target duration, platform…). */
  settings: ScriptSettings;
}

/** Durable part of the Studio, persisted in sessionStorage. */
export interface StudioDraft {
  step: StudioStep;
  form: RadarForm;
  analysis: Analysis | null;
  filters: TopicFilters;
  /** Chosen topic (a copy: the script step works even without its analysis). */
  topic: Topic | null;
  /** Evidence signals of the chosen topic, sent with every script request. */
  evidence: Signal[];
  /** Country of the topic's analysis (locale of the web research). */
  geo: string | null;
  /** Selected radio on the Angle step: an angle id or "custom". */
  angleChoice: string | null;
  customAngle: CustomAngleDraft;
  /** Angle the script is written with (committed when leaving step 3). */
  angle: Angle | null;
  settings: ScriptSettings;
  result: ScriptResultState | null;
  /**
   * "Se différencier de": keys (`competitorKey`) of the saved competitors
   * sent with script requests (max 3). null/absent = automatic (the saved
   * competitors of the script's platform).
   */
  competitorKeys?: string[] | null;
  /**
   * "S'appuyer sur ce qui cartonne": key (`viralReportKey`) of the lab report
   * sent with script requests as `nicheRecipes`, or "none" (VIRAL_NONE).
   * null/absent = automatic (the most recent report matching the topic or
   * the creator's niche).
   */
  viralKey?: string | null;
}

export type RunStatus = "idle" | "running" | "error" | "cancelled";

export interface SourceProgress {
  state: "pending" | "running" | "done";
  summary?: SourceRunSummary;
}

export interface AnalysisRun {
  status: RunStatus;
  request: AnalyzeRequest | null;
  sources: Partial<Record<SourceId, SourceProgress>>;
  synthesis: { signalCount: number; mode: "ai" | "basic" } | null;
  error: string | null;
}

export type ScriptPhase = "research" | "writing" | "review" | "finalizing";

export interface ScriptRun {
  status: RunStatus;
  kind: "generate" | "refine";
  /** Refinement instruction, when refining. */
  instruction: string | null;
  /** Whether a web research phase is expected. */
  research: boolean;
  /** Whether a critical review pass is expected (settings.review, not when refining). */
  review: boolean;
  phase: ScriptPhase | null;
  message: string;
  chars: number;
  /** Characters of the first draft, frozen when the review pass starts. */
  draftChars?: number;
  brief: ResearchBrief | null;
  error: string | null;
}

export interface SaveNotice {
  scriptId: string;
  ok: boolean;
  evicted: number;
}

export interface StudioState {
  draft: StudioDraft;
  analysisRun: AnalysisRun;
  scriptRun: ScriptRun;
  /** Outcome of the last automatic history save. */
  saveNotice: SaveNotice | null;
  /** One-off message (history entry not found, idea imported…). */
  notice: string | null;
  /** Tone of `notice` (default "warning"). */
  noticeTone?: "info" | "warning";
  /** Last message for the screen-reader live region of the Studio. */
  announcement: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function initialForm(): RadarForm {
  return { geo: "FR", language: "fr", niche: "", keywords: [], sources: null, maxTopics: DEFAULT_TOPICS };
}

function initialDraft(): StudioDraft {
  return {
    step: "radar",
    form: initialForm(),
    analysis: null,
    filters: { platforms: [], hideSensitive: true, sort: "score" },
    topic: null,
    evidence: [],
    geo: null,
    angleChoice: null,
    customAngle: { title: "", pitch: "" },
    angle: null,
    settings: defaultScriptSettings("fr"),
    result: null,
    competitorKeys: null,
    viralKey: null,
  };
}

const IDLE_ANALYSIS: AnalysisRun = { status: "idle", request: null, sources: {}, synthesis: null, error: null };

const IDLE_SCRIPT: ScriptRun = {
  status: "idle",
  kind: "generate",
  instruction: null,
  research: false,
  review: false,
  phase: null,
  message: "",
  chars: 0,
  brief: null,
  error: null,
};

// ---------------------------------------------------------------------------
// Draft validation (sessionStorage and history are untrusted: other
// versions, manual edits, quota truncation)
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

function isStep(value: unknown): value is StudioStep {
  return isString(value) && (STUDIO_STEPS as readonly string[]).includes(value);
}

function isTopicLike(value: unknown): value is Topic {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isRecord(value.scores) &&
    isRecord(value.sensitivity) &&
    Array.isArray(value.signalIds) &&
    Array.isArray(value.platforms) &&
    Array.isArray(value.angles)
  );
}

function isAnalysisLike(value: unknown): value is Analysis {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.createdAt) &&
    isRecord(value.request) &&
    Array.isArray(value.topics) &&
    value.topics.every(isTopicLike) &&
    Array.isArray(value.signals) &&
    Array.isArray(value.sources) &&
    Array.isArray(value.notes)
  );
}

function isAngleLike(value: unknown): value is Angle {
  return isRecord(value) && isString(value.id) && isString(value.type) && isString(value.title) && isString(value.pitch);
}

function isScriptLike(value: unknown): value is GeneratedScript {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.fullScript) &&
    Array.isArray(value.hooks) &&
    Array.isArray(value.beats) &&
    Array.isArray(value.hashtags) &&
    Array.isArray(value.factsToVerify) &&
    Array.isArray(value.checklist)
  );
}

/** Valid settings, field by field falling back to the defaults. */
export function normalizeSettings(value: unknown, language = "fr"): ScriptSettings {
  const defaults = defaultScriptSettings(language);
  if (!isRecord(value)) return defaults;
  const merged = { ...defaults, ...value };
  const parsed = scriptSettingsSchema.safeParse(merged);
  if (parsed.success) return { ...defaults, ...(parsed.data as ScriptSettings) };
  // Keep whatever fields are individually valid.
  const result: ScriptSettings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof ScriptSettings)[]) {
    const candidate = { ...defaults, [key]: value[key] };
    if (value[key] !== undefined && scriptSettingsSchema.safeParse(candidate).success) {
      (result as unknown as Record<string, unknown>)[key] = value[key];
    }
  }
  return result;
}

function normalizeForm(value: unknown): RadarForm {
  const base = initialForm();
  if (!isRecord(value)) return base;
  const geo = isString(value.geo) && /^[A-Z]{2}$/.test(value.geo) ? value.geo : base.geo;
  const language = isString(value.language) && /^[a-z]{2}$/.test(value.language) ? value.language : base.language;
  const niche = isString(value.niche) ? value.niche.slice(0, 300) : "";
  const keywords = Array.isArray(value.keywords) ? value.keywords.filter(isString).slice(0, MAX_KEYWORDS) : [];
  const sources = Array.isArray(value.sources)
    ? value.sources.filter((id): id is SourceId => isString(id) && (SOURCE_IDS as readonly string[]).includes(id))
    : null;
  const max = typeof value.maxTopics === "number" && Number.isFinite(value.maxTopics) ? Math.round(value.maxTopics) : DEFAULT_TOPICS;
  return { geo, language, niche, keywords, sources, maxTopics: Math.min(MAX_TOPICS, Math.max(MIN_TOPICS, max)) };
}

function normalizeFilters(value: unknown): TopicFilters {
  const base = initialDraft().filters;
  if (!isRecord(value)) return base;
  return {
    platforms: Array.isArray(value.platforms)
      ? value.platforms.filter((p): p is Platform => isString(p) && (PLATFORMS as readonly string[]).includes(p))
      : [],
    hideSensitive: typeof value.hideSensitive === "boolean" ? value.hideSensitive : true,
    sort: value.sort === "momentum" || value.sort === "freshness" || value.sort === "niche" ? value.sort : "score",
  };
}

function normalizeResult(value: unknown, fallbackSettings: ScriptSettings): ScriptResultState | null {
  if (!isRecord(value) || !isScriptLike(value.script)) return null;
  const hookIndex =
    typeof value.hookIndex === "number" && Number.isInteger(value.hookIndex) && value.hookIndex >= 0 && value.hookIndex < value.script.hooks.length
      ? value.hookIndex
      : 0;
  return { script: value.script, hookIndex, settings: normalizeSettings(value.settings ?? fallbackSettings, fallbackSettings.language) };
}

/** Rebuilds a coherent draft from untrusted storage data. */
function normalizeDraft(value: unknown): StudioDraft | null {
  if (!isRecord(value)) return null;
  const base = initialDraft();
  const analysis = isAnalysisLike(value.analysis) ? value.analysis : null;
  const topic = isTopicLike(value.topic) ? value.topic : null;
  const settings = normalizeSettings(value.settings, analysis?.request.language ?? "fr");
  const customAngle = isRecord(value.customAngle)
    ? {
        title: isString(value.customAngle.title) ? value.customAngle.title : "",
        pitch: isString(value.customAngle.pitch) ? value.customAngle.pitch : "",
      }
    : base.customAngle;
  return clampStep({
    step: isStep(value.step) ? value.step : "radar",
    form: normalizeForm(value.form),
    analysis,
    filters: normalizeFilters(value.filters),
    topic,
    evidence: topic && Array.isArray(value.evidence) ? (value.evidence.filter(isRecord) as unknown as Signal[]) : [],
    geo: isString(value.geo) ? value.geo : null,
    angleChoice: isString(value.angleChoice) ? value.angleChoice : null,
    customAngle,
    angle: topic && isAngleLike(value.angle) ? value.angle : null,
    settings,
    result: topic ? normalizeResult(value.result, settings) : null,
    competitorKeys: normalizeCompetitorKeys(value.competitorKeys),
    viralKey: isString(value.viralKey) && value.viralKey.length <= 400 ? value.viralKey : null,
  });
}

/** Explicit "Se différencier de" selection (max 3 keys), or null for the automatic one. */
function normalizeCompetitorKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value.filter(isString))).slice(0, MAX_COMPETITORS);
}

// ---------------------------------------------------------------------------
// Navigation rules
// ---------------------------------------------------------------------------

/** Which steps can be opened with the current draft. */
export function reachableSteps(draft: StudioDraft): Record<StudioStep, boolean> {
  return {
    radar: true,
    sujets: draft.analysis !== null,
    angle: draft.topic !== null,
    script: draft.topic !== null && draft.angle !== null,
  };
}

function clampStep(draft: StudioDraft): StudioDraft {
  const reachable = reachableSteps(draft);
  if (reachable[draft.step]) return draft;
  const fallback = [...STUDIO_STEPS].reverse().find((step) => reachable[step]) ?? "radar";
  return { ...draft, step: fallback };
}

// ---------------------------------------------------------------------------
// Entry from the history page (?analyse=<id> / ?script=<id>)
// ---------------------------------------------------------------------------

export interface StudioEntry {
  analyseId: string | null;
  scriptId: string | null;
  /**
   * Idea handed over by "Écrire ce script" on /concurrents or
   * /ce-qui-cartonne (sessionStorage, read by the provider). Ignored when a
   * history link is followed.
   */
  handoff?: PendingStudioHandoff | null;
}

/** Max competitors a script request can carry (API schema limit). */
export const MAX_COMPETITORS = 3;

export function formFromRequest(request: AnalyzeRequest): RadarForm {
  return normalizeForm({ ...request, sources: request.sources });
}

function draftFromAnalysis(draft: StudioDraft, analysis: Analysis): StudioDraft {
  return {
    ...draft,
    step: "sujets",
    form: formFromRequest(analysis.request),
    analysis,
    filters: { ...draft.filters, platforms: [] },
    topic: null,
    evidence: [],
    geo: null,
    angleChoice: null,
    angle: null,
    result: null,
    settings: { ...draft.settings, language: analysis.request.language },
  };
}

function draftFromSavedScript(draft: StudioDraft, saved: SavedScript, analyses: Analysis[]): StudioDraft {
  const analysis =
    (saved.analysisId && analyses.find((entry) => entry.id === saved.analysisId)) ||
    (saved.analysisId && draft.analysis?.id === saved.analysisId ? draft.analysis : null) ||
    null;
  const settings = normalizeSettings(saved.settings, saved.settings?.language ?? "fr");
  const custom = saved.angle.type === "custom";
  return {
    ...draft,
    step: "script",
    form: analysis ? formFromRequest(analysis.request) : draft.form,
    analysis,
    filters: { ...draft.filters, platforms: [] },
    topic: saved.topic,
    evidence: saved.signals ?? [],
    geo: saved.geo ?? analysis?.request.geo ?? null,
    angleChoice: custom ? "custom" : saved.angle.id,
    customAngle: custom ? { title: saved.angle.title, pitch: saved.angle.pitch } : draft.customAngle,
    angle: saved.angle,
    settings,
    result: { script: saved.script, hookIndex: 0, settings },
  };
}

/**
 * Opens the Script step with a competitor or lab idea (real topic + evidence
 * + custom angle); its competitor / lab report is pre-selected.
 */
function draftFromHandoff(draft: StudioDraft, handoff: PendingStudioHandoff): StudioDraft {
  const { topic, angle } = handoff;
  const known = topic.angles.some((item) => item.id === angle.id);
  const competitorKeys = handoff.competitorKey
    ? [handoff.competitorKey, ...(draft.competitorKeys ?? []).filter((key) => key !== handoff.competitorKey)].slice(
        0,
        MAX_COMPETITORS,
      )
    : (draft.competitorKeys ?? null);
  return {
    ...draft,
    step: "script",
    topic,
    evidence: Array.isArray(handoff.signals) ? handoff.signals : [],
    geo: draft.geo ?? draft.form.geo,
    angleChoice: known ? angle.id : "custom",
    customAngle: known ? draft.customAngle : { title: angle.title, pitch: angle.pitch },
    angle,
    settings: handoff.scriptPlatform ? { ...draft.settings, platform: handoff.scriptPlatform } : draft.settings,
    result: null,
    competitorKeys,
    viralKey: handoff.viralKey ?? draft.viralKey ?? null,
  };
}

/**
 * Initial state: the sessionStorage draft (or defaults), overridden by the
 * history entry named in the URL, or by a competitor idea hand-off. Reads browser storage — call it on the
 * client only (reducer initializer of a subtree mounted after hydration).
 */
export function createStudioState(entry: StudioEntry): StudioState {
  let draft = normalizeDraft(loadStudioDraft<unknown>()) ?? initialDraft();
  let notice: string | null = null;
  let noticeTone: StudioState["noticeTone"] = "warning";

  if (entry.scriptId || entry.analyseId) {
    const history = getHistory();
    if (entry.scriptId) {
      const saved = history.scripts.find((item) => item.id === entry.scriptId);
      if (saved && isScriptLike(saved.script) && isTopicLike(saved.topic) && isAngleLike(saved.angle)) {
        draft = draftFromSavedScript(draft, saved, history.analyses);
      } else {
        notice = "Ce script n'est plus dans l'historique de ce navigateur : voici votre session en cours.";
      }
    } else if (entry.analyseId) {
      const analysis = history.analyses.find((item) => item.id === entry.analyseId);
      if (analysis && isAnalysisLike(analysis)) draft = draftFromAnalysis(draft, analysis);
      else notice = "Cette analyse n'est plus dans l'historique de ce navigateur : voici votre session en cours.";
    }
  } else if (entry.handoff && isTopicLike(entry.handoff.topic) && isAngleLike(entry.handoff.angle)) {
    draft = draftFromHandoff(draft, entry.handoff);
    noticeTone = "info";
    notice = entry.handoff.viralKey
      ? `Idée importée depuis « Ce qui cartonne »${entry.handoff.label ? ` (${entry.handoff.label})` : ""} : les vidéos qui l'inspirent servent de preuves et ce rapport est sélectionné dans « S'appuyer sur ce qui cartonne ». Ajustez les réglages puis générez le script.`
      : `Idée importée${entry.handoff.label ? ` depuis l'analyse de ${entry.handoff.label}` : ""} : ses publications servent de preuves et ce concurrent est sélectionné dans « Se différencier de ». Ajustez les réglages puis générez le script.`;
  }

  return {
    draft: clampStep(draft),
    analysisRun: IDLE_ANALYSIS,
    scriptRun: IDLE_SCRIPT,
    saveNotice: null,
    notice,
    noticeTone,
    announcement: notice && noticeTone === "info" ? notice : "",
  };
}

/** Saves the draft; when sessionStorage is full, retries with less data. */
function persistDraft(draft: StudioDraft): void {
  if (saveStudioDraft(draft)) return;
  if (draft.analysis && saveStudioDraft({ ...draft, analysis: trimAnalysis(draft.analysis) })) return;
  saveStudioDraft(clampStep({ ...draft, analysis: null }));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type StudioAction =
  | { type: "goTo"; step: StudioStep }
  | { type: "updateForm"; patch: Partial<RadarForm> }
  | { type: "analysisStart"; request: AnalyzeRequest }
  | { type: "analysisEvent"; event: AnalyzeEvent }
  | { type: "analysisDone"; analysis: Analysis }
  | { type: "analysisFailed"; message: string }
  | { type: "analysisCancelled" }
  | { type: "analysisReset" }
  | { type: "updateFilters"; patch: Partial<TopicFilters> }
  | { type: "selectTopic"; topic: Topic; evidence: Signal[] }
  | { type: "chooseAngle"; choice: string }
  | { type: "updateCustomAngle"; patch: Partial<CustomAngleDraft> }
  | { type: "commitAngle"; angle: Angle }
  | { type: "updateSettings"; patch: Partial<ScriptSettings> }
  | { type: "scriptStart"; kind: ScriptRun["kind"]; instruction: string | null; research: boolean; review?: boolean }
  | { type: "scriptEvent"; event: ScriptEvent }
  | { type: "scriptDone"; script: GeneratedScript; settings: ScriptSettings; topicId: string; angleId: string; saved: SaveResult }
  | { type: "scriptFailed"; message: string }
  | { type: "scriptCancelled" }
  | { type: "scriptReset" }
  | { type: "selectHook"; index: number }
  | { type: "setCompetitors"; keys: string[] | null }
  | { type: "setViralReport"; key: string | null }
  | { type: "dismissNotice" };

function sourceLabel(id: SourceId): string {
  return SOURCE_FALLBACK[id]?.label ?? id;
}

function describeSourceDone(summary: SourceRunSummary): string {
  const label = sourceLabel(summary.source);
  if (summary.skipped) return `${label} : ignorée`;
  if (!summary.ok) return `${label} : erreur`;
  return `${label} : ${summary.count} signal${summary.count > 1 ? "aux" : ""}`;
}

const PHASE_LABELS: Record<ScriptPhase, string> = {
  research: "Recherche des faits en cours",
  writing: "Écriture du script en cours",
  review: "Relecture critique du script en cours",
  finalizing: "Finalisation du script",
};

function sameAngle(a: Angle | null, b: Angle): boolean {
  if (!a) return false;
  if (a.type === "custom" || b.type === "custom") {
    return a.type === b.type && a.title.trim() === b.title.trim() && a.pitch.trim() === b.pitch.trim();
  }
  return a.id === b.id;
}

function patchDraft(state: StudioState, patch: Partial<StudioDraft>): StudioState {
  return { ...state, draft: { ...state.draft, ...patch } };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  const { draft } = state;
  switch (action.type) {
    case "goTo": {
      if (!reachableSteps(draft)[action.step] || draft.step === action.step) return state;
      return patchDraft(state, { step: action.step });
    }

    case "updateForm":
      return patchDraft(state, { form: { ...draft.form, ...action.patch } });

    case "analysisStart":
      return {
        ...patchDraft(state, { step: "radar" }),
        analysisRun: {
          status: "running",
          request: action.request,
          sources: Object.fromEntries(
            action.request.sources.map((id) => [id, { state: "pending" }]),
          ) as AnalysisRun["sources"],
          synthesis: null,
          error: null,
        },
        announcement: `Analyse lancée sur ${action.request.sources.length} source${action.request.sources.length > 1 ? "s" : ""}.`,
      };

    case "analysisEvent": {
      const run = state.analysisRun;
      if (run.status !== "running") return state;
      const { event } = action;
      if (event.type === "source_start") {
        return { ...state, analysisRun: { ...run, sources: { ...run.sources, [event.source]: { state: "running" } } } };
      }
      if (event.type === "source_done") {
        return {
          ...state,
          analysisRun: {
            ...run,
            sources: { ...run.sources, [event.summary.source]: { state: "done", summary: event.summary } },
          },
          announcement: describeSourceDone(event.summary),
        };
      }
      if (event.type === "synthesis_start") {
        return {
          ...state,
          analysisRun: { ...run, synthesis: { signalCount: event.signalCount, mode: event.mode } },
          announcement:
            event.mode === "ai"
              ? `Synthèse par Claude de ${event.signalCount} signaux en cours.`
              : `Regroupement automatique de ${event.signalCount} signaux en cours.`,
        };
      }
      return state;
    }

    case "analysisDone": {
      const { analysis } = action;
      return {
        ...state,
        draft: {
          ...draft,
          step: "sujets",
          form: formFromRequest(analysis.request),
          analysis,
          filters: { ...draft.filters, platforms: [] },
          topic: null,
          evidence: [],
          geo: null,
          angleChoice: null,
          angle: null,
          result: null,
          settings: { ...draft.settings, language: analysis.request.language },
        },
        analysisRun: IDLE_ANALYSIS,
        announcement: `Analyse terminée : ${analysis.topics.length} sujet${analysis.topics.length > 1 ? "s" : ""} proposé${analysis.topics.length > 1 ? "s" : ""}.`,
      };
    }

    case "analysisFailed":
      return {
        ...state,
        analysisRun: { ...state.analysisRun, status: "error", error: action.message },
        announcement: `Échec de l'analyse : ${action.message}`,
      };

    case "analysisCancelled":
      return {
        ...state,
        analysisRun: { ...state.analysisRun, status: "cancelled" },
        announcement: "Analyse annulée.",
      };

    case "analysisReset":
      return { ...state, analysisRun: IDLE_ANALYSIS };

    case "updateFilters":
      return patchDraft(state, { filters: { ...draft.filters, ...action.patch } });

    case "selectTopic": {
      if (draft.topic?.id === action.topic.id && draft.analysis?.topics.some((t) => t.id === action.topic.id)) {
        return patchDraft(state, { step: "angle", topic: action.topic, evidence: action.evidence });
      }
      return {
        ...patchDraft(state, {
          step: "angle",
          topic: action.topic,
          evidence: action.evidence,
          geo: draft.analysis?.request.geo ?? draft.geo,
          angleChoice: null,
          customAngle: { title: "", pitch: "" },
          angle: null,
          result: null,
          settings: { ...draft.settings, language: draft.analysis?.request.language ?? draft.settings.language },
        }),
        scriptRun: IDLE_SCRIPT,
      };
    }

    case "chooseAngle":
      return patchDraft(state, { angleChoice: action.choice });

    case "updateCustomAngle":
      return patchDraft(state, { customAngle: { ...draft.customAngle, ...action.patch } });

    case "commitAngle": {
      if (sameAngle(draft.angle, action.angle)) return patchDraft(state, { step: "script" });
      return {
        ...patchDraft(state, { step: "script", angle: action.angle, result: null }),
        scriptRun: IDLE_SCRIPT,
      };
    }

    case "updateSettings":
      return patchDraft(state, { settings: { ...draft.settings, ...action.patch } });

    case "scriptStart":
      return {
        ...state,
        scriptRun: {
          ...IDLE_SCRIPT,
          status: "running",
          kind: action.kind,
          instruction: action.instruction,
          research: action.research,
          review: Boolean(action.review) && action.kind !== "refine",
        },
        announcement: action.kind === "refine" ? "Affinage du script lancé." : "Génération du script lancée.",
      };

    case "scriptEvent": {
      const run = state.scriptRun;
      if (run.status !== "running") return state;
      const { event } = action;
      if (event.type === "status") {
        const draftChars = event.step === "review" && run.phase !== "review" ? run.chars : run.draftChars;
        return {
          ...state,
          scriptRun: { ...run, phase: event.step, message: event.message, ...(draftChars !== undefined ? { draftChars } : {}) },
          announcement: run.phase === event.step ? state.announcement : PHASE_LABELS[event.step],
        };
      }
      if (event.type === "research") return { ...state, scriptRun: { ...run, brief: event.brief } };
      if (event.type === "progress") {
        return { ...state, scriptRun: { ...run, phase: run.phase ?? "writing", chars: event.chars } };
      }
      return state;
    }

    case "scriptDone": {
      const current = draft.topic?.id === action.topicId && draft.angle?.id === action.angleId;
      const saveNotice = { scriptId: action.script.id, ok: action.saved.ok, evicted: action.saved.evicted };
      if (!current) return { ...state, scriptRun: IDLE_SCRIPT, saveNotice };
      return {
        ...patchDraft(state, { result: { script: action.script, hookIndex: 0, settings: action.settings } }),
        scriptRun: IDLE_SCRIPT,
        saveNotice,
        announcement: `Script prêt : ${action.script.title}`,
      };
    }

    case "scriptFailed":
      return {
        ...state,
        scriptRun: { ...state.scriptRun, status: "error", error: action.message },
        announcement: `Échec de la génération : ${action.message}`,
      };

    case "scriptCancelled":
      return { ...state, scriptRun: { ...state.scriptRun, status: "cancelled" }, announcement: "Génération annulée." };

    case "scriptReset":
      return { ...state, scriptRun: IDLE_SCRIPT };

    case "selectHook": {
      if (!draft.result || action.index < 0 || action.index >= draft.result.script.hooks.length) return state;
      return {
        ...patchDraft(state, { result: { ...draft.result, hookIndex: action.index } }),
        announcement: `Accroche ${action.index + 1} utilisée dans le script.`,
      };
    }

    case "setCompetitors":
      return patchDraft(state, {
        competitorKeys: action.keys === null ? null : Array.from(new Set(action.keys)).slice(0, MAX_COMPETITORS),
      });

    case "setViralReport":
      return patchDraft(state, { viralKey: action.key });

    case "dismissNotice":
      return { ...state, notice: null };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Everything a script generation needs; built by the Script step. */
export interface ScriptJob {
  request: ScriptRequest;
  kind: ScriptRun["kind"];
  analysisId?: string;
  /**
   * Refine only: the web-research brief of the script being refined. A
   * refinement keeps the same facts and sources without a new search, so the
   * refined script carries the brief over (Faits & sources tab, exports).
   */
  previousResearch?: ResearchBrief;
}

/**
 * A refinement runs no new research: the refined script keeps the brief of
 * the script it refines (Faits & sources tab, exports, history).
 */
export function withPreviousResearch(script: GeneratedScript, job: Pick<ScriptJob, "kind" | "previousResearch">): GeneratedScript {
  return job.kind === "refine" && !script.research && job.previousResearch ? { ...script, research: job.previousResearch } : script;
}

export interface StudioActions {
  /** Streams /api/analyze; moves to "Sujets" on success and saves the analysis to history. */
  runAnalysis: (request: AnalyzeRequest) => Promise<void>;
  cancelAnalysis: () => void;
  /** Streams /api/script; saves every successful script to history. */
  runScript: (job: ScriptJob) => Promise<void>;
  /** Re-runs the last script job (after an error or a cancel). */
  retryScript: () => void;
  cancelScript: () => void;
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  actions: StudioActions;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside <StudioProvider>");
  return value;
}

export interface StudioProviderProps {
  entry: StudioEntry;
  children: ReactNode;
}

export function StudioProvider({ entry, children }: StudioProviderProps) {
  // A competitor idea waiting in sessionStorage (peeked, not consumed: React
  // may run initializers twice; it is cleared once applied, below).
  const [initialEntry] = useState<StudioEntry>(() =>
    entry.analyseId || entry.scriptId || entry.handoff !== undefined ? entry : { ...entry, handoff: peekStudioHandoff() },
  );
  const [state, dispatch] = useReducer(studioReducer, initialEntry, createStudioState);
  // Whether we came from a history link — read once, the URL is cleaned below.
  const [fromHistoryLink] = useState(() => Boolean(entry.analyseId || entry.scriptId));
  const analysisController = useRef<AbortController | null>(null);
  const scriptController = useRef<AbortController | null>(null);
  const lastScriptJob = useRef<ScriptJob | null>(null);
  const latestDraft = useRef(state.draft);

  // Persist the draft, debounced (typing in a field re-renders often).
  const { draft } = state;
  useEffect(() => {
    latestDraft.current = draft;
    const timer = setTimeout(() => persistDraft(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  // Flush on tab close / navigation away, and abort streams on unmount.
  useEffect(() => {
    const flush = () => persistDraft(latestDraft.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      analysisController.current?.abort();
      scriptController.current?.abort();
    };
  }, []);

  // The idea hand-off was applied to the draft: consume it, so a refresh
  // restores the session instead of importing the idea again.
  useEffect(() => {
    if (!initialEntry.handoff) return;
    clearStudioHandoff();
    persistDraft(latestDraft.current);
  }, [initialEntry]);

  // `/?script=…` was consumed into the draft: drop it from the URL so a
  // refresh restores the session instead of reloading the history entry.
  useEffect(() => {
    if (!fromHistoryLink) return;
    persistDraft(latestDraft.current);
    // `null` state: Next.js patches replaceState, copies its internal state and
    // syncs useSearchParams (passing the current state would bypass that sync).
    window.history.replaceState(null, "", window.location.pathname);
  }, [fromHistoryLink]);

  const runAnalysis = useCallback(async (request: AnalyzeRequest) => {
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    dispatch({ type: "analysisStart", request });
    try {
      const analysis = await streamAnalyze(
        request,
        (event) => {
          if (!controller.signal.aborted) dispatch({ type: "analysisEvent", event });
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      saveAnalysisToHistory(analysis);
      dispatch({ type: "analysisDone", analysis });
    } catch (error) {
      if (analysisController.current !== controller) return; // superseded by a newer run
      if (isAbortError(error) || controller.signal.aborted) dispatch({ type: "analysisCancelled" });
      else dispatch({ type: "analysisFailed", message: errorMessage(error) });
    } finally {
      if (analysisController.current === controller) analysisController.current = null;
    }
  }, []);

  const cancelAnalysis = useCallback(() => {
    analysisController.current?.abort();
  }, []);

  const runScript = useCallback(async (job: ScriptJob) => {
    scriptController.current?.abort();
    const controller = new AbortController();
    scriptController.current = controller;
    lastScriptJob.current = job;
    const { request } = job;
    dispatch({
      type: "scriptStart",
      kind: job.kind,
      instruction: request.refine?.instruction ?? null,
      research: request.settings.research,
      review: request.settings.review && !request.refine,
    });
    try {
      const streamed = await streamScript(
        request,
        (event) => {
          if (!controller.signal.aborted) dispatch({ type: "scriptEvent", event });
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const script = withPreviousResearch(streamed, job);
      const saved = saveScriptToHistory({
        id: script.id,
        savedAt: new Date().toISOString(),
        script,
        topic: request.topic,
        angle: request.angle,
        settings: request.settings,
        signals: request.signals,
        analysisId: job.analysisId,
        geo: request.geo,
      });
      dispatch({
        type: "scriptDone",
        script,
        settings: request.settings,
        topicId: request.topic.id,
        angleId: request.angle.id,
        saved,
      });
    } catch (error) {
      if (scriptController.current !== controller) return;
      if (isAbortError(error) || controller.signal.aborted) dispatch({ type: "scriptCancelled" });
      else dispatch({ type: "scriptFailed", message: errorMessage(error) });
    } finally {
      if (scriptController.current === controller) scriptController.current = null;
    }
  }, []);

  const retryScript = useCallback(() => {
    if (lastScriptJob.current) void runScript(lastScriptJob.current);
  }, [runScript]);

  const cancelScript = useCallback(() => {
    scriptController.current?.abort();
  }, []);

  const actions = useMemo<StudioActions>(
    () => ({ runAnalysis, cancelAnalysis, runScript, retryScript, cancelScript }),
    [runAnalysis, cancelAnalysis, runScript, retryScript, cancelScript],
  );

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
