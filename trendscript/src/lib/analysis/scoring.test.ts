import { describe, expect, it } from "vitest";
import type { Signal } from "@/lib/types";
import { freshness, scoreSignals, scoreTopic } from "./scoring";

const NOW = Date.parse("2026-10-02T12:00:00Z");

function signal(partial: Partial<Signal> & Pick<Signal, "id">): Signal {
  return {
    source: "google_trends",
    platform: "google",
    kind: "search_trend",
    title: partial.id,
    metrics: {},
    tags: [],
    related: [],
    strength: 0,
    ...partial,
  };
}

describe("freshness", () => {
  it("halves every 24 hours and defaults to 50 when unknown", () => {
    expect(freshness("2026-10-02T12:00:00Z", NOW)).toBe(100);
    expect(freshness("2026-10-01T12:00:00Z", NOW)).toBe(50);
    expect(freshness(undefined, NOW)).toBe(50);
  });
});

describe("scoreSignals", () => {
  it("ranks signals within their own source and flags outlier videos", () => {
    const videos = [10, 12, 9, 11, 10, 200].map((k, i) =>
      signal({
        id: `v${i}`,
        source: "instagram_apify",
        platform: "instagram",
        kind: "short_video",
        metrics: { views: k * 1000 },
        publishedAt: "2026-10-02T10:00:00Z",
      }),
    );
    scoreSignals(videos, NOW);
    const viral = videos[5];
    expect(viral.outlier).toBe(true);
    expect(viral.strength).toBeGreaterThan(videos[0].strength);
    expect(videos.filter((v) => v.outlier)).toHaveLength(1);
  });
});

describe("scoreTopic", () => {
  it("rewards cross-platform evidence and keeps totals within 0–100", () => {
    const one = scoreTopic({ signals: [signal({ id: "a", strength: 80 })], now: NOW });
    const two = scoreTopic({
      signals: [
        signal({ id: "a", strength: 80 }),
        signal({ id: "b", strength: 70, platform: "news", kind: "news", source: "google_news" }),
      ],
      nicheFit: 90,
      now: NOW,
    });
    expect(two.crossPlatform).toBeGreaterThan(one.crossPlatform);
    expect(two.total).toBeGreaterThanOrEqual(0);
    expect(two.total).toBeLessThanOrEqual(100);
  });
});
