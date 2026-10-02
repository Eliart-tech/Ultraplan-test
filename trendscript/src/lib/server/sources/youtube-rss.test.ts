import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import {
  DEFAULT_FR_CHANNELS,
  feedUrl,
  feedVideosToSignals,
  parseYoutubeFeed,
  resolveRssChannels,
  youtubeRssConnector,
} from "./youtube-rss";
import type { SourceContext } from "./types";

/** Test fixture: real Le Monde channel feed captured on 2026-10-02, trimmed to 4 entries. */
const xml = readFileSync(join(__dirname, "__fixtures__", "youtube-rss.lemonde.xml"), "utf8");
const NOW = Date.parse("2026-10-02T18:00:00Z");

function ctx(partial: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "",
    keywords: [],
    signal: new AbortController().signal,
    now: NOW,
    env: {},
    ...partial,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("parseYoutubeFeed", () => {
  const videos = parseYoutubeFeed(xml);

  it("reads every entry with its public counters", () => {
    expect(videos).toHaveLength(4);
    expect(videos[0]).toMatchObject({
      videoId: "1xfkh6m3zZ8",
      channelId: "UCYpRDnhk5H8h16jpS84uqsA",
      channelTitle: "Le Monde",
      title: "Christa Pike : son exécution ratée ravive le débat sur la peine de mort aux Etats-Unis",
      url: "https://www.youtube.com/watch?v=1xfkh6m3zZ8",
      publishedAt: "2026-10-02T13:13:44.000Z",
      thumbnailUrl: "https://i2.ytimg.com/vi/1xfkh6m3zZ8/hqdefault.jpg",
      views: 20669,
      likes: 374,
      isShort: false,
    });
    expect(videos[0].description).toMatch(/^Aux Etats-Unis/);
  });

  it("flags Shorts from their /shorts/ link and decodes typographic apostrophes", () => {
    expect(videos[1]).toMatchObject({
      url: "https://www.youtube.com/shorts/_ha8Gx69i-o",
      isShort: true,
      title: "Budget 2027 : ce qu’il faut retenir du texte du gouvernement qui fait réagir l’opposition",
    });
  });

  it("rejects documents that are not feeds", () => {
    expect(() => parseYoutubeFeed("<html><body>Consent</body></html>")).toThrow(SourceError);
    expect(parseYoutubeFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Vide</title></feed>')).toEqual([]);
  });
});

describe("feedVideosToSignals", () => {
  it("keeps the last 72 h and maps shorts / long videos", () => {
    const signals = feedVideosToSignals(parseYoutubeFeed(xml), NOW);
    expect(signals.map((s) => s.url)).toEqual([
      "https://www.youtube.com/watch?v=1xfkh6m3zZ8",
      "https://www.youtube.com/shorts/_ha8Gx69i-o",
      "https://www.youtube.com/watch?v=wmgMJ139KFQ",
    ]);
    expect(signals.map((s) => s.kind)).toEqual(["video", "short_video", "video"]);
    expect(signals[2]).toMatchObject({
      id: expect.stringMatching(/^youtube_rss:/),
      source: "youtube_rss",
      platform: "youtube",
      author: "Le Monde",
      metrics: { views: 353301, likes: 5557 },
      related: [],
      strength: 0,
    });
    expect(signals.every((s) => (s.text?.length ?? 0) <= 500)).toBe(true);
  });
});

describe("resolveRssChannels", () => {
  it("uses the verified French list for French", () => {
    expect(resolveRssChannels({}, "fr", "FR")).toEqual({ channels: DEFAULT_FR_CHANNELS, warning: undefined });
    expect(DEFAULT_FR_CHANNELS).toHaveLength(10);
    expect(resolveRssChannels({}, "fr", "CA").warning).toMatch(/Chaînes d'actualité françaises/);
  });

  it("returns nothing (with a hint) for other languages without override", () => {
    const selection = resolveRssChannels({}, "en", "GB");
    expect(selection.channels).toEqual([]);
    expect(selection.warning).toMatch(/YOUTUBE_RSS_CHANNELS/);
  });

  it("honours YOUTUBE_RSS_CHANNELS, ignoring malformed ids", () => {
    const selection = resolveRssChannels(
      { YOUTUBE_RSS_CHANNELS: "UCAcAnMF0OrCtUep3Y4M-ZPw, @hugodecrypte ,UCYpRDnhk5H8h16jpS84uqsA" },
      "en",
      "US",
    );
    expect(selection.channels.map((c) => c.id)).toEqual(["UCAcAnMF0OrCtUep3Y4M-ZPw", "UCYpRDnhk5H8h16jpS84uqsA"]);
    expect(selection.warning).toMatch(/@hugodecrypte/);
  });
});

describe("youtubeRssConnector", () => {
  it("is always configured and free", () => {
    expect(youtubeRssConnector.isConfigured({})).toBe(true);
    expect(youtubeRssConnector.meta.free).toBe(true);
    expect(youtubeRssConnector.meta.envVars).toEqual([]);
  });

  it("fetches each channel feed, retries once, and reports unavailable feeds", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("UCAcAnMF0OrCtUep3Y4M-ZPw")) return new Response("Not found", { status: 404 });
        return new Response(xml, { status: 200 });
      }),
    );
    const result = await youtubeRssConnector.fetch(
      ctx({ env: { YOUTUBE_RSS_CHANNELS: "UCAcAnMF0OrCtUep3Y4M-ZPw,UCYpRDnhk5H8h16jpS84uqsA" } }),
    );
    expect(calls.filter((u) => u === feedUrl("UCAcAnMF0OrCtUep3Y4M-ZPw"))).toHaveLength(2);
    expect(result.signals).toHaveLength(3);
    expect(result.warning).toBe("Flux indisponible(s) : UCAcAnMF0OrCtUep3Y4M-ZPw.");
  });

  it("fails when no feed answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(
      youtubeRssConnector.fetch(ctx({ env: { YOUTUBE_RSS_CHANNELS: "UCYpRDnhk5H8h16jpS84uqsA" } })),
    ).rejects.toThrow(/Aucun flux YouTube n'a répondu/);
  });

  it("does not call the network for a language without channels", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await youtubeRssConnector.fetch(ctx({ language: "en", geo: "US" }));
    expect(result.signals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
