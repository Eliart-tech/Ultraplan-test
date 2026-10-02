import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeEvent, AnalyzeRequest, Platform, Signal, SignalKind, SourceId, Topic } from "../types";
import { describeAiError, getAnthropic } from "./ai/client";
import { synthesizeTopics } from "./ai/synthesize";
import {
  NO_AI_NOTE,
  cacheKey,
  canonicalUrl,
  dedupeSignals,
  runAnalysis,
  selectForSynthesis,
} from "./analyze";
import { clearCache } from "./cache";
import { SourceError } from "./http";
import type { SourceConnector, SourceContext, SourceFetchResult, SourceMeta } from "./sources/types";

vi.mock("./ai/client", () => ({
  getAnthropic: vi.fn(() => null),
  aiModel: vi.fn(() => "claude-test-model"),
  describeAiError: vi.fn((error: unknown) => (error instanceof Error ? error.message : "erreur inconnue")),
}));
vi.mock("./ai/synthesize", () => ({ synthesizeTopics: vi.fn() }));

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const HOUR = 3_600_000;

let counter = 0;
function makeSignal(
  source: SourceId,
  platform: Platform,
  kind: SignalKind,
  title: string,
  extra: Partial<Signal> = {},
): Signal {
  counter++;
  return {
    id: `${source}:${counter}`,
    source,
    platform,
    kind,
    title,
    url: `https://example.com/${source}/${counter}`,
    publishedAt: new Date(NOW - 2 * HOUR).toISOString(),
    metrics: {},
    tags: [],
    related: [],
    strength: 0,
    ...extra,
  };
}

function meta(label: string, overrides: Partial<SourceMeta> = {}): SourceMeta {
  return {
    label,
    platform: "google",
    free: true,
    needsKeywords: false,
    description: "",
    envVars: [],
    setup: [],
    costNote: "",
    docsUrl: "https://example.com",
    ttlMs: 60_000,
    ...overrides,
  };
}

function connector(
  id: SourceId,
  fetch: (ctx: SourceContext) => Promise<SourceFetchResult>,
  options: { configured?: boolean; meta?: Partial<SourceMeta> } = {},
): SourceConnector {
  return {
    id,
    meta: meta(`Source ${id}`, options.meta),
    isConfigured: () => options.configured ?? true,
    fetch: vi.fn(fetch),
  };
}

const baseRequest: AnalyzeRequest = {
  geo: "FR",
  language: "fr",
  niche: "",
  keywords: [],
  sources: ["google_trends", "google_news", "youtube", "instagram_apify", "tiktok_apify"],
  maxTopics: 8,
};

function fixtureConnectors() {
  const trends = [
    makeSignal("google_trends", "google", "search_trend", "Réforme des retraites", {
      metrics: { searchVolume: 200_000, increasePct: 1000 },
    }),
    makeSignal("google_trends", "google", "search_trend", "PSG Marseille", { metrics: { searchVolume: 500_000 } }),
    makeSignal("google_trends", "google", "search_trend", "Nouvel iPhone", { metrics: { searchVolume: 50_000 } }),
  ];
  const news = [
    makeSignal("google_news", "news", "news", "Réforme des retraites : le Sénat vote le texte", {
      url: "https://lemonde.fr/article-retraites?utm_source=rss",
    }),
    // Same article, other tracking params → duplicate URL.
    makeSignal("google_news", "news", "news", "Réforme des retraites : le Sénat vote le texte (maj)", {
      url: "https://www.lemonde.fr/article-retraites/",
    }),
    // Same headline from the same source → duplicate title.
    makeSignal("google_news", "news", "news", "PSG–Marseille : les compositions", {
      url: "https://a.example/psg",
      tags: ["foot"],
    }),
    makeSignal("google_news", "news", "news", "PSG Marseille : les compositions !", {
      url: "https://b.example/psg",
      tags: ["ligue 1"],
    }),
  ];
  return {
    google_trends: connector("google_trends", async () => ({ signals: trends })),
    google_news: connector("google_news", async () => ({ signals: news, warning: "Flux partiel." }), {
      meta: { platform: "news" },
    }),
    youtube: connector("youtube", async () => ({ signals: [] }), {
      configured: false,
      meta: { platform: "youtube", envVars: ["YOUTUBE_API_KEY"], label: "YouTube (API officielle)" },
    }),
    instagram_apify: connector("instagram_apify", async () => ({ signals: [] }), {
      meta: { platform: "instagram", needsKeywords: true, envVars: ["APIFY_TOKEN"], label: "Instagram Reels (Apify)" },
    }),
    tiktok_apify: connector(
      "tiktok_apify",
      async () => {
        throw new SourceError("Apify a répondu 401 : https://api.apify.com/v2/acts?token=apify_api_SECRET123456", 401);
      },
      { meta: { platform: "tiktok", label: "TikTok (Apify)" } },
    ),
  } satisfies Partial<Record<SourceId, SourceConnector>>;
}

async function run(request: AnalyzeRequest, connectors: Partial<Record<SourceId, SourceConnector>>, signal?: AbortSignal) {
  const events: AnalyzeEvent[] = [];
  const analysis = await runAnalysis(
    request,
    (event) => events.push(event),
    signal ?? new AbortController().signal,
    { APIFY_TOKEN: "apify_api_SECRET123456" },
    { connectors, now: NOW },
  );
  return { analysis, events };
}

function aiTopic(signalIds: string[], title = "Retraites : le Sénat a voté"): Topic {
  return {
    id: "topic-ai-1",
    title,
    summary: "Résumé.",
    whyNow: "Parce que.",
    category: "Politique",
    platforms: ["google", "news"],
    signalIds,
    keywords: ["retraites"],
    lifespan: "court",
    saturation: "moyenne",
    sensitivity: { level: "moyenne", reason: "Politique." },
    scores: { momentum: 80, reach: 70, crossPlatform: 55, freshness: 90, nicheFit: 0, total: 72 },
    angles: [],
  };
}

beforeEach(() => {
  clearCache();
  vi.mocked(getAnthropic).mockReturnValue(null);
  vi.mocked(synthesizeTopics).mockReset();
});

describe("runAnalysis — sources", () => {
  it("streams events in order and summarises every source honestly", async () => {
    const connectors = fixtureConnectors();
    const { analysis, events } = await run(baseRequest, connectors);

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "source_start")).toHaveLength(5);
    expect(types.filter((t) => t === "source_done")).toHaveLength(5);
    const synthesisIndex = types.indexOf("synthesis_start");
    expect(synthesisIndex).toBe(types.lastIndexOf("source_done") + 1);
    expect(types.at(-1)).toBe("result");
    expect(types.filter((t) => t === "result")).toHaveLength(1);
    for (const id of baseRequest.sources) {
      const start = events.findIndex((e) => e.type === "source_start" && e.source === id);
      const done = events.findIndex((e) => e.type === "source_done" && e.summary.source === id);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(done).toBeGreaterThan(start);
    }

    const summary = (id: SourceId) => analysis.sources.find((s) => s.source === id);
    expect(summary("google_trends")).toMatchObject({ ok: true, count: 3, cached: false });
    expect(summary("google_news")).toMatchObject({ ok: true, count: 4, warning: "Flux partiel." });
    expect(summary("youtube")).toMatchObject({ ok: true, skipped: true, count: 0 });
    expect(summary("youtube")?.warning).toContain("YOUTUBE_API_KEY");
    expect(summary("instagram_apify")).toMatchObject({ ok: true, count: 0 });
    expect(summary("instagram_apify")?.skipped).toBeUndefined();
    expect(summary("instagram_apify")?.warning).toMatch(/mots-clés/);
    expect(connectors.instagram_apify.fetch).not.toHaveBeenCalled();
    expect(connectors.youtube.fetch).not.toHaveBeenCalled();
    expect(summary("tiktok_apify")).toMatchObject({ ok: false, count: 0 });
    expect(summary("tiktok_apify")?.error).toContain("401");
    expect(summary("tiktok_apify")?.error).not.toContain("SECRET");

    expect(analysis.notes.some((n) => n.includes("non configurées") && n.includes("YouTube (API officielle)"))).toBe(true);
    expect(analysis.notes.some((n) => n.includes("en échec") && n.includes("TikTok (Apify)"))).toBe(true);
  });

  it("passes the run context to connectors with a timeout-only signal", async () => {
    const connectors = fixtureConnectors();
    const request = { ...baseRequest, keywords: ["retraite", "ia"], niche: "finance perso" };
    const controller = new AbortController();
    await run(request, connectors, controller.signal);
    const ctx = vi.mocked(connectors.google_trends.fetch).mock.calls[0][0];
    expect(ctx).toMatchObject({ geo: "FR", language: "fr", niche: "finance perso", keywords: ["retraite", "ia"], now: NOW });
    expect(ctx.signal).not.toBe(controller.signal);
    expect(connectors.instagram_apify.fetch).toHaveBeenCalledTimes(1);
  });

  it("serves the second identical run from the cache without sharing mutable signals", async () => {
    const connectors = fixtureConnectors();
    const first = await run(baseRequest, connectors);
    const second = await run(baseRequest, connectors);
    expect(connectors.google_trends.fetch).toHaveBeenCalledTimes(1);
    expect(second.analysis.sources.find((s) => s.source === "google_trends")?.cached).toBe(true);
    // Failures are never cached.
    expect(connectors.tiktok_apify.fetch).toHaveBeenCalledTimes(2);
    const a = first.analysis.signals.find((s) => s.source === "google_trends");
    const b = second.analysis.signals.find((s) => s.id === a?.id);
    expect(a).toBeDefined();
    expect(b).not.toBe(a);
  });

  it("times out a connector that never answers", async () => {
    const hanging = connector("google_trends", () => new Promise<SourceFetchResult>(() => {}));
    const events: AnalyzeEvent[] = [];
    const analysis = await runAnalysis(
      { ...baseRequest, sources: ["google_trends"] },
      (e) => events.push(e),
      new AbortController().signal,
      {},
      { connectors: { google_trends: hanging }, now: NOW, sourceTimeoutMs: 20 },
    );
    expect(analysis.sources[0]).toMatchObject({ ok: false, error: expect.stringMatching(/Délai dépassé/) });
    expect(analysis.topics).toEqual([]);
    expect(analysis.notes.some((n) => n.includes("Aucun signal"))).toBe(true);
  });

  it("stops as soon as the client disconnects", async () => {
    const controller = new AbortController();
    const slow = connector(
      "google_trends",
      () => new Promise<SourceFetchResult>((resolve) => setTimeout(() => resolve({ signals: [] }), 200)),
    );
    const events: AnalyzeEvent[] = [];
    const pending = runAnalysis(
      { ...baseRequest, sources: ["google_trends"] },
      (e) => events.push(e),
      controller.signal,
      {},
      { connectors: { google_trends: slow }, now: NOW },
    );
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow("Analyse annulée.");
    expect(events.map((e) => e.type)).toEqual(["source_start"]);
  });

  it("refuses to start with an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runAnalysis(baseRequest, () => {}, controller.signal, {}, { connectors: fixtureConnectors(), now: NOW }),
    ).rejects.toThrow("Analyse annulée.");
  });
});

describe("runAnalysis — synthesis", () => {
  it("falls back to deterministic topics with a clear note when no Anthropic key is set", async () => {
    const { analysis, events } = await run(baseRequest, fixtureConnectors());
    expect(synthesizeTopics).not.toHaveBeenCalled();
    expect(events.find((e) => e.type === "synthesis_start")).toMatchObject({ mode: "basic" });
    expect(analysis.mode).toBe("basic");
    expect(analysis.model).toBeUndefined();
    expect(analysis.notes).toContain(NO_AI_NOTE);
    expect(NO_AI_NOTE).toContain("ANTHROPIC_API_KEY");
    expect(analysis.topics.length).toBeGreaterThan(0);
    expect(analysis.topics.every((t) => t.angles.length === 0)).toBe(true);

    // Dedupe: 3 trends + 4 news − 1 duplicate URL − 1 duplicate title.
    expect(analysis.signals).toHaveLength(5);
    const ids = new Set(analysis.signals.map((s) => s.id));
    for (const topic of analysis.topics) for (const id of topic.signalIds) expect(ids.has(id)).toBe(true);
    // Scoring ran.
    expect(analysis.signals.some((s) => s.strength > 0)).toBe(true);
  });

  it("uses Claude's topics when a key is configured", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    vi.mocked(synthesizeTopics).mockImplementation(async ({ signals }) => [
      aiTopic(signals.filter((s) => s.title.includes("retraites") || s.title.includes("Réforme")).map((s) => s.id)),
    ]);
    const request = { ...baseRequest, niche: "politique", keywords: ["retraites"] };
    const { analysis, events } = await run(request, fixtureConnectors());

    expect(synthesizeTopics).toHaveBeenCalledTimes(1);
    const args = vi.mocked(synthesizeTopics).mock.calls[0][0];
    expect(args.request).toEqual(request);
    expect(args.now).toBe(NOW);
    expect(args.signals).toHaveLength(5);
    expect(events.find((e) => e.type === "synthesis_start")).toMatchObject({ mode: "ai", signalCount: 5 });
    expect(analysis.mode).toBe("ai");
    expect(analysis.model).toBe("claude-test-model");
    expect(analysis.topics.map((t) => t.title)).toEqual(["Retraites : le Sénat a voté"]);
    expect(analysis.topics[0].signalIds.length).toBeGreaterThan(0);
    expect(analysis.notes).not.toContain(NO_AI_NOTE);
  });

  it("drops evidence ids that don't exist and topics left without evidence", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    vi.mocked(synthesizeTopics).mockImplementation(async ({ signals }) => [
      aiTopic([signals[0].id, "google_news:inexistant"], "Sujet étayé"),
      { ...aiTopic(["inconnu:1"], "Sujet inventé"), id: "topic-ai-2" },
    ]);
    const { analysis } = await run(baseRequest, fixtureConnectors());
    expect(analysis.topics.map((t) => t.title)).toEqual(["Sujet étayé"]);
    expect(analysis.topics[0].signalIds).toHaveLength(1);
  });

  it("falls back to deterministic topics when Claude fails", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    vi.mocked(synthesizeTopics).mockRejectedValue(new Error("Limite de débit Claude atteinte : réessayez dans une minute."));
    const { analysis, events } = await run(baseRequest, fixtureConnectors());

    expect(describeAiError).toHaveBeenCalled();
    expect(events.find((e) => e.type === "synthesis_start")).toMatchObject({ mode: "ai" });
    expect(analysis.mode).toBe("basic");
    expect(analysis.model).toBeUndefined();
    expect(analysis.topics.length).toBeGreaterThan(0);
    expect(analysis.notes.some((n) => n.includes("Synthèse IA indisponible") && n.includes("réessayez dans une minute"))).toBe(true);
    expect(events.at(-1)?.type).toBe("result");
  });

  it("falls back when Claude returns no topic", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    vi.mocked(synthesizeTopics).mockResolvedValue([]);
    const { analysis } = await run(baseRequest, fixtureConnectors());
    expect(analysis.mode).toBe("basic");
    expect(analysis.topics.length).toBeGreaterThan(0);
  });

  it("does not call Claude when there is nothing to analyse", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    const empty = connector("google_trends", async () => ({ signals: [] }));
    const { analysis } = await run({ ...baseRequest, sources: ["google_trends"] }, { google_trends: empty });
    expect(synthesizeTopics).not.toHaveBeenCalled();
    expect(analysis.topics).toEqual([]);
  });
});

describe("dedupeSignals", () => {
  it("merges duplicates by URL across sources and keeps what the duplicate adds", () => {
    const rss = makeSignal("youtube_rss", "youtube", "short_video", "Le JT", {
      url: "https://www.youtube.com/shorts/abc123",
      metrics: { views: 1000 },
    });
    const api = makeSignal("youtube", "youtube", "short_video", "Le JT", {
      url: "https://www.youtube.com/watch?v=abc123",
      metrics: { views: 1200, likes: 50, durationSec: 40 },
      tags: ["info"],
    });
    const [kept, ...rest] = dedupeSignals([rss, api]);
    expect(rest).toHaveLength(0);
    expect(kept.id).toBe(rss.id);
    expect(kept.metrics).toEqual({ views: 1000, likes: 50, durationSec: 40 });
    expect(kept.tags).toEqual(["info"]);
  });

  it("never merges two videos only because they share a title", () => {
    const a = makeSignal("youtube_rss", "youtube", "video", "Le JT de 20h");
    const b = makeSignal("youtube_rss", "youtube", "video", "Le JT de 20h");
    expect(dedupeSignals([a, b])).toHaveLength(2);
  });

  it("merges same-source headlines but not the same headline from two sources", () => {
    const a = makeSignal("google_news", "news", "news", "Élection : résultats");
    const b = makeSignal("google_news", "news", "news", "Election — résultats");
    const c = makeSignal("google_trends", "google", "search_trend", "Élection : résultats");
    expect(dedupeSignals([a, b, c]).map((s) => s.id)).toEqual([a.id, c.id]);
  });

  it("drops repeated ids", () => {
    const a = makeSignal("wikipedia", "wikipedia", "article_views", "Paris");
    expect(dedupeSignals([a, { ...a, url: "https://other.example" }])).toHaveLength(1);
  });
});

describe("selectForSynthesis", () => {
  it("returns everything when under the cap", () => {
    const signals = [makeSignal("google_news", "news", "news", "A", { strength: 10 })];
    expect(selectForSynthesis(signals)).toEqual(signals);
  });

  it("caps at 160 while keeping the top 25 of every platform", () => {
    const signals: Signal[] = [];
    for (let i = 0; i < 200; i++) signals.push(makeSignal("google_news", "news", "news", `News ${i}`, { strength: 90 }));
    for (let i = 0; i < 40; i++) signals.push(makeSignal("tiktok_apify", "tiktok", "short_video", `TT ${i}`, { strength: 5 + i }));
    for (let i = 0; i < 10; i++) signals.push(makeSignal("wikipedia", "wikipedia", "article_views", `W ${i}`, { strength: 1 }));
    const selected = selectForSynthesis(signals);
    expect(selected).toHaveLength(160);
    const count = (platform: Platform) => selected.filter((s) => s.platform === platform).length;
    expect(count("tiktok")).toBeGreaterThanOrEqual(25);
    expect(count("wikipedia")).toBe(10);
    // The TikTok signals kept are the strongest ones.
    expect(Math.min(...selected.filter((s) => s.platform === "tiktok").map((s) => s.strength))).toBe(5 + 15);
    // Sorted by strength.
    expect(selected.map((s) => s.strength)).toEqual([...selected.map((s) => s.strength)].sort((a, b) => b - a));
  });
});

describe("helpers", () => {
  it("canonicalises URLs", () => {
    expect(canonicalUrl("https://www.youtube.com/shorts/abc_-1")).toBe("youtube.com/watch?v=abc_-1");
    expect(canonicalUrl("https://youtu.be/abc_-1")).toBe("youtube.com/watch?v=abc_-1");
    expect(canonicalUrl("https://m.youtube.com/watch?v=abc_-1&t=3")).toBe("youtube.com/watch?v=abc_-1");
    expect(canonicalUrl("https://www.LeMonde.fr/a/?utm_source=x&id=2#top")).toBe("lemonde.fr/a?id=2");
    expect(canonicalUrl(undefined)).toBeUndefined();
    expect(canonicalUrl("pas une url")).toBe("pas une url");
  });

  it("builds order-independent cache keys", () => {
    expect(cacheKey("google_news", { geo: "FR", language: "fr", keywords: ["b", "a", "b"] })).toBe("google_news|FR|fr|a,b");
    expect(cacheKey("google_news", { geo: "FR", language: "fr", keywords: ["a", "b"] })).toBe(
      cacheKey("google_news", { geo: "FR", language: "fr", keywords: ["b", "a"] }),
    );
  });
});
