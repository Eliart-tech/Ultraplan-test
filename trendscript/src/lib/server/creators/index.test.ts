import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREATOR_PLATFORMS } from "../../types";
import { clearCache } from "../cache";
import { fixture, routeFetch, text } from "./__fixtures__/fetch-routes";
import { creatorCapabilities, fetchCreator, linkedinHitsToCreatorPosts, normalizeHandle } from "./index";

const NOW = Date.parse("2026-10-04T08:00:00Z");

function options(env: Record<string, string> = {}, maxPosts = 30) {
  return { env, signal: new AbortController().signal, now: NOW, geo: "FR", language: "fr", maxPosts };
}

beforeEach(() => clearCache());
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("creatorCapabilities", () => {
  it("lists every platform, in order, honestly when nothing is configured", () => {
    const statuses = creatorCapabilities({});
    expect(statuses.map((status) => status.platform)).toEqual([...CREATOR_PLATFORMS]);
    const by = Object.fromEntries(statuses.map((status) => [status.platform, status]));
    expect(by.youtube).toMatchObject({ available: true, via: "Page publique + flux RSS officiel (15 dernières vidéos)" });
    expect(by.youtube.note).toMatch(/YOUTUBE_API_KEY/);
    expect(by.youtube.note).toMatch(/YT_DERIVED_METRICS_APPROVED/);
    expect(by.instagram).toMatchObject({ available: false, via: "Non configuré" });
    expect(by.instagram.note).toMatch(/APIFY_TOKEN .* INSTAGRAM_ACCESS_TOKEN \+ INSTAGRAM_USER_ID/);
    expect(by.tiktok).toMatchObject({ available: false });
    expect(by.linkedin).toMatchObject({ available: false });
    expect(by.linkedin.note).toMatch(/FIRECRAWL_API_KEY/);
  });

  it("reflects each route the environment opens", () => {
    const by = (env: Record<string, string>) => Object.fromEntries(creatorCapabilities(env).map((status) => [status.platform, status]));
    const apify = by({ APIFY_TOKEN: "apify_api_x" });
    expect(apify.instagram).toMatchObject({ available: true, via: "Apify (Instagram Reel Scraper + Profile Scraper)" });
    expect(apify.tiktok).toMatchObject({ available: true, via: "Apify (clockworks/tiktok-scraper)" });
    expect(apify.linkedin).toMatchObject({ available: true, via: "Apify (LinkedIn Profile Posts)" });
    expect(apify.linkedin.note).toMatch(/ni vues ni nombre d'abonnés/);

    const meta = by({ INSTAGRAM_ACCESS_TOKEN: "EAA", INSTAGRAM_USER_ID: "1784" });
    expect(meta.instagram).toMatchObject({ available: true, via: "API Meta (Business Discovery)" });
    expect(meta.instagram.note).toMatch(/Créateur ou Entreprise/);

    expect(by({ FIRECRAWL_API_KEY: "fc-x" }).linkedin).toMatchObject({ available: true, via: "Recherche web (Firecrawl)" });
    const youtube = by({ YOUTUBE_API_KEY: "AIza", YT_DERIVED_METRICS_APPROVED: "true" }).youtube;
    expect(youtube.via).toBe("YouTube Data API (50 dernières vidéos)");
    expect(youtube.note).toMatch(/Ratios vues ÷ abonnés activés/);
    expect(by({ APIFY_TOKEN: "x", APIFY_TIKTOK_ACTOR: "clockworks~free-tiktok-scraper" }).tiktok.via).toBe(
      "Apify (clockworks/free-tiktok-scraper)",
    );
  });
});

describe("fetchCreator", () => {
  it("rejects an invalid handle in French before any network call", async () => {
    const fetchMock = routeFetch([]);
    await expect(fetchCreator("instagram", "https://www.instagram.com/p/DX7lzTOJ1p6/", options())).rejects.toThrow(
      "Pseudo invalide : « https://www.instagram.com/p/DX7lzTOJ1p6/ ». Indiquez @pseudo ou l'adresse du profil.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a platform that is not configured", async () => {
    await expect(fetchCreator("tiktok", "@shaiie_foeva", options())).rejects.toThrow(/TikTok nécessite APIFY_TOKEN/);
  });

  it("normalises the handle, caps the post count and caches 6 h per platform + handle + count", async () => {
    const fetchMock = routeFetch([
      [/youtube\.com\/@Squeezie\/videos$/, () => text(fixture("youtube-channel-page.squeezie.html"))],
      [/feeds\/videos\.xml/, () => text(fixture("youtube-rss.squeezie.xml"), 200, "application/atom+xml")],
    ]);
    const first = await fetchCreator("youtube", "https://www.youtube.com/@Squeezie", options({}, 500));
    expect(first.account.handle).toBe("Squeezie");
    expect(first.posts).toHaveLength(15);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Same channel typed differently, same (capped) count: served from the cache.
    const again = await fetchCreator("youtube", "@squeezie", options({}, 50));
    expect(again).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-exports the pure helpers other modules rely on", () => {
    expect(normalizeHandle("tiktok", "@X_y")).toBe("x_y");
    expect(linkedinHitsToCreatorPosts([], NOW)).toEqual([]);
  });
});
