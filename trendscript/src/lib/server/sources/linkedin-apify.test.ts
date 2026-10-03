import { describe, expect, it } from "vitest";
import posts from "./__fixtures__/apify-linkedin-posts.json";
import { buildLinkedinApifyInput, normalizeLinkedinPosts, type ApifyLinkedinPost } from "./linkedin-apify";

const NOW = Date.parse("2026-10-03T00:00:00Z");

describe("LinkedIn (Apify)", () => {
  it("asks the actor for the past week's most relevant posts", () => {
    expect(buildLinkedinApifyInput("livret A")).toEqual({
      searchQueries: ["livret A"],
      maxPosts: 20,
      postedLimit: "week",
      sortBy: "relevance",
    });
  });

  it("maps recent French posts with their real engagement counts", () => {
    const signals = normalizeLinkedinPosts(posts as ApifyLinkedinPost[], { now: NOW, query: "livret A", language: "fr" });
    // The 2025 English post is too old (and not French).
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      source: "linkedin_apify",
      platform: "linkedin",
      kind: "social_post",
      title: "LIVRET A",
      author: "Alice Lhabouz",
      publishedAt: "2026-10-01T12:02:02.064Z",
      metrics: { likes: 412, comments: 57, shares: 18 },
      tags: ["epargne", "finance"],
      query: "livret A",
    });
    // No `date` field: the timestamp is used.
    expect(signals[1].publishedAt).toBe("2026-09-29T05:30:04.399Z");
  });
});
