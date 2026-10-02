import { describe, expect, it } from "vitest";
import { fixtureSettings, fixtureSignals, fixtureTopic } from "@/lib/script/__fixtures__/script";
import type { SourceStatus, Topic } from "@/lib/types";
import {
  cleanSettings,
  effectiveSources,
  evidenceFor,
  filterTopics,
  hashtagLine,
  hasNiche,
  hostnameOf,
  platformCounts,
  safeHref,
  sortTopics,
  splitPlaceholders,
} from "./studio-utils";

function topic(id: string, scores: Partial<Topic["scores"]>, extra: Partial<Topic> = {}): Topic {
  return {
    ...fixtureTopic,
    id,
    scores: { ...fixtureTopic.scores, ...scores },
    ...extra,
  };
}

function source(id: SourceStatus["id"], configured: boolean, free: boolean): SourceStatus {
  return {
    id,
    label: id,
    platform: "google",
    configured,
    free,
    needsKeywords: false,
    description: "",
    envVars: [],
    setup: [],
    costNote: "",
    docsUrl: "",
  };
}

describe("sortTopics", () => {
  const topics = [
    topic("a", { total: 50, momentum: 90, freshness: 10, nicheFit: 20 }),
    topic("b", { total: 80, momentum: 40, freshness: 70, nicheFit: 90 }),
    topic("c", { total: 65, momentum: 40, freshness: 95, nicheFit: 50 }),
  ];

  it("sorts by the chosen score, ties broken by total", () => {
    expect(sortTopics(topics, "score").map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(sortTopics(topics, "momentum").map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(sortTopics(topics, "freshness").map((t) => t.id)).toEqual(["c", "b", "a"]);
    expect(sortTopics(topics, "niche").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input", () => {
    const copy = [...topics];
    sortTopics(topics, "momentum");
    expect(topics).toEqual(copy);
  });
});

describe("filterTopics / platformCounts", () => {
  const topics = [
    topic("a", {}, { platforms: ["google", "news"] }),
    topic("b", {}, { platforms: ["tiktok"], sensitivity: { level: "elevee", reason: "Drame" } }),
    topic("c", {}, { platforms: ["tiktok", "youtube"], sensitivity: { level: "moyenne", reason: "Santé" } }),
  ];

  it("filters by platform (any match) and hides only highly sensitive topics", () => {
    expect(filterTopics(topics, { platforms: [], hideSensitive: false }).visible).toHaveLength(3);
    const tiktok = filterTopics(topics, { platforms: ["tiktok"], hideSensitive: true });
    expect(tiktok.visible.map((t) => t.id)).toEqual(["c"]);
    expect(tiktok.hiddenSensitive).toBe(1);
    expect(filterTopics(topics, { platforms: ["news", "youtube"], hideSensitive: false }).visible.map((t) => t.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("counts topics per platform in a stable order", () => {
    expect(platformCounts(topics)).toEqual([
      { platform: "google", count: 1 },
      { platform: "news", count: 1 },
      { platform: "youtube", count: 1 },
      { platform: "tiktok", count: 2 },
    ]);
  });
});

describe("evidenceFor", () => {
  it("resolves ids, skips unknown ones and sorts by strength", () => {
    const map = new Map(fixtureSignals.map((signal) => [signal.id, signal]));
    const evidence = evidenceFor({ ...fixtureTopic, signalIds: ["google_news:def2", "missing", "google_trends:abc1"] }, map);
    expect(evidence.map((signal) => signal.id)).toEqual(["google_trends:abc1", "google_news:def2"]);
  });
});

describe("sources", () => {
  const statuses = [
    source("google_trends", true, true),
    source("youtube", false, true),
    source("tiktok_apify", true, false),
    source("wikipedia", true, true),
  ];

  it("defaults to the free configured sources", () => {
    expect(effectiveSources(null, statuses)).toEqual(["google_trends", "wikipedia"]);
  });

  it("keeps an explicit choice but drops unconfigured sources", () => {
    expect(effectiveSources(["youtube", "tiktok_apify"], statuses)).toEqual(["tiktok_apify"]);
    expect(effectiveSources(["youtube"], null)).toEqual(["youtube"]);
  });
});

describe("links", () => {
  it("only accepts http(s) URLs", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("/relative")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(hostnameOf("https://www.lemonde.fr/x")).toBe("lemonde.fr");
    expect(hostnameOf("nope")).toBe("");
  });
});

describe("request shaping", () => {
  it("drops empty optional texts and irrelevant CTA details", () => {
    const cleaned = cleanSettings({ ...fixtureSettings, cta: "save", ctaDetail: "GUIDE", extraInstructions: "  " });
    expect(cleaned).not.toHaveProperty("ctaDetail");
    expect(cleaned).not.toHaveProperty("extraInstructions");
    const kept = cleanSettings({ ...fixtureSettings, cta: "comment_keyword", ctaDetail: " GUIDE ", extraInstructions: " court " });
    expect(kept.ctaDetail).toBe("GUIDE");
    expect(kept.extraInstructions).toBe("court");
  });

  it("formats hashtags and detects niche", () => {
    expect(hashtagLine(["#a", "b", " ", "##c"])).toBe("#a #b #c");
    expect(hasNiche({ niche: " ", keywords: [] })).toBe(false);
    expect(hasNiche({ niche: "", keywords: ["crypto"] })).toBe(true);
  });

  it("splits placeholders", () => {
    expect(splitPlaceholders("Il y a {À VÉRIFIER : 12 %} de hausse.")).toEqual([
      { text: "Il y a ", placeholder: false },
      { text: "{À VÉRIFIER : 12 %}", placeholder: true },
      { text: " de hausse.", placeholder: false },
    ]);
    expect(splitPlaceholders("")).toEqual([]);
  });
});
