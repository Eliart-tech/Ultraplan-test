import { describe, expect, it } from "vitest";
import { NOW, fixtureCreator, fixtureInsights, fixtureReport } from "@/lib/creators/__fixtures__/creator";
import { computeCreatorStats } from "@/lib/creators/stats";
import type { CompetitorReport, CreatorPlatformStatus, CreatorPost } from "@/lib/types";
import {
  audienceLeaders,
  barLayout,
  barPath,
  bestBucket,
  chartSeries,
  creatorPlatformFor,
  defaultCompetitorKeys,
  detectPlatformFromInput,
  effectivePlatform,
  formatPct,
  formatRatio,
  ideaFollowDriver,
  isStale,
  niceScale,
  overperformers,
  postMetricLabels,
  postRatio,
  rankingMedian,
  ratiosAllowed,
  reportHref,
  scriptPlatformFor,
  selectReports,
  sortPosts,
  splitFollowSentences,
  underperformers,
} from "./report-utils";

const stats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });
const report = fixtureReport({ stats });

function account(platform: CompetitorReport["data"]["account"]["platform"], handle: string): CompetitorReport {
  return { ...report, id: `${platform}-${handle}`, data: { ...report.data, account: { ...report.data.account, platform, handle } } };
}

describe("platforms", () => {
  it("maps creator platforms to script targets and back", () => {
    expect(scriptPlatformFor("instagram")).toBe("instagram_reels");
    expect(scriptPlatformFor("youtube")).toBe("youtube_shorts");
    expect(scriptPlatformFor("tiktok")).toBe("tiktok");
    expect(scriptPlatformFor("linkedin")).toBe("linkedin");
    for (const platform of ["instagram", "tiktok", "youtube", "linkedin"] as const) {
      expect(creatorPlatformFor(scriptPlatformFor(platform))).toBe(platform);
    }
  });

  it("detects the platform of a pasted profile URL, not of a bare handle", () => {
    expect(detectPlatformFromInput("https://www.tiktok.com/@budgetmalin")).toBe("tiktok");
    expect(detectPlatformFromInput("instagram.com/lea.explique/")).toBe("instagram");
    expect(detectPlatformFromInput("https://m.youtube.com/@Squeezie/videos")).toBe("youtube");
    expect(detectPlatformFromInput("youtu.be/abc")).toBe("youtube");
    expect(detectPlatformFromInput("https://fr.linkedin.com/in/romain-fargeot")).toBe("linkedin");
    expect(detectPlatformFromInput("@squeezie")).toBeNull();
    expect(detectPlatformFromInput("lea.explique")).toBeNull();
    expect(detectPlatformFromInput("https://example.com/@x")).toBeNull();
    expect(detectPlatformFromInput("tiktok.com/@a b")).toBeNull();
  });

  it("picks the first available platform unless the user chose one", () => {
    const capabilities: CreatorPlatformStatus[] = [
      { platform: "instagram", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
      { platform: "tiktok", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
      { platform: "youtube", available: true, via: "flux RSS public", note: "" },
      { platform: "linkedin", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
    ];
    expect(effectivePlatform(null, capabilities)).toBe("youtube");
    expect(effectivePlatform("tiktok", capabilities)).toBe("tiktok");
    expect(effectivePlatform(null, null)).toBe("instagram");
  });

  it("builds the report URL from the account key", () => {
    expect(reportHref("tiktok:budgetmalin")).toBe("/concurrents?rapport=tiktok%3Abudgetmalin");
  });
});

describe("competitor selection for scripts", () => {
  const reports = [account("tiktok", "a"), account("instagram", "b"), account("tiktok", "c"), account("tiktok", "d"), account("tiktok", "e")];

  it("defaults to the saved competitors of the script platform, newest first, max 3", () => {
    expect(defaultCompetitorKeys(reports, "tiktok")).toEqual(["tiktok:a", "tiktok:c", "tiktok:d"]);
    expect(defaultCompetitorKeys(reports, "instagram_reels")).toEqual(["instagram:b"]);
    expect(defaultCompetitorKeys(reports, "linkedin")).toEqual([]);
  });

  it("keeps only saved reports, in saved order", () => {
    expect(selectReports(reports, ["tiktok:e", "gone:x", "instagram:b"]).map((r) => r.id)).toEqual([
      "instagram-b",
      "tiktok-e",
    ]);
  });
});

describe("numbers", () => {
  it("formats ratios and percentages in French", () => {
    expect(formatRatio(3.42)).toBe("×3,4");
    expect(formatRatio(2)).toBe("×2,0");
    expect(formatRatio(15.66)).toBe("×16");
    expect(formatRatio(0.42)).toBe("×0,4");
    expect(formatPct(4.236)).toBe("4,2 %");
    expect(formatPct(37.4)).toBe("37 %");
    expect(formatPct(undefined)).toBe("—");
  });

  it("computes post ratios against the creator's median", () => {
    const median = rankingMedian(report);
    expect(median).toBe(57_500);
    const t5 = fixtureCreator.posts.find((post) => post.id === "t5")!;
    expect(postRatio(t5, "views", median)).toBeCloseTo(15.65, 1);
    expect(postRatio({ ...t5, metrics: {} }, "views", median)).toBeUndefined();
    expect(postRatio(t5, "views", 0)).toBeUndefined();
  });

  it("labels the real metrics of a post", () => {
    const t2 = fixtureCreator.posts.find((post) => post.id === "t2")!;
    // Intl uses no-break spaces: compare with plain ones.
    const plain = (parts: string[]) => parts.map((part) => part.replace(/\s/g, " "));
    expect(plain(postMetricLabels(t2))).toEqual(["450 k vues", "40 k j'aime", "900 comm.", "6 k partages", "12 k enreg."]);
    expect(plain(postMetricLabels({ ...t2, metrics: { likes: 1 } }))).toEqual(["1 j'aime"]);
  });
});

describe("report sections", () => {
  it("lists the outliers best first with the stats' ratio and the audience multiplier", () => {
    const { items, fallback } = overperformers(report);
    expect(fallback).toBe(false);
    expect(items.map((item) => item.post.id)).toEqual(stats.outliers.map((o) => o.postId));
    expect(items[0].ratio).toBe(stats.outliers[0].ratio);
    // 2 000 000 views / 200 000 followers
    expect(items.find((item) => item.post.id === "t10")?.multiplier).toBe(10);
  });

  it("falls back to the top posts when nothing stands out", () => {
    const flat = { ...report, stats: { ...stats, outliers: [] } };
    const { items, fallback } = overperformers(flat);
    expect(fallback).toBe(true);
    expect(items.map((item) => item.post.id)).toEqual(stats.topPostIds.slice(0, 3));
  });

  it("lists the weakest posts", () => {
    expect(underperformers(report).map((item) => item.post.id)).toEqual(stats.bottomPostIds.slice(0, 3));
  });

  it("ranks posts by views ÷ followers, from the stats or computed for older reports", () => {
    const fromStats = audienceLeaders(report);
    expect(fromStats[0].post.id).toBe("t10");
    const older = { ...report, stats: { ...stats, audienceMultipliers: undefined } };
    const computed = audienceLeaders(older, 3);
    expect(computed.map((item) => item.post.id)).toEqual(["t10", "t5", "t2"]);
    expect(computed[1].multiplier).toBe(4.5);
    const noFollowers = { ...older, data: { ...older.data, account: { ...older.data.account, followers: undefined } } };
    expect(audienceLeaders(noFollowers)).toEqual([]);
  });

  it("never computes ratios when the source forbids derived metrics (YouTube)", () => {
    const youtube: CompetitorReport = {
      ...report,
      data: { ...report.data, ratiosAllowed: false, account: { ...report.data.account, platform: "youtube" } },
      stats: { ...stats, audienceMultipliers: undefined, reachRate: undefined, engagementRate: undefined },
    };
    expect(ratiosAllowed(youtube)).toBe(false);
    expect(audienceLeaders(youtube)).toEqual([]);
    const { items } = overperformers(youtube);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.ratio === undefined && item.multiplier === undefined)).toBe(true);
    expect(underperformers(youtube).every((item) => item.ratio === undefined)).toBe(true);
    expect(chartSeries(youtube).bars.every((bar) => bar.ratio === undefined)).toBe(true);
    expect(ratiosAllowed(report)).toBe(true);
  });

  it("highlights the best bucket only when there is a real choice", () => {
    expect(
      bestBucket([
        { label: "lundi", posts: 3, median: 10 },
        { label: "mardi", posts: 2, median: 40 },
        { label: "mercredi", posts: 1, median: 900 },
      ])?.label,
    ).toBe("mardi");
    expect(bestBucket([{ label: "lundi", posts: 4, median: 10 }])).toBeUndefined();
  });

  it("flags reports older than 30 days", () => {
    expect(isStale({ createdAt: "2026-09-01T00:00:00Z" }, NOW)).toBe(true);
    expect(isStale({ createdAt: "2026-09-20T00:00:00Z" }, NOW)).toBe(false);
  });

  it("links an idea to the follow driver it shares evidence with", () => {
    const idea = { ...fixtureInsights.ideas[0], inspiredBy: ["t7", "t5"] };
    expect(ideaFollowDriver(idea, fixtureInsights.followDrivers)?.postIds).toEqual(["t7"]);
    expect(ideaFollowDriver(fixtureInsights.ideas[0], fixtureInsights.followDrivers)).toBeUndefined();
    expect(ideaFollowDriver(idea, undefined)).toBeUndefined();
  });

  it("surfaces the sentences about subscribers", () => {
    const parts = splitFollowSentences(fixtureInsights.ideas[0].whyForYou);
    expect(parts.map((part) => part.follow)).toEqual([false, false, true]);
    expect(parts[2].text).toMatch(/^Abonnements/);
    expect(splitFollowSentences("Pas de point final")).toEqual([{ text: "Pas de point final", follow: false }]);
  });

  it("sorts posts by date or by performance", () => {
    const posts: CreatorPost[] = [
      { ...fixtureCreator.posts[0], id: "a", publishedAt: "2026-09-01T00:00:00Z", metrics: { views: 5 } },
      { ...fixtureCreator.posts[0], id: "b", publishedAt: undefined, metrics: { views: 50 } },
      { ...fixtureCreator.posts[0], id: "c", publishedAt: "2026-09-03T00:00:00Z", metrics: {} },
    ];
    expect(sortPosts(posts, "recent", "views").map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(sortPosts(posts, "performance", "views").map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});

describe("chart", () => {
  it("orders bars oldest → newest, flags outliers and skips hidden metrics", () => {
    const withHidden: CompetitorReport = {
      ...report,
      data: {
        ...report.data,
        posts: report.data.posts.map((post) => (post.id === "t4" ? { ...post, metrics: { likes: 10 } } : post)),
      },
    };
    const series = chartSeries(withHidden);
    expect(series.excluded).toBe(1);
    expect(series.bars[0].postId).toBe("t10");
    expect(series.bars[series.bars.length - 1].postId).toBe("t1");
    expect(series.bars.filter((bar) => bar.outlier).map((bar) => bar.postId).sort()).toEqual(
      stats.outliers.map((o) => o.postId).sort(),
    );
    expect(series.metric).toBe("views");
  });

  it("rounds the axis to clean steps", () => {
    expect(niceScale(23_456)).toEqual({ max: 30_000, ticks: [0, 10_000, 20_000, 30_000] });
    expect(niceScale(18_000)).toEqual({ max: 20_000, ticks: [0, 5_000, 10_000, 15_000, 20_000] });
    expect(niceScale(2_000_000).max).toBe(2_000_000);
    expect(niceScale(7).ticks).toEqual([0, 2, 4, 6, 8]);
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it("lays out thin bars (≤ 24 px, 2 px gap) proportional to the scale", () => {
    const { slot, bars } = barLayout([50, 100, 0], { width: 300, height: 200, scaleMax: 100 });
    expect(slot).toBe(100);
    expect(bars[0]).toEqual({ x: 38, width: 24, y: 100, height: 100 });
    expect(bars[1].height).toBe(200);
    expect(bars[2].height).toBe(0);
    const dense = barLayout(Array(50).fill(1), { width: 200, height: 100, scaleMax: 1 });
    expect(dense.bars[0].width).toBe(2);
  });

  it("draws a rounded data-end and a square baseline", () => {
    expect(barPath({ x: 0, y: 10, width: 20, height: 90 })).toBe("M0,100V14Q0,10 4,10H16Q20,10 20,14V100Z");
    expect(barPath({ x: 0, y: 100, width: 20, height: 0 })).toBe("");
  });
});
