import { describe, expect, it } from "vitest";
import { fixtureTopic } from "../script/__fixtures__/script";
import type { CreatorPost, Topic } from "../types";
import { fixtureCreator, fixtureReport, NOW } from "./__fixtures__/creator";
import { competitorCoverage } from "./coverage";
import { computeCreatorStats } from "./stats";

const stats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });

function topic(title: string, keywords: string[] = []): Topic {
  return { ...fixtureTopic, title, keywords };
}

function post(id: string, title: string, extra: Partial<CreatorPost> = {}): CreatorPost {
  return { id, url: `https://www.tiktok.com/@x/video/${id}`, title, kind: "short_video", metrics: { views: 1_000 }, hashtags: [], ...extra };
}

describe("competitorCoverage", () => {
  const report = fixtureReport({ stats });

  it("finds the competitor's posts on the topic, with their performance", () => {
    expect(competitorCoverage(topic("Les frais bancaires augmentent en 2027", ["frais bancaires"]), [report])).toEqual([
      {
        platform: "tiktok",
        handle: "budgetmalin",
        postId: "t1",
        title: "Tu paies encore des frais bancaires ?",
        url: "https://www.tiktok.com/@budgetmalin/video/t1",
        publishedAt: "2026-10-02T05:00:00Z",
        views: 8_000,
        ratio: 0.1,
      },
    ]);
  });

  it("matches a whole multi-word keyword, accents and case ignored", () => {
    expect(competitorCoverage(topic("Inflation et épargne", ["Livret rentable"]), [report]).map((h) => h.postId)).toEqual(["t3"]);
    // A one-word keyword ("livret A" → "livret") is too vague on its own, and one title word is not enough.
    expect(competitorCoverage(topic("Taux du livret A au 1er février", ["livret A"]), [report])).toEqual([]);
  });

  it("matches a hashtag written as one word (#changementdheure)", () => {
    const withTag = fixtureReport({
      stats,
      data: { ...fixtureCreator, posts: [post("h1", "Dimanche on dort plus", { hashtags: ["changementdheure"] })] },
    });
    expect(competitorCoverage(topic("Changement d'heure du 25 octobre", ["changement d'heure"]), [withTag]).map((h) => h.postId)).toEqual(["h1"]);
  });

  it("needs two title words covering half the title when no keyword matches", () => {
    const data = {
      ...fixtureCreator,
      posts: [
        post("a", "Abonnement salle de sport : ce qu'il coûte vraiment"),
        post("b", "Mon abonnement préféré"),
      ],
    };
    const r = fixtureReport({ stats, data });
    expect(competitorCoverage(topic("Prix des abonnements salle de sport"), [r]).map((h) => h.postId)).toEqual(["a"]);
  });

  it("ignores unrelated topics", () => {
    expect(competitorCoverage(topic("Ligue des champions : le PSG qualifié", ["psg"]), [report])).toEqual([]);
    expect(competitorCoverage(topic(""), [report])).toEqual([]);
    expect(competitorCoverage(topic("Frais bancaires"), [])).toEqual([]);
  });

  it("returns the 3 most recent hits across competitors, without duplicates", () => {
    const other = fixtureReport({
      id: "report-2",
      stats,
      data: {
        ...fixtureCreator,
        account: { ...fixtureCreator.account, handle: "autre" },
        posts: [
          post("o1", "Arnaque aux frais bancaires", { publishedAt: "2026-10-01T10:00:00Z" }),
          post("o2", "Frais bancaires cachés", { publishedAt: "2026-09-01T10:00:00Z" }),
          post("o3", "Les frais bancaires des jeunes", { publishedAt: "2026-09-29T10:00:00Z" }),
          post("o4", "Frais bancaires : sans date"),
        ],
      },
    });
    const hits = competitorCoverage(topic("Frais bancaires", ["frais bancaires"]), [report, other, report]);
    expect(hits.map((h) => `${h.handle}:${h.postId}`)).toEqual(["budgetmalin:t1", "autre:o1", "autre:o3"]);
  });

  it("omits the ratio when the source's terms forbid derived metrics (YouTube)", () => {
    const restricted = fixtureReport({ stats, data: { ...fixtureCreator, ratiosAllowed: false } });
    const [hit] = competitorCoverage(topic("Frais bancaires", ["frais bancaires"]), [restricted]);
    expect(hit.views).toBe(8_000);
    expect(hit).not.toHaveProperty("ratio");
  });
});
