import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import {
  POPULAR_LABEL,
  buildYoutubeMostPopularUrl,
  buildYoutubeSearchUrl,
  buildYoutubeVideosUrl,
  isoDurationToSeconds,
  searchVideoIds,
  youtubeConnector,
  youtubeError,
  youtubeSearchQuery,
  youtubeVideoToSignal,
  type YoutubeSearchResponse,
  type YoutubeVideosResponse,
} from "./youtube";
import type { SourceContext } from "./types";

/** Test fixtures (payloads shaped like the YouTube Data API v3 responses). */
const raw = (name: string) =>
  JSON.stringify((JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8")) as { response: unknown }).response);
const searchFixture = JSON.parse(raw("youtube-search.json")) as YoutubeSearchResponse;
const videosFixture = JSON.parse(raw("youtube-videos.json")) as YoutubeVideosResponse;

const NOW = Date.parse("2026-10-02T12:00:00.123Z");
const KEY = "AIzaSyTESTKEY0000000000000000000000000";

function ctx(partial: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "budget étudiant",
    keywords: ["budget étudiant", "IA"],
    signal: new AbortController().signal,
    now: NOW,
    env: { YOUTUBE_API_KEY: KEY },
    ...partial,
  };
}

type Route = { match: (url: URL) => boolean; body: string; status?: number };

function youtubeRouter(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const route = routes.find((r) => r.match(url));
    if (!route) throw new Error(`unexpected URL ${url}`);
    return new Response(route.body, { status: route.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const isSearch = (url: URL) => url.pathname === "/youtube/v3/search";
const isPopular = (url: URL) => url.pathname === "/youtube/v3/videos" && url.searchParams.get("chart") === "mostPopular";
const isVideos = (url: URL) => url.pathname === "/youtube/v3/videos" && url.searchParams.has("id");

afterEach(() => vi.unstubAllGlobals());

describe("request builders", () => {
  it("builds ONE search: keywords OR-ed, last 7 days, by views, region + language", () => {
    const url = new URL(buildYoutubeSearchUrl({ keywords: ["budget étudiant", "IA", "IA", 'a|"b'], geo: "fr", language: "FR", now: NOW, apiKey: KEY }));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      part: "snippet",
      q: '"budget étudiant"|IA|"a b"',
      type: "video",
      order: "viewCount",
      publishedAfter: "2026-09-25T12:00:00Z",
      regionCode: "FR",
      relevanceLanguage: "fr",
      maxResults: "25",
      key: KEY,
    });
  });

  it("builds the stats and mostPopular calls", () => {
    expect(buildYoutubeVideosUrl(["a", "b"], KEY)).toBe(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet%2Cstatistics%2CcontentDetails&id=a%2Cb&key=${KEY}`,
    );
    expect(buildYoutubeMostPopularUrl({ geo: "FR", language: "fr", apiKey: KEY })).toBe(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet%2Cstatistics%2CcontentDetails&chart=mostPopular&regionCode=FR&hl=fr&maxResults=25&key=${KEY}`,
    );
  });

  it("youtubeSearchQuery quotes phrases and dedupes", () => {
    expect(youtubeSearchQuery([" ia ", "ia", "", "intelligence artificielle"])).toBe('ia|"intelligence artificielle"');
  });
});

describe("parsing", () => {
  it("converts ISO 8601 durations", () => {
    expect(isoDurationToSeconds("PT58S")).toBe(58);
    expect(isoDurationToSeconds("PT12M5S")).toBe(725);
    expect(isoDurationToSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationToSeconds("P1DT2H")).toBe(93_600);
    expect(isoDurationToSeconds("P0D")).toBeUndefined();
    expect(isoDurationToSeconds("garbage")).toBeUndefined();
  });

  it("keeps only video ids from search results", () => {
    expect(searchVideoIds(searchFixture)).toEqual(["8Qn-7lnJ9rw", "wIiKS1FR2KI", "enTest00001", "liveTest001"]);
  });

  it("maps a ≤ 180 s video to a Short with string counters parsed and hidden likes undefined", () => {
    const short = videosFixture.items![1];
    expect(youtubeVideoToSignal(short, 0, { origin: "search", keywords: ["IA", "budget étudiant"] })).toMatchObject({
      id: expect.stringMatching(/^youtube:/),
      source: "youtube",
      platform: "youtube",
      kind: "short_video",
      url: "https://www.youtube.com/shorts/8Qn-7lnJ9rw",
      author: "HugoDécrypte - Actus du jour",
      publishedAt: "2026-10-01T13:33:34.000Z",
      metrics: { views: 1203344, likes: undefined, comments: 2210, durationSec: 58, rank: undefined },
      query: "budget étudiant",
      thumbnailUrl: "https://i.ytimg.com/vi/8Qn-7lnJ9rw/hqdefault.jpg",
    });
  });

  it("maps long videos, tags, and labels the mostPopular chart honestly", () => {
    const long = youtubeVideoToSignal(videosFixture.items![0], 0, { origin: "search", keywords: ["IA"] })!;
    expect(long.kind).toBe("video");
    expect(long.url).toBe("https://www.youtube.com/watch?v=wIiKS1FR2KI");
    expect(long.tags).toEqual(["ia", "étudiants", "actu"]);
    expect(long.query).toBe("IA");

    const popular = youtubeVideoToSignal(videosFixture.items![0], 2, { origin: "popular", keywords: [] })!;
    expect(popular.text?.startsWith(`${POPULAR_LABEL} · `)).toBe(true);
    expect(popular.metrics.rank).toBe(3);
    expect(popular.query).toBeUndefined();
  });

  it("skips upcoming live streams", () => {
    expect(youtubeVideoToSignal(videosFixture.items![3], 0, { origin: "search", keywords: [] })).toBeUndefined();
  });
});

describe("youtubeError", () => {
  it("maps the real invalid-key response", () => {
    const error = youtubeError(400, raw("youtube-error.key-invalid.json"), "Recherche YouTube");
    expect(error.message).toBe("Clé YouTube invalide : vérifiez YOUTUBE_API_KEY.");
    expect(error.retryable).toBe(false);
  });

  it("maps quotaExceeded to a French quota message", () => {
    const error = youtubeError(403, raw("youtube-error.quota.json"), "Recherche YouTube");
    expect(error.message).toMatch(/^Quota YouTube du jour atteint/);
    expect(error.status).toBe(403);
  });

  it("maps a disabled API and missing key, and never leaks the key", () => {
    const disabled = JSON.stringify({
      error: {
        code: 403,
        message: "YouTube Data API v3 has not been used in project 123 before or it is disabled.",
        errors: [{ reason: "accessNotConfigured" }],
        status: "PERMISSION_DENIED",
        details: [{ reason: "SERVICE_DISABLED" }],
      },
    });
    expect(youtubeError(403, disabled, "x").message).toMatch(/n'est pas activée/);
    const missing = JSON.stringify({ error: { code: 403, message: "Method doesn't allow unregistered callers (callers without established identity).", errors: [{ reason: "forbidden" }] } });
    expect(youtubeError(403, missing, "x").message).toMatch(/Clé YouTube manquante/);
    const other = youtubeError(500, `{"error":{"code":500,"message":"Backend error for key=${KEY}"}}`, "YouTube (populaires)");
    expect(other.message).not.toContain(KEY);
    expect(other.retryable).toBe(true);
  });
});

describe("youtubeConnector", () => {
  it("is configured by YOUTUBE_API_KEY", () => {
    expect(youtubeConnector.isConfigured({})).toBe(false);
    expect(youtubeConnector.isConfigured({ YOUTUBE_API_KEY: KEY })).toBe(true);
  });

  it("makes exactly one search.list, one videos.list and one mostPopular call", async () => {
    const fetchMock = youtubeRouter([
      { match: isSearch, body: raw("youtube-search.json") },
      { match: isVideos, body: raw("youtube-videos.json") },
      { match: isPopular, body: raw("youtube-most-popular.json") },
    ]);
    const result = await youtubeConnector.fetch(ctx());

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.filter(isSearch)).toHaveLength(1);
    expect(urls.filter(isVideos)).toHaveLength(1);
    expect(urls.filter(isPopular)).toHaveLength(1);
    expect(urls.find(isVideos)!.searchParams.get("id")).toBe("8Qn-7lnJ9rw,wIiKS1FR2KI,enTest00001,liveTest001");

    // Search order kept; English video and upcoming live dropped; mostPopular duplicate removed.
    expect(result.signals.map((s) => s.url)).toEqual([
      "https://www.youtube.com/shorts/8Qn-7lnJ9rw",
      "https://www.youtube.com/watch?v=wIiKS1FR2KI",
      "https://www.youtube.com/watch?v=musicTest01",
    ]);
    expect(result.signals[2].text).toContain(POPULAR_LABEL);
    expect(result.warning).toBeUndefined();
  });

  it("keeps mostPopular results with a warning when the search quota is exhausted", async () => {
    youtubeRouter([
      { match: isSearch, body: raw("youtube-error.quota.json"), status: 403 },
      { match: isPopular, body: raw("youtube-most-popular.json") },
    ]);
    const result = await youtubeConnector.fetch(ctx());
    expect(result.signals).toHaveLength(2);
    expect(result.warning).toMatch(/^Recherche par mots-clés indisponible : Quota YouTube du jour atteint/);
  });

  it("only calls mostPopular without keywords, and says why", async () => {
    const fetchMock = youtubeRouter([{ match: isPopular, body: raw("youtube-most-popular.json") }]);
    const result = await youtubeConnector.fetch(ctx({ keywords: [] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.warning).toMatch(/Sans mots-clés/);
  });

  it("throws the French error when everything fails (invalid key)", async () => {
    youtubeRouter([
      { match: isSearch, body: raw("youtube-error.key-invalid.json"), status: 400 },
      { match: isPopular, body: raw("youtube-error.key-invalid.json"), status: 400 },
    ]);
    const error = await youtubeConnector.fetch(ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).message).toBe("Clé YouTube invalide : vérifiez YOUTUBE_API_KEY.");
  });
});
