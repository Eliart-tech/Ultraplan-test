import { describe, expect, it } from "vitest";
import { fixtureViralReport, fixtureViralRequest, fixtureViralSummaries } from "@/lib/viral/__fixtures__/viral";
import { IDLE_VIRAL_RUN, collectedCount, viralRunReducer, viralStepState, type ViralRun, type ViralRunAction } from "./viral-run";

const run = (...actions: ViralRunAction[]): ViralRun => actions.reduce(viralRunReducer, IDLE_VIRAL_RUN);
const start: ViralRunAction = { type: "start", request: fixtureViralRequest };
const [instagram, tiktok] = fixtureViralSummaries;

describe("viral run reducer", () => {
  it("starts with every requested platform pending", () => {
    const state = run(start);
    expect(state).toMatchObject({ status: "running", step: "collect", chars: 0, report: null });
    expect(state.platforms).toEqual({ instagram: { state: "pending" }, tiktok: { state: "pending" }, youtube: { state: "pending" } });
  });

  it("follows each platform, then the enrich and analysis steps", () => {
    let state = run(
      start,
      { type: "event", event: { type: "platform_start", platform: "tiktok" } },
      { type: "event", event: { type: "platform_done", summary: tiktok } },
      { type: "event", event: { type: "platform_start", platform: "instagram" } },
    );
    expect(state.platforms.tiktok).toEqual({ state: "done", summary: tiktok });
    expect(state.platforms.instagram).toEqual({ state: "running" });
    expect(collectedCount(state)).toBe(tiktok.count);

    state = run(
      start,
      { type: "event", event: { type: "platform_done", summary: instagram } },
      { type: "event", event: { type: "status", step: "enrich", message: "Abonnés…" } },
      // A late "collect" status never rewinds the panel.
      { type: "event", event: { type: "status", step: "collect", message: "Recherche…" } },
    );
    expect(state.step).toBe("enrich");
    expect(viralStepState("collect", state, true)).toBe("done");
    expect(viralStepState("enrich", state, true)).toBe("current");
    expect(viralStepState("analysis", state, true)).toBe("upcoming");
    expect(viralStepState("analysis", state, false)).toBe("skipped");

    state = run(start, { type: "event", event: { type: "progress", chars: 1200 } });
    expect(state).toMatchObject({ step: "analysis", chars: 1200 });
  });

  it("ends with the report, an error or a cancellation — only while running", () => {
    const report = fixtureViralReport();
    const done = run(start, { type: "done", report, saved: { ok: true, evicted: 0 } });
    expect(done).toMatchObject({ status: "done", report, saved: { ok: true, evicted: 0 } });
    expect(run(start, { type: "failed", message: "Quota" })).toMatchObject({ status: "error", error: "Quota" });
    expect(run(start, { type: "cancelled" }).status).toBe("cancelled");
    expect(viralRunReducer(done, { type: "failed", message: "tard" })).toBe(done);
    expect(viralRunReducer(done, { type: "event", event: { type: "progress", chars: 9 } })).toBe(done);
  });

  it("can't be reset while running", () => {
    const running = run(start);
    expect(viralRunReducer(running, { type: "reset" })).toBe(running);
    expect(run(start, { type: "cancelled" }, { type: "reset" })).toBe(IDLE_VIRAL_RUN);
  });
});
