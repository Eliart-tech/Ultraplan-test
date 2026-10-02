import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTAGRAM_APIFY_FIELDS,
  buildInstagramApifyInput,
  instagramApifyConnector,
  instagramApifyWarning,
  normalizeInstagramItems,
  type ApifyInstagramItem,
} from "./instagram-apify";
import { splitApifyItems } from "./apify";
import type { SourceContext } from "./types";

/** Test fixture (dataset rows shaped like the actor's README output). */
const dataset = (JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "apify-instagram-hashtag.reels.json"), "utf8"),
) as { response: unknown[] }).response;

const NOW = Date.parse("2025-11-08T12:00:00Z");

function ctx(partial: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "cuisine",
    keywords: ["Recette facile", "cuisine facile"],
    signal: new AbortController().signal,
    now: NOW,
    env: { APIFY_TOKEN: "apify_api_TEST" },
    ...partial,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("buildInstagramApifyInput", () => {
  it("turns keywords into hashtags (accents stripped, spaces removed, max 5) and asks for 20 reels each", () => {
    expect(
      buildInstagramApifyInput(["Éducation", "batch cooking", "#Mealprep", "l'IA", "éducation", "a", "six", "sept"]),
    ).toEqual({
      hashtags: ["education", "batchcooking", "mealprep", "lia", "six"],
      resultsType: "reels",
      resultsLimit: 20,
    });
  });
});

describe("normalizeInstagramItems", () => {
  const { items, errorRows } = splitApifyItems<ApifyInstagramItem>(dataset);
  const hashtags = ["birdsofinstagram", "recettefacile", "cuisinefacile"];

  it("keeps recent reels, maps metrics and builds /reel/ permalinks", () => {
    const { signals, dropped } = normalizeInstagramItems(items, { now: NOW, hashtags, language: "en" });
    expect(errorRows).toHaveLength(1);
    expect(dropped).toEqual({ notReel: 1, tooOld: 1, otherLanguage: 0, duplicate: 1 });

    const borb = signals.find((s) => s.url === "https://www.instagram.com/reel/DQt1HbPDFtN/")!;
    expect(borb).toMatchObject({
      id: expect.stringMatching(/^instagram_apify:/),
      source: "instagram_apify",
      platform: "instagram",
      kind: "short_video",
      title: "BORB Invasion! 🛸 👽",
      author: "@buddy_thebirdy",
      publishedAt: "2025-11-06T13:08:06.000Z",
      metrics: { views: 2133, likes: 289, comments: 40, shares: 17, durationSec: 31 },
      query: "birdsofinstagram",
      strength: 0,
    });
    expect(borb.tags).toContain("birdsofinstagram");
    expect(borb.text).toContain("Son : « The X-Files Theme » – Retrospectre");
    expect(borb.thumbnailUrl).toMatch(/^https:\/\/scontent/);
  });

  it("maps hidden likes (-1) to undefined", () => {
    const { signals } = normalizeInstagramItems(items, { now: NOW, hashtags, language: "en" });
    const hidden = signals.find((s) => s.url === "https://www.instagram.com/reel/DQv6GNRCPMj/")!;
    expect(hidden.metrics.likes).toBeUndefined();
    expect(hidden.metrics.views).toBe(2419);
  });

  it("dedupes a reel found under two hashtags, keeping the highest view count", () => {
    const { signals } = normalizeInstagramItems(items, { now: NOW, hashtags, language: "fr" });
    const french = signals.filter((s) => s.url === "https://www.instagram.com/reel/DQfr0000001/");
    expect(french).toHaveLength(1);
    expect(french[0].metrics.views).toBe(402500);
    expect(french[0].query).toBe("cuisinefacile");
    expect(french[0].title).toBe("La recette de pâtes la plus rapide de ma vie 🍝 Tu la testes ce soir ? Dis-moi en commentaire !");
    expect(french[0].text).toContain("Son : « Balance ton quoi » – Angèle");
  });

  it("drops long captions that are clearly not French when the run is in French", () => {
    const { signals, dropped } = normalizeInstagramItems(items, { now: NOW, hashtags, language: "fr" });
    expect(dropped.otherLanguage).toBe(1);
    expect(signals.map((s) => s.url)).not.toContain("https://www.instagram.com/reel/DQv6GNRCPMj/");
    // Short captions cannot be judged and are kept.
    expect(signals.map((s) => s.url)).toContain("https://www.instagram.com/reel/DQrQVcijsUi/");
  });

  it("summarises empty hashtags, filtered rows and actor errors in French", () => {
    const result = normalizeInstagramItems(items, { now: NOW, hashtags: [...hashtags, "vide"], language: "fr" });
    expect(instagramApifyWarning([...hashtags, "vide"], result, errorRows)).toBe(
      "Aucun reel récent pour #vide. 1 reel(s) écarté(s) car la légende n'est visiblement pas en français. Apify a signalé 1 erreur(s) (hashtag vide, privé ou bloqué).",
    );
  });
});

describe("instagramApifyConnector", () => {
  it("is configured by APIFY_TOKEN only", () => {
    expect(instagramApifyConnector.isConfigured({})).toBe(false);
    expect(instagramApifyConnector.isConfigured({ APIFY_TOKEN: "apify_api_x" })).toBe(true);
    expect(instagramApifyConnector.meta.needsKeywords).toBe(true);
  });

  it("returns a warning without calling Apify when there are no keywords", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await instagramApifyConnector.fetch(ctx({ keywords: [] }));
    expect(result.signals).toEqual([]);
    expect(result.warning).toMatch(/mots-clés/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the exact actor request and normalizes the dataset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify(dataset), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await instagramApifyConnector.fetch(
      ctx({ env: { APIFY_TOKEN: "apify_api_TEST", APIFY_MAX_CHARGE_USD: "0.3" } }),
    );

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/v2/actors/apify~instagram-hashtag-scraper/run-sync-get-dataset-items");
    expect(parsed.searchParams.get("maxTotalChargeUsd")).toBe("0.3");
    expect(parsed.searchParams.get("timeout")).toBe("120");
    expect(parsed.searchParams.get("fields")).toBe(INSTAGRAM_APIFY_FIELDS.join(","));
    expect(JSON.parse(String(init?.body))).toEqual({
      hashtags: ["recettefacile", "cuisinefacile"],
      resultsType: "reels",
      resultsLimit: 20,
    });
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.every((s) => s.source === "instagram_apify")).toBe(true);
  });
});
