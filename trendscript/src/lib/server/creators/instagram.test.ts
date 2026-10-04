import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { calledUrls, fixtureJson, json, routeFetch } from "./__fixtures__/fetch-routes";
import {
  INSTAGRAM_PROFILE_ACTOR,
  INSTAGRAM_REEL_ACTOR,
  buildCreatorDiscoveryUrl,
  buildInstagramProfileInput,
  buildInstagramReelInput,
  businessDiscoveryToCreatorData,
  fetchInstagramCreator,
  instagramApifyToCreatorData,
  instagramReelsToCreatorPosts,
  type ApifyInstagramProfile,
  type ApifyInstagramReel,
  type CreatorDiscoveryResponse,
} from "./instagram";

const NOW = Date.parse("2026-10-04T08:00:00Z");
const REELS = fixtureJson<{ items: ApifyInstagramReel[] }>("apify-instagram-reels.json").items;
const NASA = fixtureJson<{ items: ApifyInstagramProfile[] }>("apify-instagram-profile.json").items[0];
const PROFILE: ApifyInstagramProfile = { ...NASA, username: "lyssamariexo", fullName: "alyssa marie" };
const DISCOVERY = fixtureJson<{ response: CreatorDiscoveryResponse }>("graph-business-discovery.creator.json").response;

const ok = <T>(items: T[], errorRows: { error: string; errorDescription?: string }[] = []) => ({
  ok: true as const,
  value: { items, errorRows },
});

function options(env: Record<string, string>, maxPosts = 30) {
  return { env, signal: new AbortController().signal, now: NOW, geo: "FR", language: "fr", maxPosts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Apify inputs (checked against the actors' input schemas)", () => {
  it("asks the reel scraper for the latest reels of one profile, pinned ones skipped", () => {
    expect(buildInstagramReelInput("lyssamariexo", 30)).toEqual({ username: ["lyssamariexo"], resultsLimit: 30, skipPinnedPosts: true });
    expect(buildInstagramReelInput("x", 10, { includeSharesCount: true })).toMatchObject({ includeSharesCount: true });
    expect(buildInstagramProfileInput("lyssamariexo")).toEqual({ usernames: ["lyssamariexo"] });
  });
});

describe("instagramReelsToCreatorPosts", () => {
  it("maps plays as views, -1 likes as hidden, licensed audio as music, permalinks only", () => {
    const { posts, hiddenLikes, missingViews } = instagramReelsToCreatorPosts(REELS);
    expect(hiddenLikes).toBe(1);
    expect(missingViews).toBe(1);
    expect(posts[0]).toEqual({
      id: "DX7lzTOJ1p6",
      url: "https://www.instagram.com/reel/DX7lzTOJ1p6/",
      // Trailing hashtags are trimmed from titles (kept in the text).
      title: "this is your sign to stop neglecting your scalp 🤭",
      text: expect.stringMatching(/^this is your sign to stop neglecting your scalp 🤭 #ad there are so many reasons/),
      publishedAt: "2026-05-04T21:05:19.000Z",
      kind: "short_video",
      durationSec: 51,
      metrics: { views: 10977, likes: 286, comments: 24, shares: undefined },
      hashtags: ["ad", "sephorasquad", "sephora"],
      music: undefined,
      pinned: undefined,
      transcript: undefined,
    });
    expect(posts[1]).toMatchObject({ metrics: { views: 355615, likes: undefined }, music: "Espresso – Sabrina Carpenter" });
    expect(posts[1].hashtags).toEqual(["sephorapartner", "sephorasavingsevent", "mysephorastorefrontsse", "sephora"]);
    // videoViewCount (deprecated by Instagram) is never used as a stand-in for plays.
    expect(posts[2].metrics.views).toBeUndefined();
  });
});

describe("instagramApifyToCreatorData", () => {
  it("combines reels and profile (followers, posts count, bio, verified)", () => {
    const data = instagramApifyToCreatorData(
      "lyssamariexo",
      { reels: ok(REELS), profile: ok([PROFILE]) },
      { now: NOW, maxPosts: 30, sharesRequested: false },
    );
    expect(data.source).toBe("Apify · Instagram Reel Scraper + Profile Scraper");
    expect(data.account).toEqual({
      platform: "instagram",
      handle: "lyssamariexo",
      displayName: "alyssa marie",
      url: "https://www.instagram.com/lyssamariexo/",
      followers: 96323377,
      totalPosts: 4519,
      bio: "🚀 🌎 Exploring the universe and our home planet. Verification: nasa.gov/socialmedia",
      verified: true,
    });
    expect(data.posts.map((post) => post.id)).toEqual(["DX7lzTOJ1p6", "DXSL4JKEzK1", "DW7Cavjjv4_"]);
    expect(data.ratiosAllowed).toBeUndefined();
    expect(data.warnings).toEqual([
      "Vues non fournies par Instagram pour 1 reel.",
      "Likes masqués par le créateur sur 1 reel.",
      expect.stringMatching(/^Partages Instagram non récupérés : option payante .* APIFY_INSTAGRAM_SHARES=1/),
      "Seuls les reels sont analysés (3 reels, épinglés exclus) : les photos et carrousels ne sont pas lus par cette source.",
    ]);
  });

  it("keeps the reels when the profile run fails, and says the audience is unknown", () => {
    const data = instagramApifyToCreatorData(
      "lyssamariexo",
      { reels: ok(REELS), profile: { ok: false, error: new SourceError("Apify (apify/instagram-profile-scraper) : Délai dépassé (150 s)") } },
      { now: NOW, maxPosts: 2, sharesRequested: false },
    );
    expect(data.posts).toHaveLength(2);
    expect(data.account.displayName).toBe("alyssa marie");
    expect(data.account.followers).toBeUndefined();
    expect(data.warnings[0]).toMatch(/^Profil Instagram indisponible/);
    expect(data.warnings[1]).toMatch(/^Nombre d'abonnés Instagram indisponible : la comparaison vues \/ abonnés/);
  });

  it("explains private, unknown and reel-less accounts in French", () => {
    const run = (reels: ApifyInstagramReel[], profile: ReturnType<typeof ok<ApifyInstagramProfile>>) => () =>
      instagramApifyToCreatorData("lyssamariexo", { reels: ok(reels), profile }, { now: NOW, maxPosts: 30, sharesRequested: false });
    expect(run(REELS, ok([{ ...PROFILE, private: true }]))).toThrow("Le compte Instagram @lyssamariexo est privé");
    expect(run([], ok([], [{ error: "not_found", errorDescription: "Profile does not exist" }]))).toThrow(
      "Compte introuvable sur Instagram : vérifiez le pseudo (@lyssamariexo).",
    );
    expect(run([], ok([PROFILE]))).toThrow("Aucun reel public sur le compte Instagram @lyssamariexo");
  });
});

describe("Meta Business Discovery", () => {
  it("asks only public fields, with the post count as media limit", () => {
    const url = new URL(
      buildCreatorDiscoveryUrl({ version: "v25.0", igUserId: "17841405309211844", token: "EAAtoken", username: "hugodecrypte", limit: 30 }),
    );
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v25.0/17841405309211844");
    expect(url.searchParams.get("fields")).toBe(
      "business_discovery.username(hugodecrypte){username,biography,followers_count,media_count,media.limit(30){id,caption,media_type,media_product_type,like_count,comments_count,view_count,permalink,shortcode,timestamp}}",
    );
    expect(url.searchParams.get("fields")).not.toContain(",name,");
  });

  it("maps reels, carousels and hidden likes; no shares or saves (Meta withholds them)", () => {
    const data = businessDiscoveryToCreatorData(DISCOVERY, "hugodecrypte", { now: NOW, maxPosts: 30 });
    expect(data.account).toEqual({
      platform: "instagram",
      handle: "hugodecrypte",
      url: "https://www.instagram.com/hugodecrypte/",
      followers: 267788,
      totalPosts: 1205,
      bio: "L'actu expliquée simplement 🗞️",
    });
    expect(data.posts.map((post) => [post.id, post.kind, post.metrics])).toEqual([
      ["DPtest0002", "social_post", { likes: 2997, comments: 11 }],
      ["DPtest0001", "short_video", { views: 7757, likes: 5837, comments: 50 }],
      ["DPtest0003", "short_video", { views: 41200, comments: 28 }],
    ]);
    expect(data.posts[1]).toMatchObject({
      url: "https://www.instagram.com/reel/DPtest0001/",
      title: "Ce qu'il faut retenir du budget 2027 en 60 secondes 👇",
      hashtags: ["actu", "budget"],
      publishedAt: "2026-09-30T18:00:00.000Z",
    });
    expect(data.warnings.join(" ")).toMatch(/vues sponsorisées/);
    expect(data.warnings).toContain("Likes masqués par le créateur sur 1 publication.");
    expect(data.warnings).toContain("1 photo ou carrousel inclus : Meta ne donne des vues que pour les reels.");
  });
});

describe("fetchInstagramCreator", () => {
  it("refuses without any configuration (French, actionable)", async () => {
    await expect(fetchInstagramCreator("hugodecrypte", options({}))).rejects.toThrow(
      "Instagram nécessite APIFY_TOKEN ou l'API Meta (INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID) : voir Réglages.",
    );
  });

  it("uses Meta when configured; a non-professional account is explained", async () => {
    routeFetch([
      [
        /graph\.facebook\.com/,
        () =>
          json(
            { error: { message: "Invalid user id", type: "OAuthException", code: 110, error_subcode: 2207013, fbtrace_id: "x" } },
            400,
          ),
      ],
    ]);
    await expect(
      fetchInstagramCreator("moncompteperso", options({ INSTAGRAM_ACCESS_TOKEN: "EAAsecret123456789", INSTAGRAM_USER_ID: "1784" })),
    ).rejects.toThrow(/Compte Instagram @moncompteperso introuvable ou non professionnel : l'API Meta ne peut lire que les comptes Créateur ou Entreprise/);
  });

  it("falls back to Apify (two parallel runs) when Meta cannot read the account", async () => {
    const fetchMock = routeFetch([
      [/graph\.facebook\.com/, () => json({ error: { message: "Invalid user id", code: 110, error_subcode: 2207013 } }, 400)],
      [/instagram-reel-scraper/, () => json(REELS, 201)],
      [/instagram-profile-scraper/, () => json([PROFILE], 201)],
    ]);
    const data = await fetchInstagramCreator(
      "lyssamariexo",
      options({ INSTAGRAM_ACCESS_TOKEN: "EAAsecret123456789", INSTAGRAM_USER_ID: "1784", APIFY_TOKEN: "apify_api_TEST" }),
    );
    expect(data.source).toMatch(/^Apify/);
    expect(data.warnings[0]).toBe("API Meta inutilisable pour ce compte (compte introuvable ou non professionnel) : données récupérées via Apify.");
    const urls = calledUrls(fetchMock);
    expect(urls.some((url) => url.includes(`/actors/${INSTAGRAM_REEL_ACTOR}/run-sync-get-dataset-items`))).toBe(true);
    expect(urls.some((url) => url.includes(`/actors/${INSTAGRAM_PROFILE_ACTOR}/run-sync-get-dataset-items`))).toBe(true);
    const reelCall = fetchMock.mock.calls.find(([input]) => String(input).includes("reel-scraper"))!;
    expect(JSON.parse(String(reelCall[1]?.body))).toEqual({ username: ["lyssamariexo"], resultsLimit: 30, skipPinnedPosts: true });
    expect(urls.every((url) => !url.includes("apify_api_TEST"))).toBe(true);
  });
});
