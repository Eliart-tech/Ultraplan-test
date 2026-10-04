import { describe, expect, it } from "vitest";
import type { CreatorData, CreatorPost } from "../types";
import { fixtureCreator, fixturePosts, NOW } from "./__fixtures__/creator";
import {
  audienceMultiplier,
  chooseRankingMetric,
  computeCreatorStats,
  durationBucket,
  engagementScore,
  hasCallToAction,
  isQuestionTitle,
  isSeriesPost,
  localSlot,
  median,
  performanceRatios,
  roundRatio,
  shareSaveRate,
  timeZoneForGeo,
} from "./stats";

const PARIS = { now: NOW, timeZone: "Europe/Paris" };

function data(posts: CreatorPost[], followers?: number): CreatorData {
  return { ...fixtureCreator, account: { ...fixtureCreator.account, followers }, posts };
}

function simple(id: string, metrics: CreatorPost["metrics"], extra: Partial<CreatorPost> = {}): CreatorPost {
  return { id, url: `https://example.com/${id}`, title: `Post ${id}`, kind: "short_video", metrics, hashtags: [], ...extra };
}

describe("timeZoneForGeo", () => {
  it("maps markets to their IANA zone, Europe/Paris by default", () => {
    expect(timeZoneForGeo("FR")).toBe("Europe/Paris");
    expect(timeZoneForGeo("be")).toBe("Europe/Brussels");
    expect(timeZoneForGeo(" CA ")).toBe("America/Toronto");
    expect(timeZoneForGeo("MA")).toBe("Africa/Casablanca");
    expect(timeZoneForGeo("ZZ")).toBe("Europe/Paris");
    expect(timeZoneForGeo(undefined)).toBe("Europe/Paris");
  });
});

describe("numeric helpers", () => {
  it("median ignores missing values and averages the two middle values", () => {
    expect(median([3, undefined, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([undefined, Number.NaN])).toBeUndefined();
    expect(median([])).toBeUndefined();
  });

  it("roundRatio scales before dividing (no binary artefacts)", () => {
    expect(roundRatio(15_000, 200_000, 2)).toBe(0.08);
    expect(roundRatio(57_500 * 100, 200_000, 1)).toBe(28.8);
    expect(roundRatio(450_000, 57_500, 1)).toBe(7.8);
  });

  it("engagementScore = likes + 3 × comments + 5 × shares, undefined without any of them", () => {
    expect(engagementScore({ likes: 100, comments: 10, shares: 2 })).toBe(140);
    expect(engagementScore({ comments: 10 })).toBe(30);
    expect(engagementScore({ views: 1000, saves: 3 })).toBeUndefined();
  });

  it("shareSaveRate and audienceMultiplier need their denominators", () => {
    expect(shareSaveRate({ views: 1000, shares: 10, saves: 15 })).toBe(2.5);
    expect(shareSaveRate({ views: 1000 })).toBeUndefined();
    expect(shareSaveRate({ shares: 10 })).toBeUndefined();
    expect(audienceMultiplier(simple("a", { views: 300_000 }), 100_000)).toBe(3);
    expect(audienceMultiplier(simple("a", { views: 300_000 }), undefined)).toBeUndefined();
    expect(audienceMultiplier(simple("a", { views: 300_000 }), 0)).toBeUndefined();
    expect(audienceMultiplier(simple("a", {}), 100)).toBeUndefined();
  });
});

describe("ranking metric", () => {
  it("uses views when at least 60 % of the posts expose them", () => {
    const posts = [simple("a", { views: 1 }), simple("b", { views: 2 }), simple("c", { views: 3 }), simple("d", { likes: 4 }), simple("e", { likes: 5 })];
    expect(chooseRankingMetric(posts)).toBe("views");
    expect(chooseRankingMetric(posts.slice(2))).toBe("engagement");
    expect(chooseRankingMetric([])).toBe("engagement");
  });

  it("performanceRatios compares each post to the creator's own median", () => {
    const ratios = performanceRatios(fixturePosts, "views");
    expect(ratios.get("t5")).toBe(15.7);
    expect(ratios.get("t2")).toBe(7.8);
    expect(ratios.get("t7")).toBe(1);
    expect(ratios.get("t1")).toBe(0.1);
    expect(performanceRatios([simple("a", { views: 0 }), simple("b", { views: 0 })], "views").size).toBe(0);
  });
});

describe("text heuristics", () => {
  it.each([
    "Abonne-toi pour la partie 2",
    "abonnez-vous !",
    "Commente GUIDE et je te l'envoie",
    "Dis-moi en commentaire ce que tu en penses",
    "Enregistre pour plus tard",
    "Enregistre-la avant samedi",
    "Partage ça à ton coloc",
    "Envoie ça à ta mère",
    "Lien en bio pour le tableur",
    "Le guide est dans ma bio",
    "Clique sur le lien",
    "Tague un ami qui dépense trop",
    "Écris-moi en DM",
    "Follow for part 2",
    "Link in bio",
    "Save this for later",
    "Like and subscribe",
  ])("detects a call to action: %s", (text) => {
    expect(hasCallToAction(text)).toBe(true);
  });

  it.each([
    "J'ai enregistré cette vidéo hier",
    "Le partage de la valeur dans les entreprises",
    "Une sauvegarde automatique de tes données",
    "Il identifie le problème rapidement",
    "Je mange bio depuis 3 ans",
    "",
  ])("ignores what is not a call to action: %s", (text) => {
    expect(hasCallToAction(text)).toBe(false);
  });

  it("detects a question in the first line of the title only", () => {
    expect(isQuestionTitle("Tu paies encore des frais bancaires ?")).toBe(true);
    expect(isQuestionTitle("Pourquoi je n'investis pas en crypto")).toBe(false);
    expect(isQuestionTitle("Mon budget\nTu ferais quoi ?")).toBe(false);
    expect(isQuestionTitle(undefined)).toBe(false);
  });

  it.each([
    ["Partie 2 : le livret A", undefined],
    ["Épisode 3 : la règle des 50/30/20", undefined],
    ["Nouvel épisode", undefined],
    ["Ep. 12 du podcast", undefined],
    ["Part 3 of my budget", undefined],
    ["Mes dépenses #4", undefined],
    ["Budget étudiant (1/3)", undefined],
    ["Jour 12 de mon défi zéro dépense", undefined],
    ["Défi jour 3/30", undefined],
    ["Mon budget", "La suite en partie 2 demain"],
  ])("detects a series: %s", (title, text) => {
    expect(isSeriesPost({ title, text })).toBe(true);
  });

  it.each([
    ["Comment j'ai économisé 10 000 € en un an", undefined],
    ["3 erreurs qui vident ton compte", "#argent #budget"],
    ["Je bois 2 litres par jour", undefined],
    ["La règle des 50/30/20", undefined],
  ])("ignores what is not a series: %s", (title, text) => {
    expect(isSeriesPost({ title, text })).toBe(false);
  });

  it("buckets durations at 30 s, 60 s and 3 min", () => {
    expect([29.9, 30, 60, 60.5, 180, 181].map(durationBucket)).toEqual(["< 30 s", "30–60 s", "30–60 s", "1–3 min", "1–3 min", "> 3 min"]);
  });

  it("reads weekday and hour in the market's time zone", () => {
    expect(localSlot("2026-09-30T17:30:00Z", "Europe/Paris")).toEqual({ weekday: 2, hour: 19 });
    expect(localSlot("2026-09-30T02:30:00Z", "America/Toronto")).toEqual({ weekday: 1, hour: 22 });
    expect(localSlot("2026-09-30T22:30:00Z", "Europe/Paris")).toEqual({ weekday: 3, hour: 0 });
    expect(localSlot("2026-09-30T17:30:00Z", "Pas/UneZone")).toEqual({ weekday: 2, hour: 19 });
    expect(localSlot(undefined, "Europe/Paris")).toBeUndefined();
    expect(localSlot("pas une date", "Europe/Paris")).toBeUndefined();
  });
});

describe("computeCreatorStats — fixture worked out by hand", () => {
  const stats = computeCreatorStats(fixtureCreator, PARIS);

  it("counts posts, window and rhythm (the pinned post is left out of the rhythm)", () => {
    expect(stats.postCount).toBe(10);
    // t9 (16 sept. 17:00 UTC) → t1 (2 oct. 05:00 UTC) = 15,5 days; 9 posts = 8 intervals.
    expect(stats.windowDays).toBe(16);
    expect(stats.postsPerWeek).toBe(3.6);
  });

  it("ranks on views and gives robust medians", () => {
    expect(stats.rankingMetric).toBe("views");
    expect(stats.medianViews).toBe(57_500);
    expect(stats.medianLikes).toBe(3_500);
    expect(stats.medianComments).toBe(125);
    expect(stats.engagementRate).toBe(7.65);
    expect(stats.shareSaveRate).toBe(1.47);
    expect(stats.reachRate).toBe(28.8);
  });

  it("lists outliers at ≥ ×2 the median, best first", () => {
    expect(stats.outliers).toEqual([
      { postId: "t10", ratio: 34.8 },
      { postId: "t5", ratio: 15.7 },
      { postId: "t2", ratio: 7.8 },
    ]);
  });

  it("lists the audience multipliers (views ÷ followers), best first", () => {
    expect(stats.audienceMultipliers).toEqual([
      { postId: "t10", multiplier: 10 },
      { postId: "t5", multiplier: 4.5 },
      { postId: "t2", multiplier: 2.25 },
      { postId: "t9", multiplier: 0.35 },
      { postId: "t3", multiplier: 0.3 },
      { postId: "t7", multiplier: 0.28 },
      { postId: "t4", multiplier: 0.15 },
      { postId: "t6", multiplier: 0.1 },
      { postId: "t8", multiplier: 0.08 },
      { postId: "t1", multiplier: 0.04 },
    ]);
  });

  it("picks the 5 best and the 3 weakest, never a post younger than 48 h", () => {
    expect(stats.topPostIds).toEqual(["t10", "t5", "t2", "t9", "t3"]);
    // t1 (8 k views) is the weakest but was published 10 h before the analysis.
    expect(stats.bottomPostIds).toEqual(["t8", "t6", "t4"]);
  });

  it("buckets by French weekday and local hour (Europe/Paris)", () => {
    expect(stats.weekdays).toEqual([
      { label: "lundi", posts: 1, median: 60_000 },
      { label: "mardi", posts: 1, median: 20_000 },
      { label: "mercredi", posts: 2, median: 260_000 },
      { label: "jeudi", posts: 1, median: 900_000 },
      { label: "vendredi", posts: 2, median: 11_500 },
      { label: "samedi", posts: 2, median: 1_015_000 },
      { label: "dimanche", posts: 1, median: 55_000 },
    ]);
    expect(stats.hours).toEqual([
      { label: "7 h", posts: 1, median: 8_000 },
      { label: "10 h", posts: 1, median: 15_000 },
      { label: "12 h", posts: 1, median: 2_000_000 },
      { label: "13 h", posts: 1, median: 30_000 },
      { label: "19 h", posts: 5, median: 70_000 },
      { label: "21 h", posts: 1, median: 20_000 },
    ]);
  });

  it("buckets video durations", () => {
    expect(stats.durations).toEqual([
      { label: "< 30 s", posts: 2, median: 454_000 },
      { label: "30–60 s", posts: 5, median: 70_000 },
      { label: "1–3 min", posts: 2, median: 25_000 },
      { label: "> 3 min", posts: 1, median: 15_000 },
    ]);
  });

  it("ranks hashtags by frequency, then median performance", () => {
    expect(stats.hashtags).toEqual([
      { label: "#argent", posts: 6, median: 260_000 },
      { label: "#budget", posts: 4, median: 252_500 },
      { label: "#epargne", posts: 2, median: 37_500 },
      { label: "#abonnement", posts: 1, median: 900_000 },
      { label: "#paris", posts: 1, median: 70_000 },
      { label: "#crypto", posts: 1, median: 20_000 },
      { label: "#banque", posts: 1, median: 8_000 },
    ]);
  });

  it("measures calls to action, questions and series", () => {
    expect(stats.ctaShare).toBe(30); // t1 abonne-toi, t2 enregistre, t7 lien en bio
    expect(stats.questionShare).toBe(30); // t1, t3, t9
    expect(stats.seriesShare).toBe(30); // t1 « partie 2 », t3 « Partie 2 », t7 « Épisode 3 »
  });

  it("is deterministic and leaves the input untouched", () => {
    const copy = structuredClone(fixtureCreator);
    expect(computeCreatorStats(fixtureCreator, PARIS)).toEqual(stats);
    expect(fixtureCreator).toEqual(copy);
  });
});

describe("computeCreatorStats — edge cases", () => {
  it("handles an account without posts", () => {
    const stats = computeCreatorStats(data([]), PARIS);
    expect(stats).toEqual({
      postCount: 0,
      windowDays: 0,
      postsPerWeek: 0,
      rankingMetric: "engagement",
      outliers: [],
      topPostIds: [],
      bottomPostIds: [],
      weekdays: [],
      hours: [],
      durations: [],
      hashtags: [],
      medianCaptionLength: 0,
      ctaShare: 0,
      questionShare: 0,
      seriesShare: 0,
    });
  });

  it("ranks LinkedIn-like posts (no views, no followers) on engagement", () => {
    const posts = [
      simple("a", { likes: 100, comments: 10, shares: 2 }, { kind: "social_post", durationSec: 40 }),
      simple("b", { likes: 50, comments: 5 }, { kind: "social_post" }),
      simple("c", { likes: 400, comments: 40, shares: 10 }, { kind: "social_post" }),
      simple("d", { likes: 30 }, { kind: "social_post" }),
      simple("e", { likes: 60, comments: 2 }, { kind: "social_post" }),
    ];
    const stats = computeCreatorStats(data(posts), PARIS);
    expect(stats.rankingMetric).toBe("engagement");
    // Scores: a 140, b 65, c 570, d 30, e 66 → median 66.
    expect(stats.outliers).toEqual([
      { postId: "c", ratio: 8.6 },
      { postId: "a", ratio: 2.1 },
    ]);
    expect(stats.topPostIds).toEqual(["c", "a", "e", "b", "d"]);
    expect(stats.bottomPostIds).toEqual([]);
    expect(stats.medianViews).toBeUndefined();
    expect(stats.engagementRate).toBeUndefined();
    expect(stats.reachRate).toBeUndefined();
    expect(stats.audienceMultipliers).toBeUndefined();
    expect(stats.shareSaveRate).toBeUndefined();
    // Social posts are not videos: no duration buckets. No dates: no calendar.
    expect(stats.durations).toEqual([]);
    expect(stats.weekdays).toEqual([]);
    expect(stats.hours).toEqual([]);
    expect(stats.windowDays).toBe(0);
    expect(stats.postsPerWeek).toBe(0);
  });

  it("needs 5 measured posts to call outliers", () => {
    const posts = [simple("a", { views: 10 }), simple("b", { views: 10 }), simple("c", { views: 10 }), simple("d", { views: 1_000 })];
    expect(computeCreatorStats(data(posts), PARIS).outliers).toEqual([]);
    expect(computeCreatorStats(data([...posts, simple("e", { views: 10 })]), PARIS).outliers).toEqual([{ postId: "d", ratio: 100 }]);
  });

  it("ignores hidden metrics in the medians (Instagram hides some likes)", () => {
    const posts = [
      simple("a", { views: 1_000, likes: 100 }),
      simple("b", { views: 3_000 }),
      simple("c", { views: 2_000, likes: 300, comments: 10 }),
    ];
    const stats = computeCreatorStats(data(posts, 10_000), PARIS);
    expect(stats.medianLikes).toBe(200);
    expect(stats.medianComments).toBe(10);
    // Engagement rate only where likes are known: a 10 %, c 15,5 % → 12,75 %.
    expect(stats.engagementRate).toBe(12.75);
    expect(stats.reachRate).toBe(20);
  });

  it("measures caption length in characters, emoji included, falling back to the title", () => {
    const posts = [
      simple("a", {}, { title: "Titre", text: "1234567890" }),
      simple("b", {}, { title: "Titre de vingt carac" }),
      simple("c", {}, { title: "x", text: "Trente caractères avec émoji 💸" }),
    ];
    expect(computeCreatorStats(data(posts), PARIS).medianCaptionLength).toBe(20);
  });

  it("keeps a market's local time (Toronto vs Paris)", () => {
    const posts = [simple("a", { views: 1 }, { publishedAt: "2026-09-30T02:30:00Z" })];
    expect(computeCreatorStats(data(posts), { now: NOW, timeZone: "America/Toronto" }).hours).toEqual([{ label: "22 h", posts: 1, median: 1 }]);
    expect(computeCreatorStats(data(posts), PARIS).hours).toEqual([{ label: "4 h", posts: 1, median: 1 }]);
  });

  it("deduplicates hashtags within a post and normalises their case", () => {
    const posts = [simple("a", { views: 1 }, { hashtags: ["Budget", "#budget", "budget"] }), simple("b", { views: 3 }, { hashtags: ["budget"] })];
    expect(computeCreatorStats(data(posts), PARIS).hashtags).toEqual([{ label: "#budget", posts: 2, median: 2 }]);
  });

  it("omits derived rates and multipliers when the source's terms forbid them (YouTube API)", () => {
    const stats = computeCreatorStats({ ...fixtureCreator, ratiosAllowed: false }, PARIS);
    expect(stats.engagementRate).toBeUndefined();
    expect(stats.shareSaveRate).toBeUndefined();
    expect(stats.reachRate).toBeUndefined();
    expect(stats.audienceMultipliers).toBeUndefined();
    // Orderings of raw counts remain; "×N its median" outliers are a derived metric.
    expect(stats.medianViews).toBe(57_500);
    expect(stats.topPostIds).toEqual(["t10", "t5", "t2", "t9", "t3"]);
    expect(stats.outliers).toEqual([]);
    expect(computeCreatorStats({ ...fixtureCreator, ratiosAllowed: true }, PARIS)).toEqual(computeCreatorStats(fixtureCreator, PARIS));
  });

  it("falls back to every dated post for the rhythm when only pinned posts are dated", () => {
    const posts = [
      simple("a", { views: 1 }, { publishedAt: "2026-09-01T00:00:00Z", pinned: true }),
      simple("b", { views: 1 }, { publishedAt: "2026-09-15T00:00:00Z", pinned: true }),
    ];
    const stats = computeCreatorStats(data(posts), PARIS);
    expect(stats.windowDays).toBe(14);
    expect(stats.postsPerWeek).toBe(0.5);
  });
});
