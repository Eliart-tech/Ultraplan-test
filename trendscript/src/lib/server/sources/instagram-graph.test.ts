import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../cache";
import {
  GraphApiError,
  appUsagePercent,
  buildBusinessDiscoveryUrl,
  buildHashtagSearchUrl,
  buildHashtagTopMediaUrl,
  businessDiscoveryToSignals,
  graphError,
  graphVersion,
  hashtagMediaToSignals,
  instagramGraphConnector,
  parseWatchAccounts,
  type BusinessDiscoveryResponse,
  type HashtagMediaResponse,
} from "./instagram-graph";
import type { SourceContext } from "./types";

/** Test fixtures (payloads shaped like Meta's documented responses; error token one captured live). */
const raw = (name: string) =>
  JSON.stringify((JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8")) as { response: unknown }).response);

const TOKEN = "EAAGtestTOKEN1234567890abcdef";
const IG_USER = "17841405309211844";
const NOW = Date.parse("2026-10-02T12:00:00Z");
const auth = { version: "v25.0", igUserId: IG_USER, token: TOKEN };

function ctx(partial: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "actu",
    keywords: [],
    signal: new AbortController().signal,
    now: NOW,
    env: { INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: IG_USER, INSTAGRAM_WATCH_ACCOUNTS: "@hugodecrypte" },
    ...partial,
  };
}

type Route = { match: (url: URL) => boolean; body: string; status?: number; headers?: Record<string, string> };

function graphRouter(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const route = routes.find((r) => r.match(url));
    if (!route) throw new Error(`unexpected URL ${url.pathname}`);
    return new Response(route.body, { status: route.status ?? 200, headers: route.headers });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const isDiscovery = (username: string) => (url: URL) =>
  url.pathname === `/v25.0/${IG_USER}` && (url.searchParams.get("fields") ?? "").includes(`username(${username})`);
const isHashtagSearch = (url: URL) => url.pathname === "/v25.0/ig_hashtag_search";
const isTopMedia = (url: URL) => url.pathname.endsWith("/top_media");

beforeEach(() => clearCache());
afterEach(() => vi.unstubAllGlobals());

describe("configuration helpers", () => {
  it("parses watched accounts from usernames, @handles and profile URLs (max 10)", () => {
    expect(parseWatchAccounts("@HugoDecrypte, konbini; https://www.instagram.com/brut/ bad!name")).toEqual({
      accounts: ["hugodecrypte", "konbini", "brut"],
      invalid: ["bad!name"],
    });
    expect(parseWatchAccounts(Array.from({ length: 12 }, (_, i) => `a${i}`).join(",")).accounts).toHaveLength(10);
    expect(parseWatchAccounts(undefined)).toEqual({ accounts: [], invalid: [] });
  });

  it("defaults to Graph v25.0 and accepts a valid override", () => {
    expect(graphVersion({})).toBe("v25.0");
    expect(graphVersion({ INSTAGRAM_GRAPH_VERSION: "v26.0" })).toBe("v26.0");
    expect(graphVersion({ INSTAGRAM_GRAPH_VERSION: "latest" })).toBe("v25.0");
  });

  it("is configured by token + IG user id", () => {
    expect(instagramGraphConnector.isConfigured({ INSTAGRAM_ACCESS_TOKEN: TOKEN })).toBe(false);
    expect(instagramGraphConnector.isConfigured({ INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: IG_USER })).toBe(true);
  });
});

describe("request builders", () => {
  it("builds the Business Discovery field expansion", () => {
    const url = new URL(buildBusinessDiscoveryUrl({ ...auth, username: "hugodecrypte" }));
    expect(url.origin + url.pathname).toBe(`https://graph.facebook.com/v25.0/${IG_USER}`);
    expect(url.searchParams.get("fields")).toBe(
      "business_discovery.username(hugodecrypte){username,name,followers_count,media_count,media.limit(25){id,caption,media_type,media_product_type,like_count,comments_count,view_count,permalink,timestamp,thumbnail_url}}",
    );
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("builds the hashtag search and top_media calls with the documented fields only", () => {
    expect(buildHashtagSearchUrl({ ...auth, hashtag: "batchcooking" })).toBe(
      `https://graph.facebook.com/v25.0/ig_hashtag_search?user_id=${IG_USER}&q=batchcooking&access_token=${TOKEN}`,
    );
    const top = new URL(buildHashtagTopMediaUrl({ ...auth, hashtagId: "17843857450040591" }));
    expect(top.pathname).toBe("/v25.0/17843857450040591/top_media");
    expect(Object.fromEntries(top.searchParams)).toEqual({
      user_id: IG_USER,
      fields: "id,caption,media_type,comments_count,like_count,permalink,timestamp",
      limit: "50",
      access_token: TOKEN,
    });
  });
});

describe("response mapping", () => {
  it("keeps recent reels of a watched account with views and followers", () => {
    const response = JSON.parse(raw("graph-business-discovery.json")) as BusinessDiscoveryResponse;
    const signals = businessDiscoveryToSignals(response, "hugodecrypte", NOW);
    expect(signals.map((s) => s.url)).toEqual([
      "https://www.instagram.com/reel/DPtest0001/",
      "https://www.instagram.com/reel/DPtest0004/",
    ]);
    expect(signals[0]).toMatchObject({
      id: expect.stringMatching(/^instagram_graph:/),
      source: "instagram_graph",
      platform: "instagram",
      kind: "short_video",
      title: "Ce qu'il faut retenir du budget 2027 en 60 secondes 👇",
      author: "@hugodecrypte",
      publishedAt: "2026-09-30T18:00:00.000Z",
      metrics: { views: 7757, likes: 5837, comments: 50, followers: 267788 },
      tags: ["actu", "budget"],
      query: "@hugodecrypte",
    });
    expect(signals[1].metrics.likes).toBeUndefined();
  });

  it("keeps hashtag top videos without views or author", () => {
    const response = JSON.parse(raw("graph-hashtag-top-media.json")) as HashtagMediaResponse;
    const signals = hashtagMediaToSignals(response, "batchcooking", NOW);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      url: "https://www.instagram.com/reel/DPhash0001/",
      metrics: { likes: 9120, comments: 240 },
      query: "batchcooking",
    });
    expect(signals[0].author).toBeUndefined();
    expect(signals[0].metrics.views).toBeUndefined();
    expect(signals[0].text).toContain("vues et auteur non fournis par Meta");
    expect(signals[1].publishedAt).toBe(new Date(1790800000 * 1000).toISOString());
  });
});

describe("graphError", () => {
  it("maps the real invalid-token response (code 190)", () => {
    const error = graphError(400, raw("graph-error.invalid-token.json"), { part: "discovery", username: "x" });
    expect(error.kind).toBe("token");
    expect(error.message).toMatch(/INSTAGRAM_ACCESS_TOKEN/);
  });

  it("maps permission errors differently for hashtags and Business Discovery", () => {
    const body = raw("graph-error.permission.json");
    expect(graphError(400, body, { part: "hashtag", hashtag: "x" }).message).toMatch(/Instagram Public Content Access/);
    expect(graphError(400, body, { part: "discovery", username: "x" }).message).toMatch(/instagram_manage_insights/);
  });

  it("maps rate limits as retryable and unknown accounts as not_found", () => {
    const limit = graphError(400, raw("graph-error.rate-limit.json"), { part: "discovery", username: "x" });
    expect(limit.kind).toBe("rate_limit");
    expect(limit.retryable).toBe(true);
    const missing = graphError(400, '{"error":{"message":"Invalid user id","type":"OAuthException","code":110}}', {
      part: "discovery",
      username: "inconnu",
    });
    expect(missing.kind).toBe("not_found");
    expect(missing.message).toMatch(/@inconnu introuvable/);
  });

  it("scrubs tokens echoed by upstream messages", () => {
    const error = graphError(
      500,
      `{"error":{"message":"Unexpected error for https://graph.facebook.com/v25.0/me?access_token=${TOKEN}","code":999}}`,
      { part: "hashtag", hashtag: "x" },
    );
    expect(error).toBeInstanceOf(GraphApiError);
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain("access_token=***");
  });

  it("reads the X-App-Usage header", () => {
    expect(appUsagePercent('{"call_count":28,"total_time":85,"total_cputime":25}')).toBe(85);
    expect(appUsagePercent(null)).toBeUndefined();
    expect(appUsagePercent("not json")).toBeUndefined();
  });
});

describe("instagramGraphConnector.fetch", () => {
  it("returns a hint without network calls when there is nothing to watch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await instagramGraphConnector.fetch(
      ctx({ env: { INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: IG_USER } }),
    );
    expect(result.signals).toEqual([]);
    expect(result.warning).toMatch(/INSTAGRAM_WATCH_ACCOUNTS/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a hashtag permission error into a warning when Business Discovery worked", async () => {
    graphRouter([
      { match: isDiscovery("hugodecrypte"), body: raw("graph-business-discovery.json"), headers: { "x-app-usage": '{"call_count":91}' } },
      { match: isHashtagSearch, body: raw("graph-error.permission.json"), status: 400 },
    ]);
    const result = await instagramGraphConnector.fetch(ctx({ keywords: ["Batch cooking"] }));
    expect(result.signals).toHaveLength(2);
    expect(result.warning).toMatch(/Instagram Public Content Access.*Seuls les comptes surveillés sont analysés/);
    expect(result.warning).toMatch(/utilisé à 91 %/);
  });

  it("caches hashtag ids and fetches top media", async () => {
    const fetchMock = graphRouter([
      { match: isDiscovery("hugodecrypte"), body: raw("graph-business-discovery.json") },
      { match: isHashtagSearch, body: raw("graph-hashtag-search.json") },
      { match: isTopMedia, body: raw("graph-hashtag-top-media.json") },
    ]);
    const first = await instagramGraphConnector.fetch(ctx({ keywords: ["batch cooking"] }));
    expect(first.signals).toHaveLength(4);
    expect(first.warning).toBeUndefined();
    await instagramGraphConnector.fetch(ctx({ keywords: ["batch cooking"] }));
    const searches = fetchMock.mock.calls.filter(([input]) => isHashtagSearch(new URL(String(input))));
    expect(searches).toHaveLength(1);
    const top = fetchMock.mock.calls.find(([input]) => isTopMedia(new URL(String(input))))!;
    expect(new URL(String(top[0])).pathname).toBe("/v25.0/17843857450040591/top_media");
  });

  it("reports unknown accounts as a warning and keeps the others", async () => {
    graphRouter([
      { match: isDiscovery("hugodecrypte"), body: raw("graph-business-discovery.json") },
      { match: isDiscovery("compteperso"), body: '{"error":{"message":"Invalid user id","type":"OAuthException","code":110}}', status: 400 },
    ]);
    const result = await instagramGraphConnector.fetch(
      ctx({ env: { ...ctx().env, INSTAGRAM_WATCH_ACCOUNTS: "hugodecrypte,compteperso" } }),
    );
    expect(result.signals).toHaveLength(2);
    expect(result.warning).toMatch(/@compteperso introuvable ou non professionnel/);
  });

  it("fails loudly on an expired token, without leaking it", async () => {
    graphRouter([
      { match: isDiscovery("hugodecrypte"), body: raw("graph-error.invalid-token.json"), status: 400 },
      { match: isHashtagSearch, body: raw("graph-error.invalid-token.json"), status: 400 },
    ]);
    const error = await instagramGraphConnector.fetch(ctx({ keywords: ["ia"] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphApiError);
    expect((error as GraphApiError).kind).toBe("token");
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("fails when the only part (hashtags) is not allowed", async () => {
    graphRouter([{ match: isHashtagSearch, body: raw("graph-error.permission.json"), status: 400 }]);
    await expect(
      instagramGraphConnector.fetch(ctx({ keywords: ["ia"], env: { INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: IG_USER } })),
    ).rejects.toThrow(/Instagram Public Content Access/);
  });
});
