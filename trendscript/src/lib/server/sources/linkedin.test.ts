import { describe, expect, it } from "vitest";
import search from "./__fixtures__/firecrawl-search.linkedin.json";
import { activityDate, activityIdFromUrl, linkedinHitsToSignals, linkedinPostUrl, linkedinSearchQuery, searchLocation } from "./linkedin";
import { readFirecrawlSearch } from "./linkedin-web";

const NOW = Date.parse("2026-10-03T00:00:00Z");

describe("LinkedIn activity ids", () => {
  it("decodes the publication time from the id (first 41 bits = ms)", () => {
    // Same post as the Apify actor documentation: postedAt.timestamp 1747843925614.
    expect(activityDate("7330988768578920448", NOW)).toBe("2025-05-21T16:12:05.614Z");
    expect(activityDate("7510571580230402048", NOW)).toBe("2026-09-29T05:30:04.399Z");
  });

  it("rejects ids that are not activity ids", () => {
    expect(activityDate("123", NOW)).toBeUndefined();
    expect(activityDate("abc", NOW)).toBeUndefined();
    expect(activityDate(undefined, NOW)).toBeUndefined();
  });

  it("finds the id in permalinks and URNs", () => {
    expect(activityIdFromUrl("https://fr.linkedin.com/posts/x_slug-activity-7510571580230402048-r6io")).toBe("7510571580230402048");
    expect(activityIdFromUrl("https://www.linkedin.com/feed/update/urn:li:activity:7510571580230402048/")).toBe("7510571580230402048");
  });
});

describe("linkedinPostUrl", () => {
  it("keeps post permalinks without tracking parameters and drops profiles", () => {
    expect(linkedinPostUrl("https://fr.linkedin.com/posts/a_b-activity-7510571580230402048-r6io?utm_source=share")).toBe(
      "https://fr.linkedin.com/posts/a_b-activity-7510571580230402048-r6io",
    );
    expect(linkedinPostUrl("https://fr.linkedin.com/in/romainfargeot")).toBeUndefined();
    expect(linkedinPostUrl("https://example.com/posts/x")).toBeUndefined();
  });
});

describe("search helpers", () => {
  it("restricts the query to LinkedIn posts and quotes multi-word keywords", () => {
    expect(linkedinSearchQuery("#épargne")).toBe("site:linkedin.com/posts épargne");
    expect(linkedinSearchQuery("livret A")).toBe('site:linkedin.com/posts "livret A"');
  });

  it("maps the country code to a search location", () => {
    expect(searchLocation("FR")).toBe("France");
  });
});

describe("linkedinHitsToSignals (real Firecrawl search response)", () => {
  const signals = linkedinHitsToSignals(readFirecrawlSearch(search), { source: "linkedin_web", query: "livret A", now: NOW });

  it("keeps recent posts only, deduped, and drops profiles", () => {
    // Hit 3 dates from mid-August (older than 14 days); hit 4 duplicates hit 1; hit 5 is a profile.
    expect(signals).toHaveLength(2);
  });

  it("reads author, date, text and query", () => {
    const [first, second] = signals;
    expect(first).toMatchObject({
      source: "linkedin_web",
      platform: "linkedin",
      kind: "social_post",
      author: "Romain Fargeot",
      publishedAt: "2026-09-29T05:30:04.399Z",
      query: "livret A",
      url: "https://fr.linkedin.com/posts/romainfargeot_la-cour-des-comptes-veut-taxer-votre-livret-activity-7510571580230402048-r6io",
    });
    expect(first.text).toMatch(/^Le Livret A reste néanmoins très utile/);
    expect(first.title).toMatch(/^Le Livret A reste néanmoins/);
    expect(second.author).toBe("Jézabel Couppey");
    expect(second.title).toBe("Le livret A pour financer l'adaptation climatique");
  });
});
