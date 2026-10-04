import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureViralInputs, viralInput } from "../../viral/__fixtures__/viral";
import type { ViralPostInput } from "../../viral/score";
import { clearCache } from "../cache";
import {
  applyAuthorFacts,
  buildFollowersDiscoveryUrl,
  buildYoutubeChannelsStatsUrl,
  enrichFollowers,
  instagramProfileFollowers,
  topInstagramOwners,
  youtubeChannelFacts,
  youtubeChannelIds,
} from "./enrich";

/** The fixture run before enrichment: no follower known on Instagram and YouTube. */
const raw: ViralPostInput[] = fixtureViralInputs.map((post) =>
  post.platform === "tiktok" ? post : { ...post, author: { handle: post.author.handle, url: post.author.url, ...(post.author.displayName ? { displayName: post.author.displayName } : {}) } },
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const signal = () => new AbortController().signal;

describe("pure helpers", () => {
  it("picks the unique owners of the most viewed reels whose followers are unknown", () => {
    expect(topInstagramOwners(raw)).toEqual(["prodmaline", "cafe.science", "cosy.evening", "julie.focus"]);
    expect(topInstagramOwners(raw, 2)).toEqual(["prodmaline", "cafe.science"]);
    const duplicates = [...raw, viralInput("instagram", "IG9", { title: "Autre", views: 999_999, handle: "prodmaline" })];
    expect(topInstagramOwners(duplicates, 3)).toEqual(["prodmaline", "cafe.science"]);
    expect(topInstagramOwners(fixtureViralInputs)).toEqual(["cafe.science"]);
  });

  it("collects the YouTube channel ids", () => {
    expect(youtubeChannelIds(raw)).toEqual(["UCaaaaaaaaaaaaaaaaaaaaaa", "UCbbbbbbbbbbbbbbbbbbbbbb", "UCcccccccccccccccccccccc"]);
  });

  it("builds a Business Discovery call limited to the follower count, and a 1-unit channels call", () => {
    const meta = new URL(buildFollowersDiscoveryUrl({ version: "v25.0", igUserId: "1784", token: "EAAtoken", username: "julie.focus" }));
    expect(meta.pathname).toBe("/v25.0/1784");
    expect(meta.searchParams.get("fields")).toBe("business_discovery.username(julie.focus){username,followers_count}");
    const youtube = new URL(buildYoutubeChannelsStatsUrl(["UCa", "UCb"], "AIzaKEY"));
    expect(youtube.pathname).toBe("/youtube/v3/channels");
    expect(Object.fromEntries(youtube.searchParams)).toEqual({ part: "snippet,statistics", id: "UCa,UCb", maxResults: "50", key: "AIzaKEY" });
  });

  it("reads subscribers (none when hidden) and handles from channels.list", () => {
    const facts = youtubeChannelFacts({
      items: [
        { id: "UCaaaaaaaaaaaaaaaaaaaaaa", snippet: { title: "Science Express", customUrl: "@scienceexpress" }, statistics: { subscriberCount: "1500000", hiddenSubscriberCount: false } },
        { id: "UCbbbbbbbbbbbbbbbbbbbbbb", snippet: { title: "Santé Facile" }, statistics: { subscriberCount: "0", hiddenSubscriberCount: true } },
      ],
    });
    expect(facts.get("UCaaaaaaaaaaaaaaaaaaaaaa")).toEqual({ followers: 1_500_000, handle: "scienceexpress", displayName: "Science Express" });
    expect(facts.get("UCbbbbbbbbbbbbbbbbbbbbbb")).toEqual({ followers: undefined, handle: undefined, displayName: "Santé Facile" });
  });

  it("reads the profile scraper's follower counts", () => {
    expect(instagramProfileFollowers([{ username: "Julie.Focus", followersCount: 800 }, { username: "x" }, { followersCount: 3 }])).toEqual(
      new Map([["julie.focus", 800]]),
    );
  });

  it("applies the facts to the posts of one platform only, without mutating them", () => {
    const facts = new Map([["UCaaaaaaaaaaaaaaaaaaaaaa", { followers: 1_500_000, handle: "scienceexpress" }]]);
    const result = applyAuthorFacts(raw, "youtube", facts);
    expect(result.find((post) => post.id === "youtube:yt1")?.author).toEqual({
      handle: "scienceexpress",
      displayName: "Science Express",
      followers: 1_500_000,
      url: "https://www.youtube.com/@scienceexpress",
    });
    expect(raw.find((post) => post.id === "youtube:yt1")?.author.followers).toBeUndefined();
    expect(applyAuthorFacts(raw, "instagram", facts)).toEqual(raw);
  });
});

describe("enrichFollowers", () => {
  beforeEach(() => clearCache());
  afterEach(() => vi.unstubAllGlobals());

  function stubNetwork({ metaFails = new Set<string>() } = {}) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://graph.facebook.com/")) {
        const username = /username\(([^)]+)\)/.exec(decodeURIComponent(url))?.[1] ?? "";
        if (metaFails.has(username)) {
          return json({ error: { message: "Invalid user id", code: 110, type: "OAuthException" } }, 400);
        }
        return json({ business_discovery: { username, followers_count: { prodmaline: 120_000, "cosy.evening": 90_000, "julie.focus": 800 }[username] ?? 1 } });
      }
      if (url.includes("api.apify.com")) {
        const { usernames } = JSON.parse(init?.body as string) as { usernames: string[] };
        return json(usernames.map((username) => ({ username, followersCount: username === "cafe.science" ? 15_000 : 2 })));
      }
      if (url.includes("/youtube/v3/channels")) {
        return json({
          items: [
            { id: "UCaaaaaaaaaaaaaaaaaaaaaa", snippet: { title: "Science Express", customUrl: "@scienceexpress" }, statistics: { subscriberCount: "1500000" } },
            { id: "UCbbbbbbbbbbbbbbbbbbbbbb", snippet: { title: "Santé Facile" }, statistics: { hiddenSubscriberCount: true } },
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("uses Business Discovery first, ONE Apify run for the accounts Meta cannot read, and channels.list for YouTube", async () => {
    const fetchMock = stubNetwork({ metaFails: new Set(["cafe.science"]) });
    const env = { INSTAGRAM_ACCESS_TOKEN: "EAAsecret", INSTAGRAM_USER_ID: "1784", APIFY_TOKEN: "apify_api_x", YOUTUBE_API_KEY: "AIzaKEY" };
    const { posts, notes } = await enrichFollowers(raw, { env, signal: signal() });

    const followers = Object.fromEntries(posts.map((post) => [post.id, post.author.followers]));
    expect(followers).toMatchObject({
      "instagram:IG1abc": 800,
      "instagram:IG2def": 120_000,
      "instagram:IG3ghi": 90_000,
      "instagram:IG4jkl": 15_000,
      "youtube:yt1": 1_500_000,
      "youtube:yt2": undefined,
      "youtube:yt3": undefined,
      // TikTok rows already carried them.
      "tiktok:tt1": 5_000,
    });
    expect(posts.find((post) => post.id === "youtube:yt1")?.author.handle).toBe("scienceexpress");
    expect(posts.map((post) => post.id)).toEqual(raw.map((post) => post.id));

    const apifyCalls = fetchMock.mock.calls.filter(([url]) => url.includes("api.apify.com"));
    expect(apifyCalls).toHaveLength(1);
    expect(JSON.parse(apifyCalls[0][1]?.body as string)).toEqual({ usernames: ["cafe.science"] });
    expect(apifyCalls[0][0]).toContain("apify~instagram-profile-scraper");
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/youtube/v3/channels"))).toHaveLength(1);

    expect(notes.instagram).toEqual([
      "Abonnés lus pour 4 des 4 auteurs des 15 reels les plus vus (3 via l'API Meta, 1 via Apify) : multiplicateur calculable pour 4 reels sur 4.",
    ]);
    expect(notes.youtube).toEqual([
      "Abonnés lus pour 1 chaîne sur 3 (arrondis par YouTube à 3 chiffres significatifs).",
      "1 chaîne masque son nombre d'abonnés.",
    ]);
  });

  it("caches the followers of the same owners for 24 h", async () => {
    const fetchMock = stubNetwork();
    const env = { APIFY_TOKEN: "apify_api_x" };
    await enrichFollowers(raw, { env, signal: signal() });
    await enrichFollowers(raw, { env, signal: signal() });
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("api.apify.com"))).toHaveLength(1);
  });

  it("never fails the analysis: what cannot be read stays unknown, with a French note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { type: "not-enough-usage-to-run-paid-actor", message: "x" } }, 402)),
    );
    const { posts, notes } = await enrichFollowers(raw, { env: { APIFY_TOKEN: "apify_api_x", YOUTUBE_API_KEY: "AIzaKEY" }, signal: signal() });
    expect(posts.filter((post) => post.platform === "instagram").every((post) => post.author.followers === undefined)).toBe(true);
    expect(notes.instagram?.at(-1)).toMatch(/^Abonnés Instagram en partie indisponibles \(Apify \(profils Instagram\) : Crédit Apify épuisé/);
    expect(notes.youtube?.[0]).toMatch(/^Abonnés YouTube indisponibles \(/);
    expect(JSON.stringify(notes)).not.toContain("AIzaKEY");
  });

  it("does nothing for a TikTok-only run", async () => {
    const fetchMock = stubNetwork();
    const tiktok = raw.filter((post) => post.platform === "tiktok");
    expect(await enrichFollowers(tiktok, { env: { APIFY_TOKEN: "x" }, signal: signal() })).toEqual({ posts: tiktok, notes: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
