import { afterEach, describe, expect, it, vi } from "vitest";
import { splitApifyItems } from "../sources/apify";
import { calledUrls, fixtureJson, json, routeFetch } from "./__fixtures__/fetch-routes";
import {
  buildTiktokProfileInput,
  fetchTiktokCreator,
  tiktokProfileError,
  tiktokProfileToCreatorData,
  type ApifyTiktokProfileVideo,
} from "./tiktok";

const NOW = Date.parse("2026-10-04T08:00:00Z");
const ITEMS = fixtureJson<{ items: ApifyTiktokProfileVideo[] }>("apify-tiktok-profile.json").items;
const ERRORS = fixtureJson<{ private: unknown[]; notFound: unknown[] }>("apify-tiktok-errors.json");

function options(env: Record<string, string>, maxPosts = 30) {
  return { env, signal: new AbortController().signal, now: NOW, geo: "FR", language: "fr", maxPosts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildTiktokProfileInput (checked against the actor's input schema)", () => {
  it("asks for the profile's videos only, no charged filter, no download", () => {
    expect(buildTiktokProfileInput("shaiie_foeva", 30)).toEqual({
      profiles: ["shaiie_foeva"],
      profileScrapeSections: ["videos"],
      resultsPerPage: 30,
      excludePinnedPosts: true,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    });
  });
});

describe("tiktokProfileToCreatorData", () => {
  it("maps views, likes, comments, shares, saves and the account from authorMeta", () => {
    const data = tiktokProfileToCreatorData("shaiie_foeva", { items: ITEMS, errorRows: [] }, { now: NOW, maxPosts: 30 });
    expect(data.source).toBe("Apify · TikTok Scraper (profil)");
    expect(data.account).toEqual({
      platform: "tiktok",
      handle: "shaiie_foeva",
      displayName: "Shaiie_Foeva",
      url: "https://www.tiktok.com/@shaiie_foeva",
      followers: 2200000,
      totalPosts: 1036,
      bio: "SHOP THE E-BOOK OUT NOW",
      verified: false,
    });
    expect(data.posts).toEqual([
      {
        id: "7536011122233344455",
        url: "https://www.tiktok.com/@shaiie_foeva/video/7536011122233344455",
        title: "3 habitudes qui ont changé ma peau ✨",
        text: "3 habitudes qui ont changé ma peau ✨ #skincare #routine",
        publishedAt: "2025-08-07T20:53:20.000Z",
        kind: "short_video",
        durationSec: 15,
        metrics: { views: 145900, likes: 23400, comments: 46, shares: 145, saves: 1637 },
        hashtags: ["skincare", "routine"],
        music: "Espresso – Sabrina Carpenter",
      },
      {
        id: "7535448384170331414",
        url: "https://www.tiktok.com/@shaiie_foeva/video/7535448384170331414",
        // No caption: a neutral label, never an invented title.
        title: "Carrousel TikTok sans légende",
        publishedAt: "2025-08-06T12:28:22.000Z",
        kind: "social_post",
        metrics: { views: 348100, likes: 3951, comments: 111, shares: 38, saves: 105 },
        hashtags: [],
      },
    ]);
    expect(data.warnings).toContain("1 carrousel(s) photo inclus (sans durée).");
    expect(data.ratiosAllowed).toBeUndefined();
  });

  it("turns the actor's documented error items into French errors", () => {
    const privateRun = splitApifyItems<ApifyTiktokProfileVideo>(ERRORS.private);
    expect(privateRun.errorRows[0].code).toBe("PROFILE_PRIVATE");
    expect(() => tiktokProfileToCreatorData("someuser", privateRun, { now: NOW, maxPosts: 30 })).toThrow(
      "Le compte TikTok @someuser est privé : ses vidéos ne sont pas accessibles.",
    );
    const missing = splitApifyItems<ApifyTiktokProfileVideo>(ERRORS.notFound);
    expect(() => tiktokProfileToCreatorData("missinguser", missing, { now: NOW, maxPosts: 30 })).toThrow(
      "Compte introuvable sur TikTok : vérifiez le pseudo (@missinguser).",
    );
    expect(tiktokProfileError("x", [{ error: "Profile has no videos", code: "PROFILE_EMPTY" }])?.message).toMatch(/^Aucune vidéo publique/);
    expect(() => tiktokProfileToCreatorData("x", { items: [], errorRows: [] }, { now: NOW, maxPosts: 30 })).toThrow(
      "Aucune vidéo publique trouvée sur le compte TikTok @x.",
    );
  });

  it("drops rows of other authors and other profile sections", () => {
    const other = { ...ITEMS[1], id: "1", webVideoUrl: "https://www.tiktok.com/@other/video/1", authorMeta: { name: "other" } };
    const repost = { ...ITEMS[1], id: "2", fromProfileSection: "reposts" };
    const data = tiktokProfileToCreatorData("shaiie_foeva", { items: [...ITEMS, other, repost], errorRows: [] }, { now: NOW, maxPosts: 30 });
    expect(data.posts.map((post) => post.id)).toEqual(["7536011122233344455", "7535448384170331414"]);
  });
});

describe("fetchTiktokCreator", () => {
  it("needs APIFY_TOKEN", async () => {
    await expect(fetchTiktokCreator("shaiie_foeva", options({}))).rejects.toThrow(/^TikTok nécessite APIFY_TOKEN/);
  });

  it("runs clockworks/tiktok-scraper (or APIFY_TIKTOK_ACTOR) once, with the profile input", async () => {
    const fetchMock = routeFetch([[/api\.apify\.com/, () => json(ITEMS, 201)]]);
    const data = await fetchTiktokCreator("shaiie_foeva", options({ APIFY_TOKEN: "apify_api_TEST" }, 25));
    expect(data.posts).toHaveLength(2);
    const [url] = calledUrls(fetchMock);
    expect(url).toMatch(/^https:\/\/api\.apify\.com\/v2\/actors\/clockworks~tiktok-scraper\/run-sync-get-dataset-items\?/);
    expect(new URL(url).searchParams.get("fields")).toContain("collectCount");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ profiles: ["shaiie_foeva"], resultsPerPage: 25 });

    await fetchTiktokCreator("shaiie_foeva", options({ APIFY_TOKEN: "apify_api_TEST", APIFY_TIKTOK_ACTOR: "clockworks~free-tiktok-scraper" }));
    expect(calledUrls(fetchMock)[1]).toContain("/actors/clockworks~free-tiktok-scraper/");
  });
});
