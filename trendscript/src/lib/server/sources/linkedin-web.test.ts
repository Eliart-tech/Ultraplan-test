import { afterEach, describe, expect, it, vi } from "vitest";
import search from "./__fixtures__/firecrawl-search.linkedin.json";
import { buildFirecrawlSearchBody, fetchLinkedinWeb, firecrawlRestSearch, readFirecrawlSearch, type LinkedinSearch } from "./linkedin-web";

const NOW = Date.parse("2026-10-03T00:00:00Z");
const ctx = (keywords: string[]) => ({ geo: "FR", keywords, signal: new AbortController().signal, now: NOW });

afterEach(() => vi.unstubAllGlobals());

describe("Firecrawl search request", () => {
  it("builds the v2 body with time filter and location", () => {
    expect(buildFirecrawlSearchBody("q", { limit: 10, tbs: "qdr:w", location: "France" })).toEqual({
      query: "q",
      limit: 10,
      tbs: "qdr:w",
      sources: ["web"],
      location: "France",
    });
  });

  it("sends the key as a Bearer token and maps errors to French messages", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const run = firecrawlRestSearch("fc-test");
    await expect(run("q", { limit: 1, tbs: "qdr:w", signal: new AbortController().signal })).rejects.toThrow(/FIRECRAWL_API_KEY/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fc-test");
  });

  it("reads data.web and rejects success:false", () => {
    expect(readFirecrawlSearch(search)).toHaveLength(5);
    expect(() => readFirecrawlSearch({ success: false, error: "quota" })).toThrow(/quota/);
  });
});

describe("fetchLinkedinWeb", () => {
  it("needs keywords", async () => {
    const result = await fetchLinkedinWeb(ctx([]), vi.fn());
    expect(result.signals).toEqual([]);
    expect(result.warning).toMatch(/mots-clés/);
  });

  it("searches the first 3 keywords, merges and keeps going when one fails", async () => {
    const calls: string[] = [];
    const fake: LinkedinSearch = async (query) => {
      calls.push(query);
      if (query.includes("bourse")) throw new Error("timeout");
      return query.includes("livret") ? readFirecrawlSearch(search) : [];
    };
    const result = await fetchLinkedinWeb(ctx(["livret A", "épargne", "bourse", "crypto"]), fake);
    expect(calls).toHaveLength(3);
    expect(result.signals).toHaveLength(2);
    expect(result.warning).toMatch(/épargne/);
    expect(result.warning).toMatch(/bourse \(timeout\)/);
  });

  it("fails when every search fails", async () => {
    await expect(fetchLinkedinWeb(ctx(["a1", "b2"]), async () => Promise.reject(new Error("down")))).rejects.toThrow(/LinkedIn/);
  });
});
