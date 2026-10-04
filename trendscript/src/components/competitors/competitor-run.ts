/**
 * The competitor analysis in flight, as a tiny module-level store shared by
 * the /concurrents page: a run survives switching between the form and a
 * saved report, and even leaving the page (the result is saved to the
 * browser when it arrives). State changes go through a pure reducer.
 */

import { useSyncExternalStore } from "react";
import { errorMessage, isAbortError, streamCompetitor } from "@/lib/client/api";
import { saveCompetitorReport, type SaveResult } from "@/lib/client/storage";
import type {
  CompetitorEvent,
  CompetitorReport,
  CompetitorRequest,
  CreatorData,
  CreatorStats,
} from "@/lib/types";

export type CompetitorRunStatus = "idle" | "running" | "done" | "error" | "cancelled";
export type CompetitorStep = "fetch" | "stats" | "analysis";

export interface CompetitorRun {
  status: CompetitorRunStatus;
  request: CompetitorRequest | null;
  /** Last step announced by the server. */
  step: CompetitorStep | null;
  message: string;
  /** Characters of Claude's analysis received so far. */
  chars: number;
  /** Real posts + statistics, sent before Claude's analysis. */
  preview: { data: CreatorData; stats: CreatorStats } | null;
  report: CompetitorReport | null;
  /** Outcome of the automatic save of `report`. */
  saved: SaveResult | null;
  error: string | null;
}

export type CompetitorRunAction =
  | { type: "start"; request: CompetitorRequest }
  | { type: "event"; event: CompetitorEvent }
  | { type: "done"; report: CompetitorReport; saved: SaveResult }
  | { type: "failed"; message: string }
  | { type: "cancelled" }
  | { type: "reset" };

export const IDLE_RUN: CompetitorRun = Object.freeze({
  status: "idle",
  request: null,
  step: null,
  message: "",
  chars: 0,
  preview: null,
  report: null,
  saved: null,
  error: null,
}) as CompetitorRun;

export function competitorRunReducer(run: CompetitorRun, action: CompetitorRunAction): CompetitorRun {
  switch (action.type) {
    case "start":
      return { ...IDLE_RUN, status: "running", request: action.request, step: "fetch" };
    case "event": {
      if (run.status !== "running") return run;
      const { event } = action;
      if (event.type === "status") return { ...run, step: event.step, message: event.message };
      if (event.type === "data") return { ...run, preview: { data: event.data, stats: event.stats } };
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
      return run.status === "running" ? run : IDLE_RUN;
    default:
      return run;
  }
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

const STEP_ORDER: CompetitorStep[] = ["fetch", "stats", "analysis"];

/** State of a step of the run; the analysis is "skipped" when Claude isn't configured. */
export function competitorStepState(step: CompetitorStep, run: CompetitorRun, aiConfigured: boolean | null): StepState {
  if (step === "analysis" && aiConfigured === false) return "skipped";
  const current = run.step ?? "fetch";
  const index = STEP_ORDER.indexOf(step);
  const currentIndex = STEP_ORDER.indexOf(current);
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let current: CompetitorRun = IDLE_RUN;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function dispatch(action: CompetitorRunAction) {
  const next = competitorRunReducer(current, action);
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
const getServerSnapshot = () => IDLE_RUN;

/**
 * Streams POST /api/competitor and saves the report in this browser.
 * Resolves with the report, or null when cancelled, failed or superseded
 * (the failure is in the run state).
 */
export async function startCompetitorRun(request: CompetitorRequest): Promise<CompetitorReport | null> {
  controller?.abort();
  const own = new AbortController();
  controller = own;
  dispatch({ type: "start", request });
  try {
    const report = await streamCompetitor(
      request,
      (event) => {
        if (!own.signal.aborted) dispatch({ type: "event", event });
      },
      own.signal,
    );
    if (own.signal.aborted) return null;
    const saved = saveCompetitorReport(report);
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

export function cancelCompetitorRun(): void {
  controller?.abort();
}

/** Back to idle (dismiss a result, an error or a cancellation). */
export function resetCompetitorRun(): void {
  dispatch({ type: "reset" });
}

/** The current run (outside React). */
export function getCompetitorRun(): CompetitorRun {
  return current;
}

/** The current run, live. */
export function useCompetitorRun(): CompetitorRun {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
