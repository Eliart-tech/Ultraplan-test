import { describe, expect, it } from "vitest";
import {
  captionTitle,
  clearlyNotFrench,
  extractHashtags,
  keywordToHashtag,
  keywordsToHashtags,
  mapWithConcurrency,
  scrubSecrets,
  toCount,
  toIso,
  uniqueTags,
} from "./social-utils";

describe("toCount", () => {
  it("parses numbers and numeric strings, rejects hidden/garbage values", () => {
    expect(toCount(12)).toBe(12);
    expect(toCount("467501")).toBe(467501);
    expect(toCount(-1)).toBeUndefined();
    expect(toCount("")).toBeUndefined();
    expect(toCount(null)).toBeUndefined();
    expect(toCount("12k")).toBeUndefined();
    expect(toCount(Number.NaN)).toBeUndefined();
  });
});

describe("toIso", () => {
  it("accepts ISO strings (Meta's +0000 offset too), unix seconds and milliseconds", () => {
    expect(toIso("2019-09-26T22:36:43+0000")).toBe("2019-09-26T22:36:43.000Z");
    expect(toIso("2026-10-02T13:33:34+00:00")).toBe("2026-10-02T13:33:34.000Z");
    expect(toIso(1759240000)).toBe("2025-09-30T13:46:40.000Z");
    expect(toIso("1759240000")).toBe("2025-09-30T13:46:40.000Z");
    expect(toIso(1759240000000)).toBe("2025-09-30T13:46:40.000Z");
    expect(toIso("hier")).toBeUndefined();
    expect(toIso(undefined)).toBeUndefined();
  });
});

describe("tags", () => {
  it("normalizes, dedupes and caps tags", () => {
    expect(uniqueTags(["#IA", "ia", " Étudiants ", "", 3], 10)).toEqual(["ia", "étudiants"]);
    expect(extractHashtags("Rentrée 2026 #Rentrée #budget_étudiant #rentrée")).toEqual(["rentrée", "budget_étudiant"]);
  });

  it("turns keywords into hashtags", () => {
    expect(keywordToHashtag("Intelligence artificielle")).toBe("intelligenceartificielle");
    expect(keywordToHashtag("Éco-anxiété")).toBe("ecoanxiete");
    expect(keywordsToHashtags(["IA", "ia", "#", "x", "crypto"], 5)).toEqual(["ia", "crypto"]);
  });
});

describe("captionTitle", () => {
  it("takes the first meaningful line without trailing hashtags", () => {
    expect(captionTitle("\n#fyp #pourtoi\nMa recette express 🍝 #recette #rapide\nSuite", "fallback")).toBe("Ma recette express 🍝");
    expect(captionTitle("#a #b", "Reel de @x")).toBe("Reel de @x");
    expect(captionTitle(undefined, "Reel de @x")).toBe("Reel de @x");
    expect(captionTitle("a".repeat(300), "x")).toHaveLength(120);
  });
});

describe("clearlyNotFrench", () => {
  it("only rejects long captions without any French marker", () => {
    expect(clearlyNotFrench("Not made to last, only to be loved for a little while. A small celebration")).toBe(true);
    expect(clearlyNotFrench("La recette de pâtes la plus rapide de ma vie, tu la testes ce soir")).toBe(false);
    expect(clearlyNotFrench("Beeps! 🐦 #beeps #chirps #tweets")).toBe(false);
    expect(clearlyNotFrench("Voici comment faire des economies quand on est etudiant sans se priver")).toBe(false);
  });
});

describe("scrubSecrets", () => {
  it("removes tokens and keys from URLs and headers", () => {
    const text =
      "GET https://graph.facebook.com/v25.0/me?fields=id&access_token=EAAGabc123456789012345 failed; key=AIzaSyA1234567890123456789012345 Bearer apify_api_abcdef token=xyz";
    const clean = scrubSecrets(text);
    expect(clean).not.toMatch(/EAAGabc|AIzaSyA12|apify_api_abcdef|xyz/);
    expect(clean).toContain("access_token=***");
  });
});

describe("mapWithConcurrency", () => {
  it("limits parallelism and keeps order, capturing failures", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      if (n === 3) throw new Error("boom");
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, "x", 40, 50]);
  });
});
