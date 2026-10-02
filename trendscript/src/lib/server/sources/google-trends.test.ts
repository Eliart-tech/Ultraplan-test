import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeBatchExecute,
  dedupeTrends,
  googleTrendsConnector,
  loadGoogleTrends,
  matchKeyword,
  parseApproxTraffic,
  parseTrendsRpc,
  parseTrendsRss,
  trendToSignal,
} from "./google-trends";
import type { SourceContext } from "./types";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
const RPC = fixture("google-trends-rpc.FR.txt");
const RPC_UNSUPPORTED = fixture("google-trends-rpc.unsupported-geo.txt");
const RSS = fixture("google-trends-rss.FR.xml");
/** Fixtures were captured on 2026-10-02 around 17:30 UTC. */
const NOW = Date.parse("2026-10-02T17:30:00Z");

/** Re-encodes the RPC fixture after mutating its rows (to simulate format changes). */
function rpcWithRows(mutate: (rows: unknown[][]) => unknown[][]): string {
  const outer = JSON.parse(RPC.slice(RPC.indexOf("\n")));
  const envelope = outer.find((entry: unknown[]) => entry[0] === "wrb.fr");
  const payload = JSON.parse(envelope[2]);
  payload[1] = mutate(payload[1]);
  envelope[2] = JSON.stringify(payload);
  return `)]}'\n\n${JSON.stringify(outer)}`;
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseApproxTraffic", () => {
  it("reads every traffic format defensively", () => {
    expect(parseApproxTraffic("1000+")).toBe(1000);
    expect(parseApproxTraffic("20K+")).toBe(20_000);
    expect(parseApproxTraffic("1M+")).toBe(1_000_000);
    expect(parseApproxTraffic("1 000+")).toBe(1000);
    expect(parseApproxTraffic("1,000+")).toBe(1000);
    expect(parseApproxTraffic("1,5 M+")).toBe(1_500_000);
    expect(parseApproxTraffic("2 M+")).toBe(2_000_000);
    expect(parseApproxTraffic(50000)).toBe(50000);
    expect(parseApproxTraffic("beaucoup")).toBeNull();
    expect(parseApproxTraffic(undefined)).toBeNull();
  });
});

describe("parseTrendsRpc (real i0OFE response, trimmed)", () => {
  const trends = parseTrendsRpc(RPC);

  it("maps the 13-field rows", () => {
    expect(trends).toHaveLength(9);
    const route = trends.find((trend) => trend.query === "route")!;
    expect(route.startedAt).toBe(1790931600 * 1000);
    expect(route.endedAt).toBeUndefined();
    expect(route.searchVolume).toBe(20000);
    expect(route.increasePct).toBe(1000);
    expect(route.categoryIds).toEqual([11]);
    expect(route.news).toHaveLength(2);
    expect(route.news[0]).toMatchObject({ source: "France 3 Régions" });
    expect(route.news[0].url).toMatch(/^https:\/\/france3-regions\.franceinfo\.fr\//);
    expect(route.thumbnailUrl).toMatch(/^https:\/\/encrypted-tbn/);
  });

  it("keeps ended trends with their end time and uses the accent-free key", () => {
    const motard = trends.find((trend) => trend.query === "motard")!;
    expect(motard.endedAt).toBe(1790961600 * 1000);
    const retraites = trends.find((trend) => trend.query.startsWith("suppression"))!;
    expect(retraites.normalized).toBe("suppression abattement fiscal retraites");
    expect(retraites.breakdown).toContain("remboursement");
    expect(trends.find((trend) => trend.query === "2026")).toBeDefined();
  });

  it("rejects a response without the i0OFE envelope or with an empty payload", () => {
    expect(() => parseTrendsRpc("<html>Error 400</html>")).toThrow(/format de réponse inattendu/);
    expect(() => parseTrendsRpc(RPC_UNSUPPORTED)).toThrow(/réponse vide \(code 3\)/);
  });

  it("drops a few malformed rows but treats a widespread change as a breaking change", () => {
    const oneBroken = rpcWithRows((rows) => rows.map((row, i) => (i === 0 ? [...row.slice(0, 6), "20000", ...row.slice(7)] : row)));
    expect(parseTrendsRpc(oneBroken)).toHaveLength(8);
    const mostlyBroken = rpcWithRows((rows) => rows.map((row) => [row[0], row[1], row[2], "hier"]));
    expect(() => parseTrendsRpc(mostlyBroken)).toThrow(/format modifié/);
  });

  it("decodes the chunked rt=c format too", () => {
    const outerText = RPC.slice(RPC.indexOf("\n")).trim();
    const chunked = `)]}'\n\n${outerText.length}\n${outerText}\n25\n[["e",4,null,null,123]]\n`;
    expect(JSON.parse(decodeBatchExecute(chunked, "i0OFE"))[1]).toHaveLength(9);
  });
});

describe("parseTrendsRss (official feed, trimmed)", () => {
  const trends = parseTrendsRss(RSS);

  it("parses items, keeps numeric titles as strings and converts dates to UTC", () => {
    expect(trends.map((trend) => trend.query)).toEqual(["pmu", "tadej pogacar", "2026", "tadej pogačar", "neufeld"]);
    const pmu = trends[0];
    expect(pmu.searchVolume).toBe(1000);
    expect(new Date(pmu.startedAt!).toISOString()).toBe("2026-10-02T15:50:00.000Z");
    expect(pmu.news).toHaveLength(2);
    expect(pmu.news[0].source).toBe("RTL");
    expect(pmu.increasePct).toBeUndefined();
  });

  it("decodes entities and tolerates trends without news or picture", () => {
    const pogacar = trends[1];
    expect(pogacar.news[0].source).toBe("L'Équipe");
    const neufeld = trends.find((trend) => trend.query === "neufeld")!;
    expect(neufeld.news).toEqual([]);
    expect(neufeld.thumbnailUrl).toBeUndefined();
  });
});

describe("dedupeTrends", () => {
  it("merges spelling variants, preferring the active episode", () => {
    const merged = dedupeTrends(parseTrendsRpc(RPC));
    const pogacar = merged.filter((trend) => trend.normalized === "tadej pogacar");
    expect(pogacar).toHaveLength(1);
    expect(pogacar[0].query).toBe("tadej pogacar");
    expect(pogacar[0].endedAt).toBeUndefined();
    expect(pogacar[0].searchVolume).toBe(5000);
    expect(merged).toHaveLength(8);
  });
});

describe("trendToSignal", () => {
  const trends = dedupeTrends(parseTrendsRpc(RPC));

  it("follows the signal conventions", () => {
    const livret = trends.find((trend) => trend.query === "livret a")!;
    const signal = trendToSignal(livret, { source: "google_trends", geo: "FR", now: NOW, keywords: ["Épargne"] });
    expect(signal.id).toMatch(/^google_trends:[a-z0-9]+$/);
    expect(signal).toMatchObject({ source: "google_trends", platform: "google", kind: "search_trend", strength: 0 });
    expect(signal.url).toBe("https://trends.google.com/trends/explore?q=livret%20a&geo=FR&date=now%201-d");
    expect(signal.metrics).toEqual({ searchVolume: 50000, increasePct: 800 });
    expect(signal.tags).toEqual(["épargne"]);
    expect(signal.query).toBe("Épargne");
    expect(signal.publishedAt).toBe(new Date(1790944200 * 1000).toISOString());
    expect(signal.text).toContain("Économie & finance");
    expect(signal.text).toMatch(/en cours depuis 5 h \(début 02\/10 12:30 UTC\)/);
  });

  it("says when a trend has ended", () => {
    const motard = trends.find((trend) => trend.query === "motard")!;
    const signal = trendToSignal(motard, { source: "google_trends", geo: "FR", now: NOW, keywords: [] });
    expect(signal.text).toMatch(/tendance terminée \(active 9 h, du 02\/10 08:20 UTC au 02\/10 17:20 UTC\)/);
    expect(signal.query).toBeUndefined();
  });
});

describe("matchKeyword", () => {
  it("matches whole words without accents", () => {
    expect(matchKeyword(["ia", "retraite"], ["Les retraités"])).toBeUndefined();
    expect(matchKeyword(["ia", "Retraités"], ["suppression abattement fiscal retraites"])).toBe("Retraités");
    expect(matchKeyword(["#IA"], ["L'IA générative"])).toBe("#IA");
    expect(matchKeyword(["livret a"], ["Livret A : le taux baisse"])).toBe("livret a");
  });
});

describe("googleTrendsConnector.fetch", () => {
  it("uses the RPC when it answers, sorted by volume", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(RPC, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await googleTrendsConnector.fetch(ctx());
    expect(result.warning).toBeUndefined();
    expect(result.signals).toHaveLength(8);
    expect(result.signals[0].title).toBe("danemark – portugal");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("rpcids=i0OFE");
    const fReq = JSON.parse(new URLSearchParams(String(init?.body)).get("f.req")!);
    expect(JSON.parse(fReq[0][0][1])).toEqual([null, null, "FR", 3, "fr", 24, 1]);
  });

  it("falls back to the RSS feed with a warning when the RPC format changed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("batchexecute")
          ? new Response(rpcWithRows((rows) => rows.map(() => ["?"])), { status: 200 })
          : new Response(RSS, { status: 200 }),
      ),
    );
    const result = await googleTrendsConnector.fetch(ctx());
    expect(result.warning).toMatch(/repli sur le flux RSS officiel/);
    expect(result.warning).toMatch(/format modifié/);
    expect(result.signals.map((signal) => signal.title)).toContain("2026");
    expect(result.signals.every((signal) => signal.metrics.increasePct === undefined)).toBe(true);
  });

  it("retries the RPC once on a 5xx before falling back", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("batchexecute") ? new Response("oops", { status: 503 }) : new Response(RSS, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadGoogleTrends("FR", "fr", AbortSignal.timeout(5000), { retryDelayMs: 0 });
    expect(result.via).toBe("rss");
    expect(result.warning).toMatch(/erreur HTTP 503/);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("batchexecute"))).toHaveLength(2);
  });

  it("explains in French when a country is not covered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("batchexecute")
          ? new Response(RPC_UNSUPPORTED, { status: 200 })
          : new Response("<html>Error 400 (Bad Request)</html>", { status: 400 }),
      ),
    );
    await expect(googleTrendsConnector.fetch(ctx({ geo: "lu" }))).rejects.toThrow(
      "Google Trends ne publie pas de tendances pour le pays « LU ».",
    );
  });

  it("is always configured and free", () => {
    expect(googleTrendsConnector.isConfigured({})).toBe(true);
    expect(googleTrendsConnector.meta.free).toBe(true);
    expect(googleTrendsConnector.meta.ttlMs).toBe(600_000);
  });
});
