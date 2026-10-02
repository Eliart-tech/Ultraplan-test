import { describe, expect, it } from "vitest";
import type { AnalyzeEvent } from "../types";
import { runAnalysis } from "./analyze";

/**
 * End-to-end smoke test of the orchestrator against the real, keyless
 * sources (network required): `npm run test:live`. Runs without an
 * Anthropic key, so it exercises the "mode sans IA" path.
 */
describe("runAnalysis (live, free sources)", () => {
  it("turns real FR data into scored topics backed by evidence", async () => {
    const events: AnalyzeEvent[] = [];
    const analysis = await runAnalysis(
      {
        geo: "FR",
        language: "fr",
        niche: "",
        keywords: ["intelligence artificielle"],
        sources: ["google_trends", "google_news", "wikipedia", "youtube_rss", "youtube", "instagram_apify"],
        maxTopics: 8,
      },
      (event) => events.push(event),
      new AbortController().signal,
      {},
    );

    expect(events.at(-1)?.type).toBe("result");
    expect(analysis.mode).toBe("basic");

    const summary = (id: string) => analysis.sources.find((s) => s.source === id);
    expect(summary("youtube")).toMatchObject({ skipped: true });
    expect(summary("instagram_apify")).toMatchObject({ skipped: true });
    const working = analysis.sources.filter((s) => s.ok && s.count > 0);
    // Free endpoints can rate-limit a shared IP; at least two must answer.
    expect(working.length).toBeGreaterThanOrEqual(2);

    expect(analysis.topics.length).toBeGreaterThan(0);
    expect(analysis.topics.length).toBeLessThanOrEqual(8);
    const ids = new Set(analysis.signals.map((s) => s.id));
    expect(ids.size).toBe(analysis.signals.length);
    for (const topic of analysis.topics) {
      expect(topic.signalIds.length).toBeGreaterThan(0);
      for (const id of topic.signalIds) expect(ids.has(id)).toBe(true);
    }
    expect(analysis.signals.length).toBeLessThanOrEqual(250);
    // Printed for manual review of the real output.
    console.info(
      analysis.sources.map((s) => `${s.source}: ${s.ok ? `${s.count} signaux` : s.error}${s.warning ? ` (${s.warning})` : ""}`).join("\n"),
    );
    console.info(analysis.topics.map((t) => `${t.scores.total} · ${t.title} · ${t.platforms.join("/")}`).join("\n"));
  }, 120_000);
});
