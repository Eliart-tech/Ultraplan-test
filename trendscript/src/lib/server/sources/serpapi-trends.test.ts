import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import {
  parseRelatedQueries,
  parseTrendingNow,
  risingQueryToSignal,
  serpapiRelatedQueries,
  serpapiTrendsConnector,
} from "./serpapi-trends";
import type { SourceContext } from "./types";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
/** SerpApi documentation samples (real responses published on serpapi.com). */
const TRENDING = fixture("serpapi-trending-now.US.json");
const RELATED = fixture("serpapi-related-queries.json");
const INVALID_KEY = fixture("serpapi-error.invalid-key.json");
const KEY = "secret-key-123";

function ctx(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "US",
    language: "en",
    niche: "",
    keywords: [],
    signal: AbortSignal.timeout(10_000),
    now: Date.parse("2026-01-03T14:25:00Z"),
    env: { SERPAPI_API_KEY: KEY },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTrendingNow", () => {
  const trends = parseTrendingNow(JSON.parse(TRENDING));

  it("maps active and ended trends", () => {
    expect(trends.map((trend) => trend.query)).toEqual(["venezuela", "cnn", "akay diamonds", "usc vs michigan", "bbc"]);
    expect(trends[0]).toMatchObject({ searchVolume: 2_000_000, increasePct: 1000, categoryIds: [11], endedAt: undefined });
    expect(trends[0].startedAt).toBe(1767421200 * 1000);
    const ended = trends.find((trend) => trend.query === "usc vs michigan")!;
    expect(ended.endedAt).toBe(1767449400 * 1000);
    expect(trends.find((trend) => trend.query === "akay diamonds")!.categoryIds).toEqual([10, 16]);
  });

  it("tolerates a missing trend_breakdown and a missing list", () => {
    expect(trends.find((trend) => trend.query === "bbc")!.breakdown).toEqual([]);
    expect(parseTrendingNow({ search_metadata: {} })).toEqual([]);
  });
});

describe("parseRelatedQueries", () => {
  it("reads rising and top lists and flags breakouts", () => {
    const related = parseRelatedQueries(JSON.parse(RELATED));
    expect(related.rising).toHaveLength(3);
    expect(related.rising[0]).toMatchObject({ query: "usagi coffee", value: "Breakout", extractedValue: 8700, breakout: true });
    expect(related.rising[2]).toMatchObject({ query: "crep and coffee", extractedValue: 4500, breakout: false });
    expect(related.top[0]).toMatchObject({ query: "coffee shop", extractedValue: 100 });
    expect(parseRelatedQueries({})).toEqual({ rising: [], top: [] });
    expect(parseRelatedQueries({ related_queries: { rising: [{ query: "café", value: "Record" }] } }).rising[0].breakout).toBe(true);
  });
});

describe("risingQueryToSignal", () => {
  it("builds a keyword-tagged search trend", () => {
    const [first] = parseRelatedQueries(JSON.parse(RELATED)).rising;
    const signal = risingQueryToSignal(first, { keyword: "Coffee", geo: "FR", position: 1 });
    expect(signal).toMatchObject({
      source: "serpapi_trends",
      platform: "google",
      kind: "search_trend",
      title: "usagi coffee",
      url: "https://trends.google.com/trends/explore?q=usagi+coffee&date=today+12-m&geo=FR",
      metrics: { rank: 1, increasePct: 8700 },
      tags: ["coffee"],
      query: "Coffee",
      strength: 0,
    });
    expect(signal.text).toMatch(/« Record »/);
  });
});

describe("serpapiRelatedQueries", () => {
  it("sends the documented parameters and parses the answer", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(RELATED, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const related = await serpapiRelatedQueries("#coffee", {
      geo: "fr",
      language: "fr",
      signal: AbortSignal.timeout(5000),
      apiKey: KEY,
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "google_trends",
      data_type: "RELATED_QUERIES",
      q: "coffee",
      geo: "FR",
      hl: "fr",
      date: "now 7-d",
      api_key: KEY,
    });
    expect(related.rising).toHaveLength(3);
  });

  it("maps errors to French messages without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(INVALID_KEY, { status: 401 })));
    const error = await serpapiRelatedQueries("coffee", { geo: "FR", language: "fr", signal: AbortSignal.timeout(5000), apiKey: KEY }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).message).toBe("Clé SerpApi invalide : vérifiez SERPAPI_API_KEY.");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"Your account has run out of searches."}', { status: 429 })),
    );
    await expect(
      serpapiRelatedQueries("coffee", { geo: "FR", language: "fr", signal: AbortSignal.timeout(5000), apiKey: KEY }),
    ).rejects.toThrow(/Crédits SerpApi épuisés/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`{"error":"Bad request https://serpapi.com/search?api_key=${KEY}&q=x"}`, { status: 400 })),
    );
    const leaked = (await serpapiRelatedQueries("coffee", {
      geo: "FR",
      language: "fr",
      signal: AbortSignal.timeout(5000),
      apiKey: KEY,
    }).catch((e: unknown) => e)) as Error;
    expect(leaked).toBeInstanceOf(SourceError);
    expect(leaked.message).toContain("api_key=***");
    expect(leaked.message).not.toContain(KEY);
  });

  it("treats 'no results' as an empty answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"Google Trends hasn\'t returned any results for this query."}', { status: 200 })),
    );
    await expect(
      serpapiRelatedQueries("zzzz", { geo: "FR", language: "fr", signal: AbortSignal.timeout(5000), apiKey: KEY }),
    ).resolves.toEqual({ rising: [], top: [] });
  });
});

describe("serpapiTrendsConnector", () => {
  it("is configured only with SERPAPI_API_KEY", () => {
    expect(serpapiTrendsConnector.isConfigured({})).toBe(false);
    expect(serpapiTrendsConnector.isConfigured({ SERPAPI_API_KEY: "  " })).toBe(false);
    expect(serpapiTrendsConnector.isConfigured({ SERPAPI_API_KEY: KEY })).toBe(true);
    expect(serpapiTrendsConnector.meta.envVars).toEqual(["SERPAPI_API_KEY"]);
  });

  it("spends 1 search for trending now + 1 per keyword (3 max)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(url.includes("google_trends_trending_now") ? TRENDING : RELATED, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await serpapiTrendsConnector.fetch(ctx({ keywords: ["coffee", "café", "thé", "matcha"] }));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.warning).toBeUndefined();
    const trending = result.signals.filter((signal) => signal.metrics.searchVolume !== undefined);
    expect(trending).toHaveLength(5);
    expect(trending.find((signal) => signal.title === "usc vs michigan")!.text).toMatch(/tendance terminée/);
    // Same rising queries for the 3 keywords: one signal each, tagged with every keyword.
    const rising = result.signals.filter((signal) => signal.metrics.searchVolume === undefined);
    expect(rising).toHaveLength(3);
    expect(rising[0].tags).toEqual(["coffee", "café", "thé"]);
    expect(new Set(result.signals.map((signal) => signal.id)).size).toBe(result.signals.length);
  });

  it("fails with the first French error when every call failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(INVALID_KEY, { status: 401 })));
    await expect(serpapiTrendsConnector.fetch(ctx({ keywords: ["coffee"] }))).rejects.toThrow(
      "Clé SerpApi invalide : vérifiez SERPAPI_API_KEY.",
    );
  });
});
