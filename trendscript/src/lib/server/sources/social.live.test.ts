/**
 * Live smoke test against the real, keyless YouTube channel feeds.
 * Run with: npx vitest run --config vitest.live.config.mts src/lib/server/sources/social.live.test.ts
 * (The paid connectors — Apify, Meta Graph, YouTube Data API — need keys and
 * are covered by unit tests on their exact requests instead.)
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_FR_CHANNELS, youtubeRssConnector } from "./youtube-rss";

describe("youtubeRssConnector (live, FR)", () => {
  it("returns recent videos from the curated French channels", async () => {
    const now = Date.now();
    const result = await youtubeRssConnector.fetch({
      geo: "FR",
      language: "fr",
      niche: "",
      keywords: [],
      signal: AbortSignal.timeout(45_000),
      now,
      env: {},
    });

    const authors = new Set(result.signals.map((s) => s.author));
    const shorts = result.signals.filter((s) => s.kind === "short_video").length;
    const withViews = result.signals.filter((s) => (s.metrics.views ?? 0) > 0).length;
    console.info(
      `[live] youtube_rss FR: ${result.signals.length} signals from ${authors.size}/${DEFAULT_FR_CHANNELS.length} channels, ${shorts} shorts, ${withViews} with views; warning=${result.warning ?? "none"}`,
    );
    for (const s of result.signals.slice(0, 3)) {
      console.info(`[live]   ${s.author} | ${s.kind} | ${s.metrics.views ?? "?"} vues | ${s.title}`);
    }

    expect(result.signals.length).toBeGreaterThan(10);
    expect(authors.size).toBeGreaterThanOrEqual(5);
    expect(shorts).toBeGreaterThan(0);
    expect(withViews).toBeGreaterThan(result.signals.length / 2);
    for (const signal of result.signals) {
      expect(signal.source).toBe("youtube_rss");
      expect(signal.platform).toBe("youtube");
      expect(signal.url).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|shorts\/)[\w-]{11}$/);
      expect(Date.parse(signal.publishedAt!)).toBeGreaterThan(now - 72 * 3_600_000);
      expect(signal.title.length).toBeGreaterThan(0);
    }
  });
});
