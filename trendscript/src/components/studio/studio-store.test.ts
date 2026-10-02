import { describe, expect, it } from "vitest";
import { fixtureDraft, fixtureSettings, fixtureSignals, fixtureTopic } from "@/lib/script/__fixtures__/script";
import type { Analysis, Angle, GeneratedScript, Topic } from "@/lib/types";
import {
  createStudioState,
  normalizeSettings,
  reachableSteps,
  studioReducer,
  type StudioAction,
  type StudioState,
} from "./studio-store";

const analysis: Analysis = {
  id: "analysis-1",
  createdAt: "2026-10-02T15:00:00Z",
  request: {
    geo: "BE",
    language: "fr",
    niche: "sommeil",
    keywords: ["sommeil"],
    sources: ["google_trends", "google_news"],
    maxTopics: 8,
  },
  mode: "ai",
  model: "claude-opus-5-5",
  sources: [
    { source: "google_trends", ok: true, count: 1, durationMs: 800, cached: false },
    { source: "google_news", ok: true, count: 1, durationMs: 500, cached: true },
  ],
  signals: fixtureSignals,
  topics: [fixtureTopic, { ...fixtureTopic, id: "topic-2", title: "Autre sujet" }],
  notes: [],
};

function script(id = "script-1"): GeneratedScript {
  return {
    ...fixtureDraft(),
    id,
    createdAt: "2026-10-02T15:00:00Z",
    model: "claude-opus-5-5",
    wordCount: 101,
    wordBudget: 101,
    estimatedDurationSec: 45,
    warnings: [],
  };
}

function run(state: StudioState, ...actions: StudioAction[]): StudioState {
  return actions.reduce(studioReducer, state);
}

const fresh = () => createStudioState({ analyseId: null, scriptId: null });

describe("studio store", () => {
  it("starts on the Radar with defaults (no browser storage in tests)", () => {
    const state = fresh();
    expect(state.draft.step).toBe("radar");
    expect(state.draft.form).toMatchObject({ geo: "FR", language: "fr", sources: null, maxTopics: 8 });
    expect(state.draft.filters.hideSensitive).toBe(true);
    expect(state.draft.settings).toMatchObject({
      platform: "instagram_reels",
      durationSec: 45,
      virality: 60,
      pedagogy: 60,
      tone: "decontracte",
      research: true,
    });
    expect(reachableSteps(state.draft)).toEqual({ radar: true, sujets: false, angle: false, script: false });
  });

  it("ignores navigation to unreachable steps", () => {
    const state = fresh();
    expect(studioReducer(state, { type: "goTo", step: "script" })).toBe(state);
  });

  it("tracks a streamed analysis, then lands on Sujets", () => {
    let state = run(fresh(), { type: "analysisStart", request: analysis.request });
    expect(state.analysisRun.status).toBe("running");
    expect(state.analysisRun.sources.google_trends?.state).toBe("pending");

    state = run(
      state,
      { type: "analysisEvent", event: { type: "source_start", source: "google_trends" } },
      { type: "analysisEvent", event: { type: "source_done", summary: analysis.sources[0] } },
      { type: "analysisEvent", event: { type: "synthesis_start", signalCount: 2, mode: "ai" } },
    );
    expect(state.analysisRun.sources.google_trends).toEqual({ state: "done", summary: analysis.sources[0] });
    expect(state.analysisRun.synthesis).toEqual({ signalCount: 2, mode: "ai" });
    expect(state.announcement).toContain("Claude");

    state = run(state, { type: "analysisDone", analysis });
    expect(state.draft.step).toBe("sujets");
    expect(state.draft.analysis?.id).toBe("analysis-1");
    expect(state.draft.form.geo).toBe("BE");
    expect(state.analysisRun.status).toBe("idle");
  });

  it("keeps the request after a failure so it can be retried", () => {
    const state = run(
      fresh(),
      { type: "analysisStart", request: analysis.request },
      { type: "analysisFailed", message: "Réseau indisponible" },
    );
    expect(state.analysisRun).toMatchObject({ status: "error", error: "Réseau indisponible" });
    expect(state.analysisRun.request).toEqual(analysis.request);
    expect(run(state, { type: "analysisReset" }).analysisRun.status).toBe("idle");
  });

  it("selecting a topic resets the angle and script, and takes the analysis country and language", () => {
    const angle = fixtureTopic.angles[0];
    let state = run(
      fresh(),
      { type: "analysisDone", analysis },
      { type: "selectTopic", topic: fixtureTopic, evidence: fixtureSignals },
      { type: "commitAngle", angle },
    );
    expect(state.draft.step).toBe("script");
    expect(state.draft.geo).toBe("BE");

    state = run(state, {
      type: "scriptDone",
      script: script(),
      settings: fixtureSettings,
      topicId: fixtureTopic.id,
      angleId: angle.id,
      saved: { ok: true, evicted: 0 },
    });
    expect(state.draft.result?.script.id).toBe("script-1");
    expect(state.saveNotice).toEqual({ scriptId: "script-1", ok: true, evicted: 0 });

    // Same topic again: nothing lost.
    const same = run(state, { type: "selectTopic", topic: fixtureTopic, evidence: fixtureSignals });
    expect(same.draft.step).toBe("angle");
    expect(same.draft.result?.script.id).toBe("script-1");

    // Another topic: angle and script cleared.
    const other = run(state, { type: "selectTopic", topic: analysis.topics[1], evidence: [] });
    expect(other.draft.topic?.id).toBe("topic-2");
    expect(other.draft.angle).toBeNull();
    expect(other.draft.result).toBeNull();
  });

  it("re-committing the same custom angle keeps the script; a different one clears it", () => {
    const custom: Angle = { id: "custom-1", type: "custom", title: "Mon angle", pitch: "Pitch", hook: "", whyItWorks: "" };
    let state = run(
      fresh(),
      { type: "analysisDone", analysis },
      { type: "selectTopic", topic: fixtureTopic, evidence: fixtureSignals },
      { type: "commitAngle", angle: custom },
      {
        type: "scriptDone",
        script: script(),
        settings: fixtureSettings,
        topicId: fixtureTopic.id,
        angleId: custom.id,
        saved: { ok: true, evicted: 0 },
      },
    );
    state = run(state, { type: "goTo", step: "angle" }, { type: "commitAngle", angle: { ...custom, id: "custom-2" } });
    expect(state.draft.result).not.toBeNull();
    expect(state.draft.angle?.id).toBe("custom-1");

    state = run(state, { type: "commitAngle", angle: { ...custom, id: "custom-3", title: "Autre angle" } });
    expect(state.draft.result).toBeNull();
    expect(state.draft.angle?.id).toBe("custom-3");
  });

  it("drops a late script result that belongs to another topic", () => {
    const angle = fixtureTopic.angles[0];
    const state = run(
      fresh(),
      { type: "analysisDone", analysis },
      { type: "selectTopic", topic: fixtureTopic, evidence: fixtureSignals },
      { type: "commitAngle", angle },
      { type: "scriptStart", kind: "generate", instruction: null, research: true },
      { type: "selectTopic", topic: analysis.topics[1] as Topic, evidence: [] },
      {
        type: "scriptDone",
        script: script(),
        settings: fixtureSettings,
        topicId: fixtureTopic.id,
        angleId: angle.id,
        saved: { ok: true, evicted: 0 },
      },
    );
    expect(state.draft.result).toBeNull();
    expect(state.scriptRun.status).toBe("idle");
  });

  it("follows script progress events and hook selection", () => {
    const angle = fixtureTopic.angles[0];
    let state = run(
      fresh(),
      { type: "analysisDone", analysis },
      { type: "selectTopic", topic: fixtureTopic, evidence: fixtureSignals },
      { type: "commitAngle", angle },
      { type: "scriptStart", kind: "generate", instruction: null, research: true },
      { type: "scriptEvent", event: { type: "status", step: "research", message: "Recherche…" } },
      { type: "scriptEvent", event: { type: "research", brief: { facts: "- fait", sources: [] } } },
      { type: "scriptEvent", event: { type: "progress", chars: 1200 } },
    );
    expect(state.scriptRun).toMatchObject({ status: "running", phase: "research", chars: 1200 });
    expect(state.scriptRun.brief?.facts).toBe("- fait");

    state = run(
      state,
      {
        type: "scriptDone",
        script: script(),
        settings: fixtureSettings,
        topicId: fixtureTopic.id,
        angleId: angle.id,
        saved: { ok: false, evicted: 0 },
      },
      { type: "selectHook", index: 2 },
    );
    expect(state.draft.result?.hookIndex).toBe(2);
    expect(state.saveNotice?.ok).toBe(false);
    expect(run(state, { type: "selectHook", index: 9 })).toBe(state);
  });
});

describe("normalizeSettings", () => {
  it("keeps valid fields and replaces invalid ones with defaults", () => {
    const settings = normalizeSettings({ ...fixtureSettings, durationSec: 42, tone: "inconnu", virality: 10 }, "fr");
    expect(settings.durationSec).toBe(45);
    expect(settings.tone).toBe("decontracte");
    expect(settings.virality).toBe(10);
    expect(settings.hookStyle).toBe("contre_intuitif");
  });

  it("returns defaults for garbage", () => {
    expect(normalizeSettings("nope", "en").language).toBe("en");
  });
});
