import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceContext } from "./types";
import {
  articleToSignal,
  fetchTopDay,
  isNoise,
  loadWikipediaTop,
  parseTopArticles,
  retryAfterMs,
  selectArticles,
  userAgent,
  utcDay,
  wikipediaConnector,
} from "./wikipedia";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
/** Real top lists for fr.wikipedia (first 150 articles of 1000). */
const DAY1 = fixture("wikipedia-top.fr.2026-10-01.json");
const DAY2 = fixture("wikipedia-top.fr.2026-09-30.json");
const NOW = Date.parse("2026-10-02T17:30:00Z");
const noWait = async () => undefined;

function ctx(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "",
    keywords: [],
    signal: AbortSignal.timeout(10_000),
    now: NOW,
    env: {},
    ...overrides,
  };
}

const json = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
const notFound = () => json('{"status":404,"title":"Not Found"}', 404);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsing and filtering", () => {
  const day1 = parseTopArticles(JSON.parse(DAY1));

  it("reads the top list", () => {
    expect(day1).toHaveLength(150);
    expect(day1[3]).toEqual({ article: "Christa_Pike", views: 56489, rank: 4 });
    expect(() => parseTopArticles({ detail: "Not found" })).toThrow(/réponse inattendue/);
  });

  it("drops namespaces, main pages and known noise but keeps titles with ' : '", () => {
    expect(isNoise("Wikipédia:Accueil_principal")).toBe(true);
    expect(isNoise("Spécial:Recherche")).toBe(true);
    expect(isNoise("Fichier:Transdev_logo_2018.png")).toBe(true);
    expect(isNoise("Cookie_(informatique)")).toBe(true);
    expect(isNoise("Discussion_utilisateur:Exemple")).toBe(true);
    expect(isNoise("Special:Search")).toBe(true);
    expect(isNoise("Main_Page")).toBe(true);
    expect(isNoise("Monstre_:_L'Histoire_de_Lizzie_Borden")).toBe(false);
    expect(isNoise("Avengers:_Doomsday")).toBe(false);
    expect(isNoise("Justin_Bieber")).toBe(false);
  });

  it("computes UTC days", () => {
    expect(utcDay(NOW, 1)).toBe("2026-10-01");
    expect(utcDay(Date.parse("2026-10-01T00:10:00Z"), 2)).toBe("2026-09-29");
  });

  it("parses Retry-After in seconds or as a date", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(null)).toBe(5000);
    expect(retryAfterMs("Fri, 02 Oct 2026 17:30:10 GMT", NOW)).toBe(10_000);
  });

  it("builds a compliant User-Agent with a contact", () => {
    expect(userAgent({})).toBe("TrendScript/1.0 (https://github.com/eliart-tech/ultraplan-test)");
    expect(userAgent({ WIKIPEDIA_CONTACT: "https://exemple.fr/contact" })).toBe("TrendScript/1.0 (https://exemple.fr/contact)");
  });
});

describe("selectArticles", () => {
  const day1 = parseTopArticles(JSON.parse(DAY1));
  const day2 = parseTopArticles(JSON.parse(DAY2));

  it("favours spikes and new entrants over evergreen pages", () => {
    const selected = selectArticles(day1, day2);
    expect(selected).toHaveLength(40);
    expect(selected.some((item) => isNoise(item.article))).toBe(false);

    const glucksmann = selected.find((item) => item.article === "Raphaël_Glucksmann")!;
    expect(glucksmann.newEntrant).toBe(false);
    expect(glucksmann.increasePct).toBe(290); // 17 252 vs 4 419

    // Read a lot but falling: kept only as a "most read" filler, with its decline.
    const soeurs = selected.find((item) => item.article === "Sœurs_(mini-série)");
    if (soeurs) expect(soeurs.increasePct).toBe(-68);

    const pike = selected.find((item) => item.article === "Christa_Pike")!;
    expect(pike.newEntrant).toBe(true);
    expect(pike.increasePct).toBeGreaterThan(0);

    // Sorted by views, all spikes kept even below evergreen pages' views.
    const views = selected.map((item) => item.views);
    expect([...views].sort((a, b) => b - a)).toEqual(views);
    const spikes = selected.filter((item) => item.newEntrant || (item.increasePct ?? 0) >= 100);
    expect(spikes.length).toBeGreaterThanOrEqual(20);
  });

  it("falls back to the most read pages without a previous day", () => {
    const selected = selectArticles(day1);
    expect(selected).toHaveLength(40);
    expect(selected[0].article).toBe("Christa_Pike");
    expect(selected.every((item) => item.increasePct === undefined)).toBe(true);
  });
});

describe("articleToSignal", () => {
  it("follows the signal conventions", () => {
    const signal = articleToSignal(
      { article: "Raphaël_Glucksmann", views: 17252, rank: 14, increasePct: 290, newEntrant: false },
      { day: "2026-10-01", language: "fr", keywords: ["glucksmann"], hasPrevious: true },
    );
    expect(signal).toMatchObject({
      source: "wikipedia",
      platform: "wikipedia",
      kind: "article_views",
      title: "Raphaël Glucksmann",
      url: "https://fr.wikipedia.org/wiki/Rapha%C3%ABl_Glucksmann",
      publishedAt: "2026-10-01T23:59:59.000Z",
      metrics: { views: 17252, rank: 14, increasePct: 290 },
      query: "glucksmann",
      strength: 0,
    });
    expect(signal.id).toMatch(/^wikipedia:[a-z0-9]+$/);
    expect(signal.text).toMatch(/vues le 01\/10 sur Wikipédia \(fr\) · 14e article le plus lu · \+290 % par rapport à la veille/);
  });
});

describe("fetching", () => {
  it("fetches D-1 and D-2 with a descriptive User-Agent", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => json(url.includes("2026/10/01") ? DAY1 : DAY2));
    vi.stubGlobal("fetch", fetchMock);
    const result = await wikipediaConnector.fetch(ctx({ env: { WIKIPEDIA_CONTACT: "contact@exemple.fr" } }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => url).sort();
    expect(urls).toEqual([
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia.org/all-access/2026/09/30",
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/fr.wikipedia.org/all-access/2026/10/01",
    ]);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("user-agent")).toBe("TrendScript/1.0 (contact@exemple.fr)");
    expect(result.warning).toBeUndefined();
    expect(result.signals).toHaveLength(40);
    expect(result.signals.every((signal) => signal.publishedAt === "2026-10-01T23:59:59.000Z")).toBe(true);
  });

  it("uses D-2 (and D-3 for growth) when D-1 is not published yet", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("2026/10/01")) return notFound();
      return json(url.includes("2026/09/30") ? DAY1.replace(/"day":"01"/, '"day":"30"') : DAY2);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadWikipediaTop("fr", NOW, { signal: AbortSignal.timeout(5000), userAgent: "test", wait: noWait });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.date).toBe("2026-09-30");
    expect(result.previous?.date).toBe("2026-09-29");
    expect(result.warning).toMatch(/chiffres d'hier ne sont pas encore publiés/);
  });

  it("honours a short Retry-After once, then gives up with a French message", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++calls === 1 ? json("You are making too many requests", 429, { "retry-after": "1" }) : json(DAY1))),
    );
    const wait = vi.fn(noWait);
    const day = await fetchTopDay("fr", "2026-10-01", { signal: AbortSignal.timeout(5000), userAgent: "test", wait });
    expect(day?.articles).toHaveLength(150);
    expect(wait).toHaveBeenCalledWith(1000, expect.anything());

    vi.stubGlobal("fetch", vi.fn(async () => json("too many", 429, { "retry-after": "2" })));
    await expect(
      fetchTopDay("fr", "2026-10-01", { signal: AbortSignal.timeout(5000), userAgent: "test", wait: noWait }),
    ).rejects.toThrow(/limite temporairement les requêtes/);

    vi.stubGlobal("fetch", vi.fn(async () => json("too many", 429, { "retry-after": "60" })));
    await expect(
      fetchTopDay("fr", "2026-10-01", { signal: AbortSignal.timeout(5000), userAgent: "test", wait: noWait }),
    ).rejects.toThrow(/réessayez dans 60 s/);
  });

  it("keeps D-1 without growth when only the previous day fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("2026/10/01") ? json(DAY1) : json("boom", 500))),
    );
    const result = await wikipediaConnector.fetch(ctx());
    expect(result.signals).toHaveLength(40);
    expect(result.warning).toMatch(/hausses non calculées/);
    expect(result.signals[0].text).toMatch(/évolution sur un jour indisponible/);
  });
});
