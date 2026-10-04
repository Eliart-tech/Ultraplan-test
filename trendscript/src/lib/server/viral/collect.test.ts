import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../cache";
import type { ApifyTiktokProfileVideo } from "../creators/tiktok";
import { SourceError } from "../http";
import type { ApifyInstagramItem } from "../sources/instagram-apify";
import type { YoutubeVideo } from "../sources/youtube";
import {
  buildViralInstagramInput,
  buildViralTiktokInput,
  buildViralYoutubeSearchUrl,
  collectPlatform,
  droppedWarnings,
  instagramItemsToViralPosts,
  tiktokItemsToViralPosts,
  viralCacheKey,
  youtubeVideosToViralPosts,
  type CollectContext,
} from "./collect";

const NOW = Date.parse("2026-10-04T10:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

describe("request builders", () => {
  it("Instagram: the trend connector's hashtags, with ~100 reels spread over them (20–50 each)", () => {
    expect(buildViralInstagramInput(["Sommeil"])).toEqual({ hashtags: ["sommeil"], resultsType: "reels", resultsLimit: 50 });
    expect(buildViralInstagramInput(["sommeil", "productivité", "Batch cooking"])).toEqual({
      hashtags: ["sommeil", "productivite", "batchcooking"],
      resultsType: "reels",
      resultsLimit: 34,
    });
    expect(buildViralInstagramInput(["a1", "b2", "c3", "d4", "e5"]).resultsLimit).toBe(20);
  });

  it("TikTok: every keyword (≤ 5), ~60 most liked videos of the period, no downloads", () => {
    const week = buildViralTiktokInput(["sommeil"], 7);
    expect(week).toMatchObject({
      searchQueries: ["sommeil"],
      searchSection: "/video",
      videoSearchSorting: "MOST_LIKED",
      videoSearchDateFilter: "PAST_WEEK",
      resultsPerPage: 30,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    });
    const month = buildViralTiktokInput(["a", "b", "c", "d", "e", "a"], 30);
    expect(month.searchQueries).toEqual(["a", "b", "c", "d", "e"]);
    expect(month.resultsPerPage).toBe(12);
    expect(month.videoSearchDateFilter).toBe("PAST_MONTH");
  });

  it("YouTube: ONE search over the period, 50 results, ordered by views", () => {
    const url = new URL(
      buildViralYoutubeSearchUrl({ keywords: ["sommeil", "mieux dormir"], geo: "fr", language: "fr", now: NOW, periodDays: 30, apiKey: "AIzaTEST" }),
    );
    expect(url.pathname).toBe("/youtube/v3/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'sommeil|"mieux dormir"',
      type: "video",
      order: "viewCount",
      publishedAfter: "2026-09-04T10:00:00Z",
      regionCode: "FR",
      relevanceLanguage: "fr",
      maxResults: "50",
      key: "AIzaTEST",
    });
  });
});

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

function reel(shortCode: string, extra: Partial<ApifyInstagramItem> = {}): ApifyInstagramItem {
  return {
    inputUrl: "https://www.instagram.com/explore/tags/sommeil",
    id: `id-${shortCode}`,
    type: "Video",
    shortCode,
    url: `https://www.instagram.com/p/${shortCode}/`,
    caption: "Le réveil à 5 h ne te rendra pas productif. Voici pourquoi #sommeil",
    hashtags: ["sommeil"],
    timestamp: ago(3),
    likesCount: 2_100,
    commentsCount: 140,
    videoPlayCount: 25_000,
    reshareCount: 900,
    ownerUsername: "Julie.Focus",
    ownerFullName: "Julie Focus",
    productType: "clips",
    videoDuration: 34.2,
    ...extra,
  };
}

describe("instagramItemsToViralPosts", () => {
  const options = { now: NOW, periodDays: 30, language: "fr", hashtags: ["sommeil", "productivite"] };

  it("maps a reel to a video with its author, permalink and counters", () => {
    const { posts } = instagramItemsToViralPosts([reel("ABC")], options);
    expect(posts).toEqual([
      {
        id: "instagram:ABC",
        url: "https://www.instagram.com/reel/ABC/",
        title: "Le réveil à 5 h ne te rendra pas productif. Voici pourquoi",
        text: "Le réveil à 5 h ne te rendra pas productif. Voici pourquoi #sommeil",
        publishedAt: ago(3),
        kind: "short_video",
        durationSec: 34,
        metrics: { views: 25_000, likes: 2_100, comments: 140, shares: 900 },
        hashtags: ["sommeil"],
        platform: "instagram",
        author: { handle: "julie.focus", displayName: "Julie Focus", url: "https://www.instagram.com/julie.focus/" },
        query: "#sommeil",
      },
    ]);
  });

  it("excludes pinned reels, paid partnerships, other formats, old reels, other languages and hidden views", () => {
    const { posts, dropped } = instagramItemsToViralPosts(
      [
        reel("PIN", { isPinned: true }),
        reel("PAID", { paidPartnership: true }),
        reel("FEED", { productType: "feed", type: "Image" }),
        reel("OLD", { timestamp: ago(45) }),
        reel("EN", { caption: "This is how I wake up every single morning without any alarm at all" }),
        reel("NOVIEWS", { videoPlayCount: undefined }),
        reel("NOOWNER", { ownerUsername: undefined }),
        reel("KEEP"),
      ],
      options,
    );
    expect(posts.map((post) => post.id)).toEqual(["instagram:KEEP"]);
    expect(dropped).toMatchObject({ pinned: 1, paid: 1, notVideo: 1, tooOld: 1, otherLanguage: 1, noViews: 1, noAuthor: 1 });
  });

  it("keeps the most viewed copy of a reel found under two hashtags", () => {
    const { posts, dropped } = instagramItemsToViralPosts(
      [reel("DUP", { videoPlayCount: 10 }), reel("DUP", { videoPlayCount: 99, inputUrl: "https://www.instagram.com/explore/tags/productivite" })],
      options,
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ metrics: { views: 99 }, query: "#productivite" });
    expect(dropped.duplicate).toBe(1);
  });
});

function tiktok(id: string, extra: Partial<ApifyTiktokProfileVideo> = {}): ApifyTiktokProfileVideo {
  return {
    id,
    text: "3 erreurs qui ruinent ton sommeil (la 2e tout le monde la fait) #sommeil",
    textLanguage: "fr",
    createTimeISO: ago(9),
    webVideoUrl: `https://www.tiktok.com/@dodo.coach/video/${id}`,
    playCount: 900_000,
    diggCount: 80_000,
    shareCount: 20_000,
    commentCount: 1_200,
    collectCount: 30_000,
    authorMeta: { name: "Dodo.Coach", nickName: "Dodo Coach", fans: 5_000, profileUrl: "https://www.tiktok.com/@dodo.coach" },
    musicMeta: { musicName: "son original", musicAuthor: "Dodo.Coach", musicOriginal: true },
    videoMeta: { duration: 28 },
    hashtags: [{ name: "sommeil" }],
    searchQuery: "sommeil",
    ...extra,
  };
}

describe("tiktokItemsToViralPosts", () => {
  const options = { now: NOW, periodDays: 30, language: "fr" };

  it("maps a search result with the author's followers given by TikTok", () => {
    const { posts } = tiktokItemsToViralPosts([tiktok("111")], options);
    expect(posts).toEqual([
      {
        id: "tiktok:111",
        url: "https://www.tiktok.com/@dodo.coach/video/111",
        title: "3 erreurs qui ruinent ton sommeil (la 2e tout le monde la fait)",
        text: "3 erreurs qui ruinent ton sommeil (la 2e tout le monde la fait) #sommeil",
        publishedAt: ago(9),
        kind: "short_video",
        durationSec: 28,
        metrics: { views: 900_000, likes: 80_000, comments: 1_200, shares: 20_000, saves: 30_000 },
        hashtags: ["sommeil"],
        platform: "tiktok",
        author: { handle: "dodo.coach", displayName: "Dodo Coach", followers: 5_000, url: "https://www.tiktok.com/@dodo.coach" },
        query: "sommeil",
      },
    ]);
  });

  it("excludes ads, sponsored and pinned videos, photo carousels, other languages and old videos", () => {
    const { posts, dropped } = tiktokItemsToViralPosts(
      [
        tiktok("ad", { isAd: true }),
        tiktok("sponso", { isSponsored: true }),
        tiktok("pin", { isPinned: true }),
        tiktok("photo", { isSlideshow: true }),
        tiktok("en", { textLanguage: "en" }),
        tiktok("old", { createTimeISO: ago(40) }),
        tiktok("unknownlang", { textLanguage: "un" }),
        tiktok("nofans", { authorMeta: { name: "anon" } }),
      ],
      options,
    );
    expect(posts.map((post) => post.id)).toEqual(["tiktok:unknownlang", "tiktok:nofans"]);
    expect(posts[1].author).toEqual({ handle: "anon", url: "https://www.tiktok.com/@anon" });
    expect(dropped).toMatchObject({ paid: 2, pinned: 1, notVideo: 1, otherLanguage: 1, tooOld: 1 });
  });

  it("keeps a 7-day window with one day of slack", () => {
    const week = { ...options, periodDays: 7 };
    expect(tiktokItemsToViralPosts([tiktok("a", { createTimeISO: ago(7.5) })], week).posts).toHaveLength(1);
    expect(tiktokItemsToViralPosts([tiktok("b", { createTimeISO: ago(8.5) })], week).posts).toHaveLength(0);
  });
});

function youtubeVideo(id: string, extra: Partial<YoutubeVideo["snippet"]> = {}, stats: YoutubeVideo["statistics"] = { viewCount: "2000000", likeCount: "90000", commentCount: "4000" }): YoutubeVideo {
  return {
    id,
    snippet: {
      publishedAt: ago(25),
      channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
      channelTitle: "Science Express",
      title: "J'ai testé le sommeil polyphasique pendant 30 jours",
      description: "Mon expérience #sommeil",
      liveBroadcastContent: "none",
      ...extra,
    },
    statistics: stats,
    contentDetails: { duration: "PT58S" },
  };
}

describe("youtubeVideosToViralPosts", () => {
  const options = { now: NOW, periodDays: 30, language: "fr", keywords: ["sommeil", "productivité"] };

  it("maps a video; the author is its channel until the channels are read", () => {
    const { posts } = youtubeVideosToViralPosts([youtubeVideo("yt1")], options);
    expect(posts).toEqual([
      {
        id: "youtube:yt1",
        url: "https://www.youtube.com/shorts/yt1",
        title: "J'ai testé le sommeil polyphasique pendant 30 jours",
        text: "Mon expérience #sommeil",
        publishedAt: ago(25),
        kind: "short_video",
        durationSec: 58,
        metrics: { views: 2_000_000, likes: 90_000, comments: 4_000 },
        hashtags: ["sommeil"],
        platform: "youtube",
        author: { handle: "UCaaaaaaaaaaaaaaaaaaaaaa", displayName: "Science Express", url: "https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa" },
        query: "sommeil",
      },
    ]);
  });

  it("drops live streams, other languages and videos without views", () => {
    const { posts, dropped } = youtubeVideosToViralPosts(
      [
        youtubeVideo("live", { liveBroadcastContent: "live" }),
        youtubeVideo("en", { defaultAudioLanguage: "en-US" }),
        youtubeVideo("hidden", {}, { likeCount: "3" }),
        youtubeVideo("ok", { defaultAudioLanguage: "fr-FR" }),
      ],
      options,
    );
    expect(posts.map((post) => post.id)).toEqual(["youtube:ok"]);
    expect(dropped).toMatchObject({ notVideo: 1, otherLanguage: 1, noViews: 1 });
  });
});

describe("droppedWarnings", () => {
  it("explains in French what the filters removed", () => {
    expect(droppedWarnings({ pinned: 1, paid: 2, tooOld: 5, otherLanguage: 3, noViews: 0, noAuthor: 0, notVideo: 0, duplicate: 4 }, ["reel", "reels", false])).toEqual([
      "2 reels sponsorisés ou en partenariat rémunéré exclus (vues en partie payées).",
      "1 reel épinglé exclu.",
      "3 reels dans une autre langue exclus.",
    ]);
    expect(droppedWarnings({ pinned: 2, paid: 1, tooOld: 0, otherLanguage: 0, noViews: 1, noAuthor: 0, notVideo: 0, duplicate: 0 }, ["vidéo", "vidéos", true])).toEqual([
      "1 vidéo sponsorisée ou en partenariat rémunéré exclue (vues en partie payées).",
      "2 vidéos épinglées exclues.",
      "1 vidéo sans vues publiques exclue.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// collectPlatform (network stubbed)
// ---------------------------------------------------------------------------

function context(env: Record<string, string>, extra: Partial<CollectContext> = {}): CollectContext {
  return { keywords: ["sommeil"], periodDays: 30, geo: "FR", language: "fr", env, signal: new AbortController().signal, now: NOW, ...extra };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("collectPlatform", () => {
  beforeEach(() => clearCache());
  afterEach(() => vi.unstubAllGlobals());

  it("TikTok: one Apify run with the token in the header, cached 6 h", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json([tiktok("111"), { error: "not found", input: "x" }]));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context({ APIFY_TOKEN: "apify_api_SECRET123" });
    const first = await collectPlatform("tiktok", ctx);
    expect(first).toMatchObject({ platform: "tiktok", ratiosAllowed: true, source: "Apify · TikTok Scraper (recherche de vidéos)" });
    expect(first.posts.map((post) => post.id)).toEqual(["tiktok:111"]);
    expect(first.warnings).toContain("Apify a signalé 1 erreur (mot-clé vide, privé ou bloqué).");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/actors/clockworks~tiktok-scraper/run-sync-get-dataset-items");
    expect(url).not.toContain("SECRET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer apify_api_SECRET123");
    expect(JSON.parse(init?.body as string)).toMatchObject({ searchQueries: ["sommeil"], videoSearchDateFilter: "PAST_MONTH" });

    // Same parameters: served from the cache, as an independent copy.
    first.posts[0].title = "modifié";
    const second = await collectPlatform("tiktok", ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.posts[0].title).not.toBe("modifié");
  });

  it("YouTube: one search + one videos.list, ratios disabled without the amendment", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/search?") ? json({ items: [{ id: { videoId: "yt1" } }] }) : json({ items: [youtubeVideo("yt1")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await collectPlatform("youtube", context({ YOUTUBE_API_KEY: "AIzaKEY" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ratiosAllowed).toBe(false);
    expect(result.posts.map((post) => post.id)).toEqual(["youtube:yt1"]);
    expect(result.warnings.at(-1)).toMatch(/^YouTube : ratios désactivés/);

    clearCache();
    const approved = await collectPlatform("youtube", context({ YOUTUBE_API_KEY: "AIzaKEY", YT_DERIVED_METRICS_APPROVED: "true" }));
    expect(approved.ratiosAllowed).toBe(true);
  });

  it("throws a French SourceError for an upstream failure (never cached)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { type: "user-or-token-not-found", message: "x" } }, 401)));
    await expect(collectPlatform("instagram", context({ APIFY_TOKEN: "apify_api_X" }))).rejects.toThrow("Jeton Apify invalide");
    await expect(collectPlatform("instagram", context({}))).rejects.toBeInstanceOf(SourceError);
  });

  it("keys the cache by platform, route and parameters (keywords order-insensitive)", () => {
    const env = { APIFY_TOKEN: "x" };
    expect(viralCacheKey("tiktok", context(env, { keywords: ["B", "a"] }))).toBe(viralCacheKey("tiktok", context(env, { keywords: ["a", "b"] })));
    expect(viralCacheKey("tiktok", context(env))).not.toBe(viralCacheKey("tiktok", context(env, { periodDays: 7 })));
    expect(viralCacheKey("youtube", context({}))).not.toBe(viralCacheKey("youtube", context({ YT_DERIVED_METRICS_APPROVED: "true" })));
  });
});
