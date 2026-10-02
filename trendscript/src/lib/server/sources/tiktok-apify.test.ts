import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitApifyItems } from "./apify";
import {
  TIKTOK_SEARCH_FIELDS,
  TIKTOK_TRENDS_FIELDS,
  buildTiktokSearchInput,
  buildTiktokTrendsInput,
  histogramIncreasePct,
  normalizeTiktokTrends,
  normalizeTiktokVideos,
  tiktokActors,
  tiktokApifyConnector,
  type ApifyTiktokTrendItem,
  type ApifyTiktokVideoItem,
} from "./tiktok-apify";
import type { SourceContext } from "./types";

/** Test fixtures (dataset rows shaped like the actors' documented output). */
const fixture = (name: string) =>
  (JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8")) as { response: unknown[] }).response;
const trendsDataset = fixture("apify-tiktok-trends.FR.json");
const searchDataset = fixture("apify-tiktok-search.json");

const NOW = Date.parse("2025-10-01T12:00:00Z");

function ctx(partial: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "finances perso",
    keywords: ["budget étudiant", "épargne"],
    signal: new AbortController().signal,
    now: NOW,
    env: { APIFY_TOKEN: "apify_api_TEST" },
    ...partial,
  };
}

function apifyRouter(routes: Record<string, () => Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    const key = Object.keys(routes).find((actor) => url.includes(`/actors/${actor}/`));
    if (!key) throw new Error(`unexpected URL ${url}`);
    return routes[key]();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ok = (rows: unknown[]) => () => new Response(JSON.stringify(rows), { status: 201 });
const fail = (status: number, type: string) => () =>
  new Response(JSON.stringify({ error: { type, message: type } }), { status });

afterEach(() => vi.unstubAllGlobals());

describe("request inputs", () => {
  it("asks the Creative Center for 50 trending hashtags of the country over 7 days, nothing else", () => {
    expect(buildTiktokTrendsInput("FR")).toEqual({
      adsScrapeHashtags: true,
      adsCountryCode: "FR",
      adsTimeRange: "7",
      resultsPerPage: 50,
      adsScrapeSounds: false,
      adsScrapeCreators: false,
      adsScrapeVideos: false,
    });
  });

  it("searches the most-liked videos of the week for at most 3 keywords, without downloads", () => {
    expect(buildTiktokSearchInput(["budget", " épargne ", "budget", "bourse", "crypto"])).toEqual({
      searchQueries: ["budget", "épargne", "bourse"],
      searchSection: "/video",
      videoSearchSorting: "MOST_LIKED",
      videoSearchDateFilter: "PAST_WEEK",
      resultsPerPage: 15,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    });
  });

  it("lets env vars swap the actors", () => {
    expect(tiktokActors({})).toEqual({ trends: "clockworks~tiktok-trends-scraper", search: "clockworks~tiktok-scraper" });
    expect(tiktokActors({ APIFY_TIKTOK_ACTOR: "clockworks~free-tiktok-scraper" }).search).toBe("clockworks~free-tiktok-scraper");
  });
});

describe("normalizeTiktokTrends", () => {
  const signals = normalizeTiktokTrends(trendsDataset as ApifyTiktokTrendItem[], "FR");

  it("keeps organic hashtags only (no promoted entry, no sound row, no duplicate)", () => {
    expect(signals.map((s) => s.title)).toEqual(["#выпуск2025", "#rentreescolaire", "#cuisine"]);
  });

  it("maps rank, views and the README sample fields", () => {
    expect(signals[0]).toMatchObject({
      source: "tiktok_apify",
      platform: "tiktok",
      kind: "search_trend",
      url: "https://www.tiktok.com/tag/выпуск2025",
      metrics: { views: 5659920, rank: 1 },
      tags: ["выпуск2025"],
      strength: 0,
    });
    expect(signals[0].metrics.increasePct).toBeUndefined();
    // fr-FR groups thousands with a narrow no-break space.
    expect(signals[0].text?.replace(/\s/g, " ")).toBe(
      "Hashtag tendance TikTok (CZ, 7 jours) · rang 1 · nouveau dans le top 100 · 1 572 vidéos · secteur : Education",
    );
    expect(signals[0].related[0]).toEqual({
      title: "TikTok Creative Center – tendances FR",
      url: "https://ads.tiktok.com/creative/creativeCenter/trends?countryCode=FR&period=7",
      source: "TikTok",
    });
  });

  it("derives growth from TikTok's own popularity curve, never from rank changes", () => {
    const rentree = signals[1];
    expect(rentree.metrics.increasePct).toBe(375); // (0.95 - 0.2) / 0.2
    expect(rentree.publishedAt).toBe("2025-09-30T00:00:00.000Z");
    expect(rentree.text).toContain("rang 2 (+5 places)");
    expect(rentree.related.map((r) => r.url)).toContain("https://www.tiktok.com/@prof_test");
    // Falling curve → no increase; missing url → tag permalink.
    expect(signals[2].metrics.increasePct).toBeUndefined();
    expect(signals[2].url).toBe("https://www.tiktok.com/tag/cuisine");
    expect(signals[2].text).toContain("rang 4 (-3 places)");
  });

  it("histogramIncreasePct needs at least 4 points and a non-zero start", () => {
    expect(histogramIncreasePct(undefined)).toBeUndefined();
    expect(histogramIncreasePct([{ value: 1 }, { value: 2 }, { value: 3 }])).toBeUndefined();
    expect(histogramIncreasePct([{ value: 0 }, { value: 0 }, { value: 3 }, { value: 4 }])).toBeUndefined();
    expect(histogramIncreasePct([{ value: 1 }, { value: 1 }, { value: 2 }, { value: 2 }])).toBe(100);
  });
});

describe("normalizeTiktokVideos", () => {
  const { items, errorRows } = splitApifyItems<ApifyTiktokVideoItem>(searchDataset);
  const result = normalizeTiktokVideos(items, { now: NOW, language: "fr" });

  it("drops error rows, ads, other languages and videos older than a week", () => {
    expect(errorRows).toHaveLength(1);
    expect(result.dropped).toEqual({ otherLanguage: 1, tooOld: 1, ads: 1 });
    expect(result.signals.map((s) => s.url)).toEqual([
      "https://www.tiktok.com/@createur_1/video/7540000000000000001",
      "https://www.tiktok.com/@createur_2/video/7540000000000000002",
      "https://www.tiktok.com/@createur_5/video/7540000000000000005",
    ]);
  });

  it("maps counters, author audience, hashtags and the licensed sound", () => {
    expect(result.signals[0]).toMatchObject({
      source: "tiktok_apify",
      platform: "tiktok",
      kind: "short_video",
      title: "Comment je tiens avec 600 € par mois en étant étudiant 💸",
      author: "@createur_1",
      publishedAt: "2025-09-30T13:46:40.000Z",
      metrics: { views: 1250000, likes: 98000, comments: 2100, shares: 15400, saves: 40100, followers: 51200, durationSec: 15 },
      tags: ["budget", "etudiant", "argent"],
      query: "budget étudiant",
    });
    expect(result.signals[0].text).toContain("Son : « Balance ton quoi » – Angèle");
  });

  it("treats slideshows (duration 0) and unix-only dates correctly", () => {
    expect(result.signals[1].metrics.durationSec).toBeUndefined();
    expect(result.signals[1].text).toContain("Carrousel photo");
    expect(result.signals[2].publishedAt).toBe(new Date(1759300000 * 1000).toISOString());
  });
});

describe("tiktokApifyConnector", () => {
  it("is configured by APIFY_TOKEN and works without keywords (trends only)", async () => {
    expect(tiktokApifyConnector.isConfigured({ APIFY_TOKEN: "apify_api_x" })).toBe(true);
    expect(tiktokApifyConnector.isConfigured({ APIFY_TOKEN: " " })).toBe(false);
    const fetchMock = apifyRouter({ "clockworks~tiktok-trends-scraper": ok(trendsDataset) });
    const result = await tiktokApifyConnector.fetch(ctx({ keywords: [] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.signals).toHaveLength(3);
    expect(result.warning).toMatch(/Ajoutez des mots-clés/);
  });

  it("runs both actors with the exact inputs and merges the results", async () => {
    const fetchMock = apifyRouter({
      "clockworks~tiktok-trends-scraper": ok(trendsDataset),
      "clockworks~tiktok-scraper": ok(searchDataset),
    });
    const result = await tiktokApifyConnector.fetch(ctx());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(bodies).toContainEqual(buildTiktokTrendsInput("FR"));
    expect(bodies).toContainEqual(buildTiktokSearchInput(["budget étudiant", "épargne"]));
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const trendsUrl = urls.find((u) => u.pathname.includes("tiktok-trends-scraper"))!;
    expect(trendsUrl.pathname).toBe("/v2/actors/clockworks~tiktok-trends-scraper/run-sync-get-dataset-items");
    expect(trendsUrl.searchParams.get("fields")).toBe(TIKTOK_TRENDS_FIELDS.join(","));
    expect(trendsUrl.searchParams.get("maxTotalChargeUsd")).toBe("0.5");
    const searchUrl = urls.find((u) => u.pathname.includes("/clockworks~tiktok-scraper/"))!;
    expect(searchUrl.searchParams.get("fields")).toBe(TIKTOK_SEARCH_FIELDS.join(","));
    expect(result.signals.filter((s) => s.kind === "search_trend")).toHaveLength(3);
    expect(result.signals.filter((s) => s.kind === "short_video")).toHaveLength(3);
    expect(result.warning).toContain("1 vidéo(s) écartée(s)");
  });

  it("keeps the video results when the trends actor fails", async () => {
    apifyRouter({
      "clockworks~tiktok-trends-scraper": fail(408, "run-timeout-exceeded"),
      "clockworks~tiktok-scraper": ok(searchDataset),
    });
    const result = await tiktokApifyConnector.fetch(ctx());
    expect(result.signals).toHaveLength(3);
    expect(result.warning).toMatch(/Hashtags tendance indisponibles : L'acteur Apify clockworks\/tiktok-trends-scraper n'a pas répondu à temps/);
  });

  it("throws the real cause when every run fails (e.g. invalid token)", async () => {
    apifyRouter({
      "clockworks~tiktok-trends-scraper": fail(401, "user-or-token-not-found"),
      "clockworks~tiktok-scraper": fail(401, "user-or-token-not-found"),
    });
    await expect(tiktokApifyConnector.fetch(ctx())).rejects.toThrow(/Jeton Apify invalide/);
  });

  it("skips the Creative Center for unsupported countries and says so", async () => {
    const fetchMock = apifyRouter({ "clockworks~tiktok-scraper": ok(searchDataset) });
    const result = await tiktokApifyConnector.fetch(ctx({ geo: "CI" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.warning).toMatch(/ne fournit pas de hashtags tendance pour le pays « CI »/);
  });
});
