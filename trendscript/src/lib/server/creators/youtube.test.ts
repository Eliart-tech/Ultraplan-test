import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { YoutubeVideosResponse } from "../sources/youtube";
import { parseYoutubeFeed } from "../sources/youtube-rss";
import { calledUrls, fixture, fixtureJson, json, routeFetch, text } from "./__fixtures__/fetch-routes";
import {
  YOUTUBE_RATIOS_DISABLED,
  buildYoutubeChannelUrl,
  buildYoutubePlaylistItemsUrl,
  feedRetryDelay,
  feedVideosToCreatorPosts,
  fetchYoutubeCreator,
  parseCountLabel,
  parseYoutubeChannelPage,
  playlistVideoIds,
  youtubeChannelToAccount,
  youtubeVideosToCreatorPosts,
  type YoutubeChannelsResponse,
  type YoutubePlaylistItemsResponse,
} from "./youtube";

const NOW = Date.parse("2026-10-04T08:00:00Z");
const PAGE = fixture("youtube-channel-page.squeezie.html");
const RSS = fixture("youtube-rss.squeezie.xml");
const CHANNELS = fixtureJson<{ response: YoutubeChannelsResponse }>("youtube-api.channels.json").response;
const NO_CHANNEL = fixtureJson<{ response: YoutubeChannelsResponse }>("youtube-api.channels.empty.json").response;
const PLAYLIST = fixtureJson<{ response: YoutubePlaylistItemsResponse }>("youtube-api.playlist-items.json").response;
const VIDEOS = fixtureJson<{ response: YoutubeVideosResponse }>("youtube-api.videos.json").response;

function options(env: Record<string, string> = {}, maxPosts = 30) {
  return { env, signal: new AbortController().signal, now: NOW, geo: "FR", language: "fr", maxPosts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseCountLabel", () => {
  it("reads YouTube's French and English count labels", () => {
    expect(parseCountLabel("20,2 millions d’abonnés")).toBe(20_200_000);
    expect(parseCountLabel("20,2 M d’abonnés")).toBe(20_200_000);
    expect(parseCountLabel("3,81 millions d’abonnés")).toBe(3_810_000);
    expect(parseCountLabel("882 mille abonnés")).toBe(882_000);
    expect(parseCountLabel("882 k abonnés")).toBe(882_000);
    expect(parseCountLabel("1,2 milliard d’abonnés")).toBe(1_200_000_000);
    expect(parseCountLabel("1,8 k vidéos")).toBe(1_800);
    expect(parseCountLabel("1 896 vidéos")).toBe(1_896);
    expect(parseCountLabel("12 345 abonnés")).toBe(12_345);
    expect(parseCountLabel("5.1M subscribers")).toBe(5_100_000);
    expect(parseCountLabel("20.2 million subscribers")).toBe(20_200_000);
    expect(parseCountLabel("12,345 subscribers")).toBe(12_345);
    expect(parseCountLabel("1 abonné")).toBe(1);
    expect(parseCountLabel("Aucun abonné")).toBeUndefined();
    expect(parseCountLabel(undefined)).toBeUndefined();
  });
});

describe("parseYoutubeChannelPage (real @Squeezie page, trimmed)", () => {
  it("reads the channel id, name, bio and the header's own counts", () => {
    expect(parseYoutubeChannelPage(PAGE)).toEqual({
      channelId: "UCWeg2Pkate69NFdBeuRFTAw",
      title: "SQUEEZIE",
      description: "clique sur une vidéo nan??",
      handle: "Squeezie",
      subscribers: 20_200_000,
      subscribersLabel: "20,2 millions d’abonnés",
      videoCount: 1_800,
      verified: true,
    });
  });

  it("ignores the featured-channels shelf (another channel's 5,1 millions d’abonnés)", () => {
    expect(PAGE).toContain("5,1 millions d’abonnés");
    expect(parseYoutubeChannelPage(PAGE)?.subscribers).not.toBe(5_100_000);
  });

  it("returns undefined for a page that is not a channel page", () => {
    expect(parseYoutubeChannelPage("<html><body>Avant d'accéder à YouTube</body></html>")).toBeUndefined();
  });
});

describe("feedVideosToCreatorPosts (real @Squeezie RSS feed)", () => {
  it("maps the 15 uploads with views, likes and the exact Shorts flag", () => {
    const posts = feedVideosToCreatorPosts(parseYoutubeFeed(RSS));
    expect(posts).toHaveLength(15);
    expect(posts[0]).toEqual({
      id: "2QcaDwpvl7s",
      url: "https://www.youtube.com/shorts/2QcaDwpvl7s",
      title: "Essayez de ne pas rire | Séquence inédite (Partie 3/3)",
      text: "#shorts",
      publishedAt: "2026-09-04T20:27:43.000Z",
      kind: "short_video",
      metrics: { views: 869069, likes: 37928 },
      hashtags: ["shorts"],
    });
    expect(posts.every((post) => post.metrics.views !== undefined && post.metrics.comments === undefined)).toBe(true);
  });
});

describe("YouTube Data API requests and mapping", () => {
  it("asks channels.list by handle (or id), then the uploads playlist — never search.list", () => {
    const byHandle = new URL(buildYoutubeChannelUrl("Squeezie", "AIzaTEST"));
    expect(byHandle.pathname).toBe("/youtube/v3/channels");
    expect(Object.fromEntries(byHandle.searchParams)).toEqual({
      part: "snippet,statistics,contentDetails",
      forHandle: "@Squeezie",
      key: "AIzaTEST",
    });
    const byId = new URL(buildYoutubeChannelUrl("UCWeg2Pkate69NFdBeuRFTAw", "AIzaTEST"));
    expect(byId.searchParams.get("id")).toBe("UCWeg2Pkate69NFdBeuRFTAw");
    expect(byId.searchParams.has("forHandle")).toBe(false);

    const playlist = new URL(buildYoutubePlaylistItemsUrl("UUWeg2Pkate69NFdBeuRFTAw", 80, "AIzaTEST"));
    expect(playlist.pathname).toBe("/youtube/v3/playlistItems");
    expect(Object.fromEntries(playlist.searchParams)).toEqual({
      part: "contentDetails",
      playlistId: "UUWeg2Pkate69NFdBeuRFTAw",
      maxResults: "50",
      key: "AIzaTEST",
    });
    expect(playlistVideoIds(PLAYLIST)).toEqual(["UPCOMING001", "LONGVIDEO01", "2QcaDwpvl7s", "EdNjkLG9UbE", "SHORTGUESS1"]);
  });

  it("maps the channel (rounded subscribers, hidden ones left unknown)", () => {
    const channel = CHANNELS.items![0];
    expect(youtubeChannelToAccount(channel, "Squeezie")).toEqual({
      platform: "youtube",
      handle: "Squeezie",
      displayName: "SQUEEZIE",
      url: "https://www.youtube.com/@Squeezie",
      followers: 20_200_000,
      totalPosts: 1834,
      bio: "clique sur une vidéo nan??",
    });
    const hidden = { ...channel, statistics: { ...channel.statistics, hiddenSubscriberCount: true } };
    expect(youtubeChannelToAccount(hidden, "UCWeg2Pkate69NFdBeuRFTAw")).toMatchObject({ handle: "squeezie", followers: undefined });
  });

  it("maps videos: RSS decides Short vs long, duration only as a fallback; upcoming dropped", () => {
    const flags = new Map(parseYoutubeFeed(RSS).map((video) => [video.videoId, video.isShort]));
    const { posts, guessedFormat } = youtubeVideosToCreatorPosts(VIDEOS.items!, flags);
    expect(posts.map((post) => [post.id, post.kind, post.durationSec])).toEqual([
      ["LONGVIDEO01", "video", 2537],
      // 2 min 41 s and listed as /shorts/ in the feed.
      ["2QcaDwpvl7s", "short_video", 161],
      ["EdNjkLG9UbE", "short_video", 180],
      ["SHORTGUESS1", "short_video", 45],
    ]);
    expect(guessedFormat).toBe(2);
    expect(posts[0]).toMatchObject({
      url: "https://www.youtube.com/watch?v=LONGVIDEO01",
      metrics: { views: 3120456, likes: 154000, comments: 5321 },
      hashtags: ["imposteur", "squeezie"],
      publishedAt: "2026-09-20T17:00:00.000Z",
    });
    expect(posts[1].url).toBe("https://www.youtube.com/shorts/2QcaDwpvl7s");
    // Comments disabled → no count rather than 0.
    expect(posts[2].metrics.comments).toBeUndefined();
  });
});

describe("fetchYoutubeCreator", () => {
  it("keyless: public page + RSS, newest first, capped, with honest warnings", async () => {
    const fetchMock = routeFetch([
      [/^https:\/\/www\.youtube\.com\/@Squeezie$/, () => text(PAGE)],
      [/feeds\/videos\.xml\?channel_id=UCWeg2Pkate69NFdBeuRFTAw$/, () => text(RSS, 200, "application/atom+xml")],
    ]);
    const data = await fetchYoutubeCreator("Squeezie", options({}, 10));
    expect(calledUrls(fetchMock)).toHaveLength(2);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["Accept-Language"]).toMatch(/^fr-FR/);

    expect(data.source).toBe("YouTube · page publique de la chaîne + flux RSS officiel");
    expect(data.fetchedAt).toBe("2026-10-04T08:00:00.000Z");
    expect(data.account).toEqual({
      platform: "youtube",
      handle: "Squeezie",
      displayName: "SQUEEZIE",
      url: "https://www.youtube.com/@Squeezie",
      followers: 20_200_000,
      totalPosts: 1_800,
      bio: "clique sur une vidéo nan??",
      verified: true,
    });
    expect(data.posts).toHaveLength(10);
    const times = data.posts.map((post) => Date.parse(post.publishedAt!));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(data.ratiosAllowed).toBe(false);
    expect(data.warnings[0]).toBe(YOUTUBE_RATIOS_DISABLED);
    expect(data.warnings.join(" ")).toMatch(/15 dernières vidéos/);
    expect(data.warnings.join(" ")).toMatch(/« 20,2 millions d’abonnés »/);
  });

  it("keyless: retries the flaky RSS feed (404/500 bursts) before giving up", async () => {
    let feedCalls = 0;
    routeFetch([
      [/^https:\/\/www\.youtube\.com\/@Squeezie$/, () => text(PAGE)],
      [/feeds\/videos\.xml/, () => (++feedCalls < 3 ? text("Error 404 (Not Found)!!1", feedCalls === 1 ? 404 : 500) : text(RSS, 200, "application/atom+xml"))],
    ]);
    const data = await fetchYoutubeCreator("Squeezie", options());
    expect(feedCalls).toBe(3);
    expect(data.posts).toHaveLength(15);
    expect(feedRetryDelay(1)).toBe(300);
    expect(feedRetryDelay(10)).toBe(1000);
  });

  it("keyless: an unknown handle is a French 'not found' error", async () => {
    routeFetch([[/youtube\.com\/@/, () => text("Not found", 404)]]);
    await expect(fetchYoutubeCreator("inconnu-xyz", options())).rejects.toThrow(
      "Compte introuvable sur YouTube : vérifiez le pseudo (@inconnu-xyz).",
    );
  });

  it("with a key: 3 API calls (+ RSS for Shorts), ratios allowed when declared", async () => {
    const fetchMock = routeFetch([
      [/\/youtube\/v3\/channels\?/, () => json(CHANNELS)],
      [/\/youtube\/v3\/playlistItems\?/, () => json(PLAYLIST)],
      [/\/youtube\/v3\/videos\?/, () => json(VIDEOS)],
      [/feeds\/videos\.xml/, () => text(RSS, 200, "application/atom+xml")],
    ]);
    const data = await fetchYoutubeCreator("Squeezie", options({ YOUTUBE_API_KEY: "AIzaTEST", YT_DERIVED_METRICS_APPROVED: "true" }));
    const urls = calledUrls(fetchMock);
    expect(urls.some((url) => url.includes("/search"))).toBe(false);
    expect(urls.filter((url) => url.includes("googleapis.com"))).toHaveLength(3);
    expect(new URL(urls.find((url) => url.includes("/videos?"))!).searchParams.get("id")).toBe(
      "UPCOMING001,LONGVIDEO01,2QcaDwpvl7s,EdNjkLG9UbE,SHORTGUESS1",
    );

    expect(data.source).toBe("YouTube Data API (officielle)");
    expect(data.ratiosAllowed).toBe(true);
    expect(data.account.followers).toBe(20_200_000);
    expect(data.posts.map((post) => post.id)).toEqual(["LONGVIDEO01", "2QcaDwpvl7s", "EdNjkLG9UbE", "SHORTGUESS1"]);
    expect(data.warnings).not.toContain(YOUTUBE_RATIOS_DISABLED);
    expect(data.warnings.join(" ")).toMatch(/déduit de la durée .* 2 vidéos/);
    expect(data.warnings.join(" ")).toMatch(/3 chiffres significatifs/);
  });

  it("with a key: an unknown handle is 'not found' (no keyless retry)", async () => {
    const fetchMock = routeFetch([[/\/youtube\/v3\/channels\?/, () => json(NO_CHANNEL)]]);
    await expect(fetchYoutubeCreator("inconnu-xyz", options({ YOUTUBE_API_KEY: "AIzaTEST" }))).rejects.toThrow(/Compte introuvable sur YouTube/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("with an invalid key: falls back to the public page and says why", async () => {
    routeFetch([
      [/\/youtube\/v3\/channels\?/, () => json(fixtureJson<{ response: unknown }>("../../sources/__fixtures__/youtube-error.key-invalid.json").response, 400)],
      [/^https:\/\/www\.youtube\.com\/@Squeezie$/, () => text(PAGE)],
      [/feeds\/videos\.xml/, () => text(RSS, 200, "application/atom+xml")],
    ]);
    const data = await fetchYoutubeCreator("Squeezie", options({ YOUTUBE_API_KEY: "AIzaBAD" }));
    expect(data.source).toMatch(/page publique/);
    expect(data.warnings[0]).toBe("API YouTube indisponible (Clé YouTube invalide : vérifiez YOUTUBE_API_KEY.) : données publiques utilisées à la place.");
    expect(data.warnings.join(" ")).not.toContain("AIzaBAD");
  });
});
