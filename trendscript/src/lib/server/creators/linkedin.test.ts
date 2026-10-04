import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApifyLinkedinPost } from "../sources/linkedin-apify";
import { readFirecrawlSearch } from "../sources/linkedin-web";
import { calledUrls, fixtureJson, json, routeFetch } from "./__fixtures__/fetch-routes";
import {
  LINKEDIN_NO_AUDIENCE,
  buildLinkedinProfilePostsInput,
  fetchLinkedinCreator,
  fetchLinkedinCreatorWeb,
  linkedinApifyToCreatorData,
  linkedinCreatorSearchQuery,
  linkedinHitsToCreatorPosts,
} from "./linkedin";

const NOW = Date.parse("2026-10-04T08:00:00Z");
const POSTS = fixtureJson<{ items: ApifyLinkedinPost[] }>("apify-linkedin-profile-posts.json").items;
const SEARCH = fixtureJson<{ response: unknown }>("firecrawl-search.linkedin-creator.json").response;
const HITS = readFirecrawlSearch(SEARCH);

function options(env: Record<string, string>, maxPosts = 30) {
  return { env, signal: new AbortController().signal, now: NOW, geo: "FR", language: "fr", maxPosts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildLinkedinProfilePostsInput (checked against harvestapi/linkedin-profile-posts' input schema)", () => {
  it("targets the member or company URL, own posts of the last 3 months", () => {
    expect(buildLinkedinProfilePostsInput("williamhgates", 30)).toEqual({
      targetUrls: ["https://www.linkedin.com/in/williamhgates/"],
      maxPosts: 30,
      postedLimit: "3months",
      includeReposts: false,
      includeQuotePosts: true,
    });
    expect(buildLinkedinProfilePostsInput("company/google", 10).targetUrls).toEqual(["https://www.linkedin.com/company/google/"]);
  });
});

describe("linkedinApifyToCreatorData", () => {
  it("maps reactions, comments and reposts, drops other authors, says views/followers are unavailable", () => {
    const data = linkedinApifyToCreatorData("williamhgates", { items: POSTS, errorRows: [] }, { now: NOW, maxPosts: 30 });
    expect(data.source).toBe("Apify · LinkedIn Profile Posts (HarvestAPI)");
    expect(data.account).toEqual({
      platform: "linkedin",
      handle: "williamhgates",
      displayName: "Bill Gates",
      url: "https://www.linkedin.com/in/williamhgates/",
      bio: "Chair, Gates Foundation and Founder, Breakthrough Energy",
    });
    expect(data.posts.map((post) => [post.id, post.publishedAt, post.metrics])).toEqual([
      ["7331012345678901234", "2025-05-23T12:00:00.000Z", { likes: 5120, comments: 410, shares: 260 }],
      ["7329207003942125568", "2025-05-16T18:11:59.821Z", { likes: 2916, comments: 328, shares: 153 }],
    ]);
    expect(data.posts[0]).toMatchObject({
      url: "https://www.linkedin.com/posts/williamhgates_malaria-activity-7331012345678901234-AbCd",
      title: "Why I'm optimistic about ending malaria.",
      kind: "social_post",
      hashtags: ["malaria", "globalhealth"],
    });
    expect(data.warnings[0]).toBe(LINKEDIN_NO_AUDIENCE);
    expect(data.warnings).toContain("1 republication d'autres auteurs écartée(s).");
  });

  it("explains an empty result", () => {
    expect(() => linkedinApifyToCreatorData("personne-xyz", { items: [], errorRows: [] }, { now: NOW, maxPosts: 30 })).toThrow(
      /^Aucune publication LinkedIn trouvée pour @personne-xyz sur les 3 derniers mois/,
    );
  });
});

describe("linkedinHitsToCreatorPosts (real Firecrawl results)", () => {
  it("keeps only the account's permalinks, dated from the activity id, newest first", () => {
    const posts = linkedinHitsToCreatorPosts(HITS, NOW, "romainfargeot");
    expect(posts.map((post) => [post.id, post.publishedAt])).toEqual([
      ["7511658849477640192", "2026-10-02T05:30:29.588Z"],
      ["7508397329566330881", "2026-09-23T05:30:22.645Z"],
      ["7500787098082500608", "2026-09-02T05:30:02.068Z"],
      ["7500092854417948672", "2026-08-31T07:31:21.480Z"],
      ["7492814587428286464", "2026-08-11T05:30:07.406Z"],
      ["7488465994231857152", "2026-07-30T05:30:21.995Z"],
      ["7478406417951993856", "2026-07-02T11:17:12.112Z"],
      ["7387008670749863936", "2025-10-23T06:15:11.091Z"],
    ]);
    expect(posts.every((post) => post.url.startsWith("https://fr.linkedin.com/posts/romainfargeot_"))).toBe(true);
    expect(posts.every((post) => Object.keys(post.metrics).length === 0)).toBe(true);
  });

  it("strips LinkedIn boilerplate and the author's headline from the excerpts", () => {
    const posts = linkedinHitsToCreatorPosts(HITS, NOW, "romainfargeot");
    const byId = new Map(posts.map((post) => [post.id, post]));
    expect(byId.get("7511658849477640192")?.text).toBe(
      "« De plus en plus de Français ouvrent leur assurance-vie au Luxembourg. » Et ils ont de bonnes raisons de le faire. Les Échos",
    );
    expect(byId.get("7492814587428286464")?.title).toBe(
      "Alphabet vient de dévoiler son portefeuille complet au T2 2026. 99 milliards de dollars (et trois thèses d'investissement assez claires)",
    );
    // Real headline from the search title (trailing ellipsis removed).
    expect(byId.get("7500787098082500608")?.title).toBe("C'est quand même fascinant. On nous explique d'un côté que");
    // Generic "Post de …" title and boilerplate-only excerpt: the permalink slug is the only real text.
    expect(byId.get("7500092854417948672")?.title).toBe("les 20 erreurs les plus communes des investisseurs");
    for (const post of posts) {
      expect(post.text ?? "").not.toMatch(/Je t'aide à bâtir|Voir le profil|Post de Romain/);
    }
  });

  it("without a handle keeps every LinkedIn post (the caller filters)", () => {
    expect(linkedinHitsToCreatorPosts(HITS, NOW)).toHaveLength(10);
  });
});

describe("fetchLinkedinCreatorWeb / fetchLinkedinCreator", () => {
  it("searches the account's posts with any search function (HTML edition)", async () => {
    const search = vi.fn(async () => HITS);
    const data = await fetchLinkedinCreatorWeb("romainfargeot", { geo: "FR", signal: new AbortController().signal, now: NOW, maxPosts: 5 }, search);
    expect(search).toHaveBeenCalledWith('site:linkedin.com/posts "romainfargeot"', expect.objectContaining({ limit: 15, tbs: "qdr:y", location: "France" }));
    expect(linkedinCreatorSearchQuery("company/google")).toBe('site:linkedin.com/posts "google"');
    expect(data.posts).toHaveLength(5);
    expect(data.account).toEqual({
      platform: "linkedin",
      handle: "romainfargeot",
      displayName: "Romain Fargeot",
      url: "https://www.linkedin.com/in/romainfargeot/",
    });
    expect(data.source).toBe("Recherche web (Firecrawl) · publications LinkedIn indexées");
    expect(data.warnings.join(" ")).toMatch(/sans réactions, commentaires ni vues/);
  });

  it("needs APIFY_TOKEN or FIRECRAWL_API_KEY", async () => {
    await expect(fetchLinkedinCreator("romainfargeot", options({}))).rejects.toThrow(/^LinkedIn nécessite APIFY_TOKEN/);
  });

  it("uses harvestapi/linkedin-profile-posts with APIFY_TOKEN", async () => {
    const fetchMock = routeFetch([[/api\.apify\.com/, () => json(POSTS, 201)]]);
    const data = await fetchLinkedinCreator("williamhgates", options({ APIFY_TOKEN: "apify_api_TEST" }));
    expect(calledUrls(fetchMock)[0]).toContain("/actors/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?");
    expect(data.posts).toHaveLength(2);
  });

  it("falls back to the web search when Apify fails", async () => {
    routeFetch([
      [/api\.apify\.com/, () => json({ error: { type: "not-enough-usage-to-run-paid-actor", message: "No credit" } }, 402)],
      [/api\.firecrawl\.dev\/v2\/search/, () => json(SEARCH)],
    ]);
    const data = await fetchLinkedinCreator("romainfargeot", options({ APIFY_TOKEN: "apify_api_TEST", FIRECRAWL_API_KEY: "fc-TEST" }));
    expect(data.source).toMatch(/^Recherche web/);
    expect(data.warnings[0]).toMatch(/^Apify indisponible \(Crédit Apify épuisé/);
  });
});
