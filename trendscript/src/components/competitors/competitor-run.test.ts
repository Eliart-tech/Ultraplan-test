import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, fixtureCompetitorRequest, fixtureCreator, fixtureReport } from "@/lib/creators/__fixtures__/creator";
import { computeCreatorStats } from "@/lib/creators/stats";
import type { CompetitorEvent } from "@/lib/types";

vi.mock("@/lib/client/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/api")>()),
  streamCompetitor: vi.fn(),
}));
vi.mock("@/lib/client/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/storage")>()),
  saveCompetitorReport: vi.fn(() => ({ ok: true, evicted: 0 })),
}));

const { streamCompetitor, ApiError } = await import("@/lib/client/api");
const { saveCompetitorReport } = await import("@/lib/client/storage");
const run = await import("./competitor-run");
const { IDLE_RUN, competitorRunReducer, competitorStepState } = run;

const stats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });
const report = fixtureReport({ stats });

describe("competitorRunReducer", () => {
  it("follows the streamed steps and keeps the real data preview", () => {
    let state = competitorRunReducer(IDLE_RUN, { type: "start", request: fixtureCompetitorRequest });
    expect(state).toMatchObject({ status: "running", step: "fetch", chars: 0, preview: null });
    const events: CompetitorEvent[] = [
      { type: "status", step: "fetch", message: "Récupération des publications…" },
      { type: "data", data: fixtureCreator, stats },
      { type: "status", step: "stats", message: "Calcul des statistiques…" },
      { type: "progress", chars: 1200 },
    ];
    for (const event of events) state = competitorRunReducer(state, { type: "event", event });
    expect(state.preview?.data.account.handle).toBe("budgetmalin");
    expect(state.step).toBe("analysis");
    expect(state.chars).toBe(1200);
    state = competitorRunReducer(state, { type: "done", report, saved: { ok: true, evicted: 0 } });
    expect(state).toMatchObject({ status: "done", report, saved: { ok: true } });
  });

  it("ignores events when not running and only resets a finished run", () => {
    const event: CompetitorEvent = { type: "progress", chars: 10 };
    expect(competitorRunReducer(IDLE_RUN, { type: "event", event })).toBe(IDLE_RUN);
    const running = competitorRunReducer(IDLE_RUN, { type: "start", request: fixtureCompetitorRequest });
    expect(competitorRunReducer(running, { type: "reset" })).toBe(running);
    const failed = competitorRunReducer(running, { type: "failed", message: "Compte introuvable." });
    expect(failed).toMatchObject({ status: "error", error: "Compte introuvable." });
    expect(competitorRunReducer(failed, { type: "failed", message: "autre" })).toBe(failed);
    expect(competitorRunReducer(failed, { type: "reset" })).toBe(IDLE_RUN);
    expect(competitorRunReducer(running, { type: "cancelled" }).status).toBe("cancelled");
  });
});

describe("competitorStepState", () => {
  const running = competitorRunReducer(IDLE_RUN, { type: "start", request: fixtureCompetitorRequest });

  it("marks steps done / current / upcoming", () => {
    expect(competitorStepState("fetch", running, true)).toBe("current");
    expect(competitorStepState("stats", running, true)).toBe("upcoming");
    const analysing = { ...running, step: "analysis" as const };
    expect(competitorStepState("fetch", analysing, true)).toBe("done");
    expect(competitorStepState("stats", analysing, true)).toBe("done");
    expect(competitorStepState("analysis", analysing, true)).toBe("current");
  });

  it("skips Claude's step when it isn't configured", () => {
    expect(competitorStepState("analysis", running, false)).toBe("skipped");
    expect(competitorStepState("analysis", running, null)).toBe("upcoming");
  });
});

describe("startCompetitorRun", () => {
  beforeEach(() => {
    vi.mocked(streamCompetitor).mockReset();
    vi.mocked(saveCompetitorReport).mockClear();
    run.resetCompetitorRun();
  });
  afterEach(() => {
    run.cancelCompetitorRun();
  });

  it("streams, saves the report and resolves with it", async () => {
    vi.mocked(streamCompetitor).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: "status", step: "stats", message: "Calcul des statistiques…" });
      return report;
    });
    const pending = run.startCompetitorRun(fixtureCompetitorRequest);
    expect(run.getCompetitorRun().status).toBe("running");
    expect(await pending).toBe(report);
    expect(saveCompetitorReport).toHaveBeenCalledWith(report);
    expect(run.getCompetitorRun()).toMatchObject({ status: "done", report, step: "stats", saved: { ok: true } });
    run.resetCompetitorRun();
    expect(run.getCompetitorRun()).toBe(IDLE_RUN);
  });

  it("reports failures in French and resolves null", async () => {
    vi.mocked(streamCompetitor).mockRejectedValue(new ApiError(200, "TikTok indisponible : APIFY_TOKEN manquant."));
    expect(await run.startCompetitorRun(fixtureCompetitorRequest)).toBeNull();
    expect(saveCompetitorReport).not.toHaveBeenCalled();
    expect(run.getCompetitorRun()).toMatchObject({ status: "error", error: "TikTok indisponible : APIFY_TOKEN manquant." });
  });

  it("turns a cancel into the cancelled state", async () => {
    vi.mocked(streamCompetitor).mockImplementation(
      (_request, _onEvent, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const pending = run.startCompetitorRun(fixtureCompetitorRequest);
    run.cancelCompetitorRun();
    expect(await pending).toBeNull();
    expect(run.getCompetitorRun().status).toBe("cancelled");
  });
});
