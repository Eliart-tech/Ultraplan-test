import { describe, expect, it } from "vitest";
import { fixtureTopic } from "@/lib/script/__fixtures__/script";
import { fixtureViralPosts, fixtureViralReport } from "@/lib/viral/__fixtures__/viral";
import { stripViralYoutubeMetrics, viralReportKey } from "@/lib/client/storage";
import type { ViralReport } from "@/lib/types";
import {
  VIRAL_NONE,
  defaultViralReport,
  effectiveViralPlatforms,
  filterViralPosts,
  ideaScriptPlatform,
  isExpiredPost,
  keywordsFromNiche,
  logDomain,
  logPosition,
  logTicks,
  nearestPoint,
  ratiosAllowedFor,
  reportPlatforms,
  scatterPoints,
  selectViralReport,
  sortViralPosts,
  tierCounts,
  viralReportHref,
  viralReportTitle,
} from "./viral-utils";

const report = fixtureViralReport();
const ids = (posts: { id: string }[]) => posts.map((post) => post.id);

describe("tiers and filters", () => {
  it("counts videos per tier", () => {
    expect(tierCounts(fixtureViralPosts)).toEqual({ explose: 2, cartonne: 3, bon: 1, normal: 6 });
  });

  it("filters by platform and level, keeping the server order", () => {
    expect(ids(filterViralPosts(fixtureViralPosts, { platform: "all", tier: "top" })).sort()).toEqual(
      ["instagram:IG1abc", "instagram:IG2def", "tiktok:tt1", "tiktok:tt2", "youtube:yt1"].sort(),
    );
    expect(filterViralPosts(fixtureViralPosts, { platform: "youtube", tier: "all" })).toHaveLength(3);
    expect(ids(filterViralPosts(fixtureViralPosts, { platform: "tiktok", tier: "explose" }))).toEqual(["tiktok:tt1"]);
    expect(filterViralPosts(fixtureViralPosts, { platform: "instagram", tier: "bon" })).toEqual([]);
  });

  it("sorts by multiplier, views, velocity or date, unknown values last", () => {
    const byMultiplier = sortViralPosts(fixtureViralPosts, "multiplier");
    expect(byMultiplier[0].id).toBe("tiktok:tt1");
    expect(byMultiplier.slice(-5).every((post) => post.multiplier === undefined)).toBe(true);
    expect(sortViralPosts(fixtureViralPosts, "views")[0].id).toBe("tiktok:tt3");
    const velocity = sortViralPosts(fixtureViralPosts, "velocity");
    expect(velocity[0].viewsPerDay).toBe(Math.max(...fixtureViralPosts.map((post) => post.viewsPerDay ?? 0)));
    expect(sortViralPosts(fixtureViralPosts, "recent")[0].id).toBe("youtube:yt3");
    expect(ids(sortViralPosts(fixtureViralPosts, "rank"))).toEqual(ids(fixtureViralPosts));
  });

  it("knows where ratios are allowed (YouTube restricted by default)", () => {
    expect(ratiosAllowedFor(report, "youtube")).toBe(false);
    expect(ratiosAllowedFor(report, "tiktok")).toBe(true);
    expect(ratiosAllowedFor({ platforms: [] }, "youtube")).toBe(false);
    expect(ratiosAllowedFor({ platforms: [] }, "instagram")).toBe(true);
  });

  it("lists the platforms that returned videos, in display order", () => {
    expect(reportPlatforms(report)).toEqual(["instagram", "tiktok", "youtube"]);
    expect(reportPlatforms({ posts: fixtureViralPosts.filter((post) => post.platform === "tiktok") })).toEqual(["tiktok"]);
  });

  it("marks YouTube videos expired once their statistics are erased", () => {
    const stripped = stripViralYoutubeMetrics(report);
    const youtube = stripped.posts.find((post) => post.platform === "youtube")!;
    const tiktok = stripped.posts.find((post) => post.platform === "tiktok")!;
    expect(isExpiredPost(stripped, youtube)).toBe(true);
    expect(isExpiredPost(stripped, tiktok)).toBe(false);
    expect(isExpiredPost(report, youtube)).toBe(false);
  });
});

describe("form helpers", () => {
  it("keeps the explicit choice or every available platform", () => {
    const caps = [
      { platform: "instagram" as const, available: true },
      { platform: "tiktok" as const, available: true },
      { platform: "youtube" as const, available: false },
    ];
    expect(effectiveViralPlatforms(null, null)).toEqual(["instagram", "tiktok", "youtube"]);
    expect(effectiveViralPlatforms(["youtube", "tiktok"], null)).toEqual(["tiktok", "youtube"]);
    expect(effectiveViralPlatforms(null, caps)).toEqual(["instagram", "tiktok"]);
    expect(effectiveViralPlatforms(["youtube"], caps)).toEqual([]);
  });

  it("suggests up to 3 keywords from the profile's niche", () => {
    expect(keywordsFromNiche("Finance perso pour jeunes actifs, budget / épargne")).toEqual([
      "Finance perso pour jeunes actifs",
      "budget",
      "épargne",
    ]);
    expect(keywordsFromNiche("Sommeil et productivité")).toEqual(["Sommeil", "productivité"]);
    expect(keywordsFromNiche("#sport, sport, Sport, yoga, running")).toEqual(["sport", "yoga", "running"]);
    expect(keywordsFromNiche("x".repeat(41))).toEqual([]);
    expect(keywordsFromNiche("")).toEqual([]);
  });

  it("names reports and links to them", () => {
    expect(viralReportTitle(report)).toBe("sommeil et productivité");
    expect(viralReportTitle({ request: { ...report.request, niche: " " } })).toBe("sommeil · productivité");
    expect(viralReportHref("tiktok:budget|epargne")).toBe("/ce-qui-cartonne?rapport=tiktok%3Abudget%7Cepargne");
  });
});

describe("Studio: which lab report a script relies on", () => {
  const other: ViralReport = fixtureViralReport({
    id: "report-2",
    request: { ...report.request, keywords: ["budget", "épargne"], niche: "finances perso" },
  });
  const reports = [other, report];

  it("picks the most recent report sharing a word with the topic or the niche", () => {
    expect(defaultViralReport(reports, { topic: { ...fixtureTopic, title: "Pourquoi on dort mal", keywords: ["sommeil"] } })?.id).toBe(
      "report-1",
    );
    expect(defaultViralReport(reports, { niche: "Les budgets des étudiants" })?.id).toBe("report-2");
    expect(defaultViralReport(reports, { niche: "productivite au bureau" })?.id).toBe("report-1");
    expect(defaultViralReport(reports, { topic: { title: "Bourse", keywords: ["actions"], category: "Économie" } })).toBeUndefined();
    expect(defaultViralReport(reports, {})).toBeUndefined();
  });

  it("honours an explicit choice, « none », and falls back when the report is gone", () => {
    const context = { niche: "sommeil" };
    expect(selectViralReport(reports, null, context)).toEqual({ report, auto: true });
    expect(selectViralReport(reports, viralReportKey(other), context)).toEqual({ report: other, auto: false });
    expect(selectViralReport(reports, VIRAL_NONE, context)).toEqual({ report: undefined, auto: false });
    expect(selectViralReport(reports, "tiktok:supprime", context)).toEqual({ report, auto: true });
  });

  it("writes an idea for the platform its inspiring videos come from", () => {
    expect(ideaScriptPlatform(report, { inspiredBy: ["tiktok:tt1", "tiktok:tt2", "instagram:IG1abc"] })).toBe("tiktok");
    expect(ideaScriptPlatform(report, { inspiredBy: ["tiktok:tt1", "instagram:IG1abc"] })).toBe("instagram_reels");
    expect(ideaScriptPlatform(report, { inspiredBy: ["youtube:yt1"] })).toBe("youtube_shorts");
    expect(ideaScriptPlatform(report, { inspiredBy: ["inconnu"] })).toBeUndefined();
    const tiktokOnly = fixtureViralReport({ posts: fixtureViralPosts.filter((post) => post.platform === "tiktok") });
    expect(ideaScriptPlatform(tiktokOnly, { inspiredBy: [] })).toBe("tiktok");
  });
});

describe("scatter plot", () => {
  it("places videos with views and followers, never YouTube without ratios", () => {
    const { points, excluded } = scatterPoints(report, report.posts);
    expect(points.every((point) => point.platform !== "youtube")).toBe(true);
    expect(excluded).toBe(5); // 3 YouTube + 2 unknown audiences
    expect(points).toHaveLength(7);
    const small = points.find((point) => point.postId === "instagram:IG1abc")!;
    expect(small).toMatchObject({ followers: 1000, views: 25_000, author: "@julie.focus" });
    expect(small.multiplier).toBeCloseTo(25);
  });

  it("places YouTube videos once derived metrics are approved", () => {
    const approved = fixtureViralReport({
      platforms: report.platforms.map((summary) => ({ ...summary, ratiosAllowed: true })),
    });
    expect(scatterPoints(approved, approved.posts).points.some((point) => point.platform === "youtube")).toBe(true);
  });

  it("builds log scales on powers of ten", () => {
    expect(logDomain([3400, 820_000])).toEqual([1000, 1_000_000]);
    expect(logDomain([1000])).toEqual([1000, 10_000]);
    expect(logDomain([])).toEqual([1, 10]);
    expect(logTicks([1000, 1_000_000])).toEqual([1000, 10_000, 100_000, 1_000_000]);
    expect(logPosition(10_000, [1000, 100_000], [0, 100])).toBeCloseTo(50);
    expect(logPosition(100_000, [1000, 100_000], [200, 0])).toBeCloseTo(0);
    expect(logPosition(0, [1000, 100_000], [200, 0])).toBe(200);
  });

  it("finds the closest point within the hit radius", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
    ];
    expect(nearestPoint(points, 30, 12)).toBe(1);
    expect(nearestPoint(points, 12, 30)).toBe(0);
    expect(nearestPoint(points, 100, 100)).toBeNull();
  });
});
