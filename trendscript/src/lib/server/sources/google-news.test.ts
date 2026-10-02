import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeHtmlEntities,
  googleNewsConnector,
  newsLocale,
  parseClusterHtml,
  parseNewsRss,
  searchGoogleNews,
  searchUrl,
  topStoriesUrl,
} from "./google-news";
import type { SourceContext } from "./types";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
const TOP = fixture("google-news-top.FR.xml");
const SEARCH = fixture("google-news-search.FR.xml");

function ctx(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "",
    keywords: [],
    signal: AbortSignal.timeout(10_000),
    now: Date.parse("2026-10-02T17:00:00Z"),
    env: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newsLocale", () => {
  it("builds the hl/gl/ceid triple Google expects", () => {
    expect(newsLocale("FR", "fr")).toEqual({ hl: "fr", gl: "FR", ceid: "FR:fr" });
    expect(newsLocale("ca", "fr")).toEqual({ hl: "fr-CA", gl: "CA", ceid: "CA:fr" });
    expect(newsLocale("GB", "en")).toEqual({ hl: "en-GB", gl: "GB", ceid: "GB:en" });
    expect(newsLocale("BE", "nl")).toEqual({ hl: "nl", gl: "BE", ceid: "BE:nl" });
  });

  it("encodes the query and keeps the ceid colon", () => {
    const locale = newsLocale("FR", "fr");
    expect(topStoriesUrl(locale)).toBe("https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr");
    expect(searchUrl("intelligence artificielle", locale, "2d")).toBe(
      "https://news.google.com/rss/search?q=intelligence%20artificielle%20when%3A2d&hl=fr&gl=FR&ceid=FR:fr",
    );
  });
});

describe("parseNewsRss — top stories (real feed, trimmed)", () => {
  const items = parseNewsRss(TOP);

  it("strips the ' - Source' suffix and reads the publisher", () => {
    expect(items).toHaveLength(2);
    expect(items[1].title).toBe(
      "Après les nouvelles publications de Mediapart, Jordan Bardella attaqué sur le thème du mensonge",
    );
    expect(items[1].source).toBe("Les Echos");
    expect(items[1].sourceUrl).toBe("https://www.lesechos.fr");
    expect(items[1].publishedAt).toBe("2026-10-02T13:32:43.000Z");
    expect(items[1].position).toBe(2);
  });

  it("extracts the story cluster without the main article", () => {
    const [first] = items;
    expect(first.title.startsWith("EN DIRECT, blocages de lycées")).toBe(true);
    expect(first.cluster).toHaveLength(4);
    expect(first.cluster.map((related) => related.source)).toEqual(["franceinfo", "BFM", "CGT", "Ouest-France"]);
    expect(first.cluster[0].title).toContain('loi du "casseur payeur"');
    expect(first.cluster.every((related) => related.url.startsWith("https://news.google.com/rss/articles/"))).toBe(true);
  });
});

describe("parseNewsRss — search feed (real feed, trimmed)", () => {
  it("has no cluster: the description only repeats the title", () => {
    const items = parseNewsRss(SEARCH);
    expect(items).toHaveLength(4);
    expect(items[0].title).toBe("Intelligence artificielle : reconstruire la confiance à l’ère des deepfakes");
    expect(items[0].source).toBe("argusdelassurance.com");
    expect(items.every((item) => item.cluster.length === 0)).toBe(true);
  });

  it("returns [] for an empty feed and throws on non-RSS bodies", () => {
    expect(parseNewsRss('<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
    expect(() => parseNewsRss("<html><body>Not found</body></html>")).toThrow(/flux inattendu/);
  });
});

describe("HTML helpers", () => {
  it("decodes entities left in descriptions", () => {
    expect(decodeHtmlEntities("Procter &amp; Gamble&nbsp;: l&#39;IA &#x2014; &laquo;ok&raquo;")).toBe("Procter & Gamble : l'IA — «ok»");
  });

  it("parses cluster items even without a <font> source", () => {
    const html = '<ol><li><a href="https://news.google.com/rss/articles/A?oc=5" target="_blank">Un &amp; deux</a></li></ol>';
    expect(parseClusterHtml(html)).toEqual([{ title: "Un & deux", url: "https://news.google.com/rss/articles/A?oc=5", source: undefined }]);
  });
});

describe("searchGoogleNews", () => {
  it("queries the search feed and returns the most recent first", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(SEARCH, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signals = await searchGoogleNews("intelligence artificielle", {
      geo: "FR",
      language: "fr",
      signal: AbortSignal.timeout(5000),
      limit: 3,
    });
    expect(fetchMock.mock.calls[0][0]).toContain("q=intelligence%20artificielle%20when%3A7d");
    expect(signals).toHaveLength(3);
    const dates = signals.map((signal) => Date.parse(signal.publishedAt!));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect(signals[0]).toMatchObject({
      source: "google_news",
      platform: "news",
      kind: "news",
      query: "intelligence artificielle",
      strength: 0,
    });
    expect(signals[0].id).toMatch(/^google_news:[a-z0-9]+$/);
    expect(signals[0].metrics.rank).toBeGreaterThanOrEqual(1);
  });
});

describe("googleNewsConnector.fetch", () => {
  it("combines top stories and keyword feeds", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(url.includes("/search?") ? SEARCH : TOP, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await googleNewsConnector.fetch(ctx({ keywords: ["intelligence artificielle", "#Bardella"] }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.warning).toBeUndefined();
    // 2 top stories + 4 search items (the same 4 for both keywords: deduplicated by URL).
    expect(result.signals).toHaveLength(6);
    const bardella = result.signals.find((signal) => signal.title.includes("Jordan Bardella"))!;
    expect(bardella.query).toBe("Bardella");
    expect(bardella.text).toMatch(/repris par 5 médias/);
    expect(bardella.related).toHaveLength(4);
    const ai = result.signals.filter((signal) => signal.query === "intelligence artificielle");
    expect(ai).toHaveLength(4);
  });

  it("reports failed feeds as a warning and fails only when every feed failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("/search?") ? new Response("nope", { status: 503 }) : new Response(TOP))),
    );
    const partial = await googleNewsConnector.fetch(ctx({ keywords: ["ia"] }));
    expect(partial.signals).toHaveLength(2);
    expect(partial.warning).toBe("Flux Google Actualités en échec : « ia » (erreur HTTP 503).");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(googleNewsConnector.fetch(ctx({ keywords: ["ia"] }))).rejects.toThrow(/503/);
  });

  it("notes the feed licence", () => {
    expect(googleNewsConnector.meta.costNote).toMatch(/non commercial/);
    expect(googleNewsConnector.isConfigured({})).toBe(true);
  });
});
