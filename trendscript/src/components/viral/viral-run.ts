/**
 * The "Ce qui cartonne" analysis in flight, as a tiny module-level store
 * (same pattern as the competitor run): it survives switching between the
 * form and a saved report, and even leaving the page (the report is saved to
 * the browser when it arrives). State changes go through a pure reducer.
 */

import { useSyncExternalStore } from "react";
import { errorMessage, isAbortError, streamViral } from "@/lib/client/api";
import { saveViralReport, type SaveResult } from "@/lib/client/storage";
import type { ViralEvent, ViralPlatform, ViralPlatformSummary, ViralReport, ViralRequest } from "@/lib/types";

export type ViralRunStatus = "idle" | "running" | "done" | "error" | "cancelled";
export type ViralStep = "collect" | "enrich" | "analysis";

export interface PlatformProgress {
  state: "pending" | "running" | "done";
  summary?: ViralPlatformSummary;
}

export interface ViralRun {
  status: ViralRunStatus;
  request: ViralRequest | null;
  /** Last step announced by the server. */
  step: ViralStep | null;
  message: string;
  /** Characters of Claude's analysis received so far. */
  chars: number;
  /** Collection progress per requested platform. */
  platforms: Partial<Record<ViralPlatform, PlatformProgress>>;
  report: ViralReport | null;
  /** Outcome of the automatic save of `report`. */
  saved: SaveResult | null;
  error: string | null;
}

export type ViralRunAction =
  | { type: "start"; request: ViralRequest }
  | { type: "event"; event: ViralEvent }
  | { type: "done"; report: ViralReport; saved: SaveResult }
  | { type: "failed"; message: string }
  | { type: "cancelled" }
  | { type: "reset" };

export const IDLE_VIRAL_RUN: ViralRun = Object.freeze({
  status: "idle",
  request: null,
  step: null,
  message: "",
  chars: 0,
  platforms: {},
  report: null,
  saved: null,
  error: null,
}) as ViralRun;

const STEP_ORDER: ViralStep[] = ["collect", "enrich", "analysis"];

/** Steps only move forward (a late "collect" status never rewinds the panel). */
function laterStep(current: ViralStep | null, next: ViralStep): ViralStep {
  if (!current) return next;
  return STEP_ORDER.indexOf(next) >= STEP_ORDER.indexOf(current) ? next : current;
}

export function viralRunReducer(run: ViralRun, action: ViralRunAction): ViralRun {
  switch (action.type) {
    case "start":
      return {
        ...IDLE_VIRAL_RUN,
        status: "running",
        request: action.request,
        step: "collect",
        platforms: Object.fromEntries(action.request.platforms.map((platform) => [platform, { state: "pending" }])),
      };
    case "event": {
      if (run.status !== "running") return run;
      const { event } = action;
      if (event.type === "platform_start") {
        return { ...run, platforms: { ...run.platforms, [event.platform]: { state: "running" } } };
      }
      if (event.type === "platform_done") {
        return {
          ...run,
          platforms: { ...run.platforms, [event.summary.platform]: { state: "done", summary: event.summary } },
        };
      }
      if (event.type === "status") return { ...run, step: laterStep(run.step, event.step), message: event.message };
      if (event.type === "progress") return { ...run, step: "analysis", chars: event.chars };
      return run;
    }
    case "done":
      return { ...run, status: "done", report: action.report, saved: action.saved, error: null };
    case "failed":
      return run.status === "running" ? { ...run, status: "error", error: action.message } : run;
    case "cancelled":
      return run.status === "running" ? { ...run, status: "cancelled" } : run;
    case "reset":
      return run.status === "running" ? run : IDLE_VIRAL_RUN;
    default:
      return run;
  }
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

/** State of a step of the run; the analysis is "skipped" when Claude isn't configured. */
export function viralStepState(step: ViralStep, run: ViralRun, aiConfigured: boolean | null): StepState {
  if (step === "analysis" && aiConfigured === false) return "skipped";
  const current = run.step ?? "collect";
  const index = STEP_ORDER.indexOf(step);
  const currentIndex = STEP_ORDER.indexOf(current);
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

/** Videos collected so far (platforms already done). */
export function collectedCount(run: ViralRun): number {
  return Object.values(run.platforms).reduce((sum, progress) => sum + (progress?.summary?.count ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let current: ViralRun = IDLE_VIRAL_RUN;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function dispatch(action: ViralRunAction) {
  const next = viralRunReducer(current, action);
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
const getServerSnapshot = () => IDLE_VIRAL_RUN;

/**
 * Streams POST /api/viral and saves the report in this browser. Resolves
 * with the report, or null when cancelled, failed or superseded (the failure
 * is in the run state).
 */
export async function startViralRun(request: ViralRequest): Promise<ViralReport | null> {
  controller?.abort();
  const own = new AbortController();
  controller = own;
  dispatch({ type: "start", request });
  try {
    const report = await streamViral(
      request,
      (event) => {
        if (!own.signal.aborted) dispatch({ type: "event", event });
      },
      own.signal,
    );
    if (own.signal.aborted) return null;
    const saved = saveViralReport(report);
    dispatch({ type: "done", report, saved });
    return report;
  } catch (error) {
    if (controller !== own) return null; // superseded by a newer run
    if (isAbortError(error) || own.signal.aborted) dispatch({ type: "cancelled" });
    else dispatch({ type: "failed", message: errorMessage(error) });
    return null;
  } finally {
    if (controller === own) controller = null;
  }
}

export function cancelViralRun(): void {
  controller?.abort();
}

/** Back to idle (dismiss a result, an error or a cancellation). */
export function resetViralRun(): void {
  dispatch({ type: "reset" });
}

/** The current run, live. */
export function useViralRun(): ViralRun {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
