import { describe, expect, it } from "vitest";
import { fixtureViralInputs, fixtureViralPosts, NOW, viralInput } from "./__fixtures__/viral";
import {
  audienceMultiplier,
  compareViralPosts,
  followerBand,
  isYoutubeDataExpired,
  platformStats,
  scoreViralPosts,
  shareSaveRate,
  tierFor,
  viewsPerDay,
} from "./score";

const DAY = 86_400_000;

describe("followerBand", () => {
  it("buckets followers in the 4 bands, edges included in the upper band", () => {
    expect(followerBand(0)).toBe("< 10 k");
    expect(followerBand(9_999)).toBe("< 10 k");
    expect(followerBand(10_000)).toBe("10–100 k");
    expect(followerBand(99_999)).toBe("10–100 k");
    expect(followerBand(100_000)).toBe("100 k–1 M");
    expect(followerBand(1_000_000)).toBe("> 1 M");
    expect(followerBand(undefined)).toBeUndefined();
    expect(followerBand(Number.NaN)).toBeUndefined();
  });
});

describe("audienceMultiplier", () => {
  it("divides views by followers, floored at 1 000, rounded to 2 decimals", () => {
    expect(audienceMultiplier(900_000, 5_000)).toBe(180);
    expect(audienceMultiplier(400_000, 120_000)).toBe(3.33);
    // A 50-follower account is counted as 1 000: no absurd ×500.
    expect(audienceMultiplier(25_000, 50)).toBe(25);
    expect(audienceMultiplier(25_000, 0)).toBe(25);
  });

  it("is undefined when views or followers are unknown", () => {
    expect(audienceMultiplier(undefined, 1_000)).toBeUndefined();
    expect(audienceMultiplier(1_000, undefined)).toBeUndefined();
  });
});

describe("viewsPerDay", () => {
  it("divides by the days since publication, counting at least one day", () => {
    expect(viewsPerDay(900_000, new Date(NOW - 9 * DAY).toISOString(), NOW)).toBe(100_000);
    expect(viewsPerDay(12_000, new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe(12_000);
    // A date in the future (clock skew) still counts as one day.
    expect(viewsPerDay(5_000, new Date(NOW + DAY).toISOString(), NOW)).toBe(5_000);
  });

  it("is undefined without views or a readable date", () => {
    expect(viewsPerDay(undefined, new Date(NOW).toISOString(), NOW)).toBeUndefined();
    expect(viewsPerDay(1_000, undefined, NOW)).toBeUndefined();
    expect(viewsPerDay(1_000, "hier", NOW)).toBeUndefined();
  });
});

describe("shareSaveRate", () => {
  it("is (shares + saves) ÷ views in %, 2 decimals", () => {
    expect(shareSaveRate({ views: 900_000, shares: 20_000, saves: 30_000 })).toBe(5.56);
    expect(shareSaveRate({ views: 25_000, shares: 900 })).toBe(3.6);
    expect(shareSaveRate({ views: 25_000 })).toBeUndefined();
  });
});

describe("tierFor (starting thresholds)", () => {
  it("explose ≥ ×10, cartonne ≥ ×3 or ≥ 3× its band, bon ≥ ×1, normal otherwise or unknown", () => {
    expect(tierFor(10, undefined)).toBe("explose");
    expect(tierFor(9.99, undefined)).toBe("cartonne");
    expect(tierFor(3, undefined)).toBe("cartonne");
    expect(tierFor(0.4, 3)).toBe("cartonne");
    expect(tierFor(2.99, 2.9)).toBe("bon");
    expect(tierFor(1, undefined)).toBe("bon");
    expect(tierFor(0.99, undefined)).toBe("normal");
    expect(tierFor(undefined, undefined)).toBe("normal");
  });
});

describe("scoreViralPosts", () => {
  const byId = new Map(fixtureViralPosts.map((post) => [post.id, post]));

  it("measures every video against its creator's audience", () => {
    expect(byId.get("tiktok:tt1")).toMatchObject({
      multiplier: 180,
      band: "< 10 k",
      viewsPerDay: 100_000,
      shareSaveRate: 5.56,
      tier: "explose",
    });
    expect(byId.get("instagram:IG1abc")).toMatchObject({ multiplier: 25, band: "< 10 k", viewsPerDay: 8_333, tier: "explose" });
    expect(byId.get("tiktok:tt2")).toMatchObject({ multiplier: 4, band: "10–100 k", tier: "cartonne" });
    expect(byId.get("instagram:IG2def")).toMatchObject({ multiplier: 3.33, band: "100 k–1 M", tier: "cartonne" });
    expect(byId.get("tiktok:tt3")).toMatchObject({ multiplier: 1.25, band: "> 1 M", tier: "bon" });
    expect(byId.get("instagram:IG3ghi")).toMatchObject({ multiplier: 0.5, tier: "normal" });
    expect(byId.get("tiktok:tt4")).toMatchObject({ multiplier: 0.1, tier: "normal" });
  });

  it("leaves unknown audiences unmeasured and normal", () => {
    for (const id of ["instagram:IG4jkl", "tiktok:tt5"]) {
      const post = byId.get(id)!;
      expect(post.tier).toBe("normal");
      expect(post).not.toHaveProperty("multiplier");
      expect(post).not.toHaveProperty("band");
      expect(post.viewsPerDay).toBeGreaterThan(0);
    }
  });

  it("computes no derived ratio on YouTube without the amendment: raw counts, velocity and a rank-based tier", () => {
    const youtube = fixtureViralPosts.filter((post) => post.platform === "youtube");
    for (const post of youtube) {
      expect(post).not.toHaveProperty("multiplier");
      expect(post).not.toHaveProperty("band");
      expect(post).not.toHaveProperty("vsBand");
      expect(post).not.toHaveProperty("shareSaveRate");
      expect(post.author.followers).toBeGreaterThan(0);
      expect(post.viewsPerDay).toBeGreaterThan(0);
    }
    // Top 10 % of 3 videos by views = 1 video.
    expect(youtube.map((post) => [post.id, post.tier])).toEqual([
      ["youtube:yt1", "cartonne"],
      ["youtube:yt2", "normal"],
      ["youtube:yt3", "normal"],
    ]);
  });

  it("measures YouTube like the others once YT_DERIVED_METRICS_APPROVED is accepted", () => {
    const approved = scoreViralPosts(fixtureViralInputs, { now: NOW, ratiosAllowed: { youtube: true } });
    expect(approved.find((post) => post.id === "youtube:yt1")).toMatchObject({ multiplier: 1.33, band: "> 1 M", tier: "bon" });
    expect(approved.find((post) => post.id === "youtube:yt3")).toMatchObject({ multiplier: 2.5, tier: "bon" });
  });

  it("orders best first: tier, then multiplier, then views", () => {
    expect(fixtureViralPosts.map((post) => post.id)).toEqual([
      "tiktok:tt1",
      "instagram:IG1abc",
      "tiktok:tt2",
      "instagram:IG2def",
      "youtube:yt1",
      "tiktok:tt3",
      "instagram:IG3ghi",
      "tiktok:tt4",
      "instagram:IG4jkl",
      "youtube:yt2",
      "tiktok:tt5",
      "youtube:yt3",
    ]);
    const shuffled = [...fixtureViralPosts].reverse().sort(compareViralPosts);
    expect(shuffled.map((post) => post.id)).toEqual(fixtureViralPosts.map((post) => post.id));
  });

  it("never mutates its input", () => {
    const input = structuredClone(fixtureViralInputs);
    scoreViralPosts(input, { now: NOW });
    expect(input).toEqual(fixtureViralInputs);
  });

  describe("vs band (median multiplier of the same platform and follower band)", () => {
    // Big accounts (> 1 M): 8 videos at ×0,1 and one at ×0,75.
    const big = Array.from({ length: 8 }, (_, i) =>
      viralInput("tiktok", `big${i}`, { title: `Vidéo ${i}`, views: 200_000, followers: 2_000_000, handle: `gros${i}` }),
    );
    const standout = viralInput("tiktok", "bigstar", { title: "La vidéo qui sort du lot", views: 1_500_000, followers: 2_000_000, handle: "star" });

    it("compares each video with comparable accounts once the band holds 8 videos", () => {
      const scored = scoreViralPosts([...big, standout], { now: NOW });
      const star = scored.find((post) => post.id === "tiktok:bigstar")!;
      expect(star.multiplier).toBe(0.75);
      expect(star.vsBand).toBe(7.5);
      // ×0,75 its audience, but 7,5 times what accounts of its size get.
      expect(star.tier).toBe("cartonne");
      expect(scored.find((post) => post.id === "tiktok:big0")).toMatchObject({ vsBand: 1, tier: "normal" });
    });

    it("stays undefined in a band with fewer than 8 videos", () => {
      const scored = scoreViralPosts([...big.slice(0, 6), standout], { now: NOW });
      expect(scored.find((post) => post.id === "tiktok:bigstar")).not.toHaveProperty("vsBand");
      expect(scored.find((post) => post.id === "tiktok:bigstar")?.tier).toBe("normal");
    });

    it("keeps bands per platform", () => {
      const instagram = viralInput("instagram", "igbig", { title: "Reel", views: 1_500_000, followers: 2_000_000, handle: "ig" });
      const scored = scoreViralPosts([...big, instagram], { now: NOW });
      expect(scored.find((post) => post.id === "instagram:igbig")).not.toHaveProperty("vsBand");
    });
  });
});

describe("platformStats", () => {
  it("counts videos and known audiences, with median views and multiplier", () => {
    expect(platformStats(fixtureViralPosts, "tiktok")).toEqual({ count: 5, withFollowers: 4, medianViews: 200_000, medianMultiplier: 2.63 });
    expect(platformStats(fixtureViralPosts, "instagram")).toEqual({ count: 4, withFollowers: 3, medianViews: 172_500, medianMultiplier: 3.33 });
    // Raw counts only on YouTube without the amendment.
    expect(platformStats(fixtureViralPosts, "youtube")).toEqual({ count: 3, withFollowers: 3, medianViews: 150_000 });
    expect(platformStats([], "youtube")).toEqual({ count: 0, withFollowers: 0 });
  });
});

describe("isYoutubeDataExpired", () => {
  it("expires YouTube statistics after 30 days", () => {
    expect(isYoutubeDataExpired(new Date(NOW - 29 * DAY).toISOString(), NOW)).toBe(false);
    expect(isYoutubeDataExpired(new Date(NOW - 31 * DAY).toISOString(), NOW)).toBe(true);
    expect(isYoutubeDataExpired("pas une date", NOW)).toBe(true);
  });
});
