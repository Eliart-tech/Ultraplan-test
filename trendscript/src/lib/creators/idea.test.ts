import { describe, expect, it } from "vitest";
import { scriptRequestSchema } from "../schemas";
import { buildScriptPrompt } from "../script/prompt";
import { fixtureRequest } from "../script/__fixtures__/script";
import { PLAYBOOK } from "../server/ai/playbook";
import { fixtureCreator, fixtureInsights, fixtureReport, NOW } from "./__fixtures__/creator";
import { ideaToStudio, postToSignal } from "./idea";
import { computeCreatorStats } from "./stats";

const stats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });
const report = fixtureReport({ stats });
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("postToSignal", () => {
  it("turns a competitor post into evidence with its real metrics, under the closest source id", () => {
    const signal = postToSignal(report, fixtureCreator.posts[1]);
    expect(signal).toMatchObject({
      source: "tiktok_apify",
      platform: "tiktok",
      kind: "short_video",
      title: "3 erreurs qui vident ton compte chaque mois",
      text: "3 erreurs qui vident ton compte chaque mois. Enregistre pour plus tard 💸 #argent #budget",
      url: "https://www.tiktok.com/@budgetmalin/video/t2",
      author: "@budgetmalin",
      publishedAt: "2026-09-30T17:30:00Z",
      metrics: { views: 450_000, likes: 40_000, comments: 900, shares: 6_000, saves: 12_000, followers: 200_000, durationSec: 42 },
      tags: ["argent", "budget"],
      related: [],
    });
    expect(signal.id).toMatch(/^tiktok_apify:cmp-[0-9a-z]+$/);
    expect(postToSignal(report, fixtureCreator.posts[1]).id).toBe(signal.id);
  });

  it("maps every platform to an existing source id", () => {
    const sources = (["instagram", "tiktok", "youtube", "linkedin"] as const).map(
      (platform) => postToSignal({ ...report, data: { ...fixtureCreator, account: { ...fixtureCreator.account, platform } } }, fixtureCreator.posts[0]).source,
    );
    expect(sources).toEqual(["instagram_apify", "tiktok_apify", "youtube", "linkedin_apify"]);
  });

  it("falls back to the caption, then to a neutral label, when the post has no title", () => {
    expect(postToSignal(report, { ...fixtureCreator.posts[0], title: "", text: "Légende seule" }).title).toBe("Légende seule");
    expect(postToSignal(report, { ...fixtureCreator.posts[0], title: " ", text: undefined }).title).toBe("Publication de @budgetmalin");
  });

  it("leaves the follower count out when derived metrics are forbidden (YouTube)", () => {
    const restricted = { ...report, data: { ...fixtureCreator, ratiosAllowed: false } };
    expect(postToSignal(restricted, fixtureCreator.posts[1]).metrics).not.toHaveProperty("followers");
  });
});

describe("ideaToStudio", () => {
  const handoff = ideaToStudio(report, 0);

  it("uses the posts the idea is inspired by as real evidence, scored and flagged", () => {
    expect(handoff.signals.map((s) => s.url)).toEqual([
      "https://www.tiktok.com/@budgetmalin/video/t5",
      "https://www.tiktok.com/@budgetmalin/video/t2",
    ]);
    expect(handoff.signals.every((s) => s.strength > 0 && s.strength <= 100)).toBe(true);
    // Both are ≥ ×2 the creator's own median.
    expect(handoff.signals.every((s) => s.outlier)).toBe(true);
    expect(handoff.topic.signalIds).toEqual(handoff.signals.map((s) => s.id));
  });

  it("builds a custom angle from the idea", () => {
    expect(handoff.angle).toEqual({
      id: `${handoff.topic.id}-custom`,
      type: "custom",
      title: "Le vrai coût de tes abonnements étudiants",
      pitch: "Calcul en direct des abonnements d'un étudiant, avec le tableau à la fin. Format : Face caméra, 30–45 s, calcul à l'écran.",
      hook: "J'ai additionné tes abonnements. Assieds-toi.",
      whyItWorks: fixtureInsights.ideas[0].whyForYou,
    });
    expect(handoff.topic.angles).toEqual([handoff.angle]);
  });

  it("builds a durable topic that says where it comes from, with real numbers only", () => {
    const { topic } = handoff;
    expect(topic.id).toMatch(/^competitor-[0-9a-z]+$/);
    expect(topic.title).toBe("Le vrai coût de tes abonnements étudiants");
    expect(topic.summary).toBe(
      "Idée de vidéo issue de l'analyse concurrentielle de @budgetmalin (TikTok) : Calcul en direct des abonnements d'un étudiant, avec le tableau à la fin.",
    );
    expect(plain(topic.whyNow)).toBe(
      "Mécanique qui marche chez @budgetmalin : « POV : tu découvres ce que te coûte vraiment ton abonnement » (900 k vues, ×15,7 sa médiane) ; « 3 erreurs qui vident ton compte chaque mois » (450 k vues, ×7,8 sa médiane). " +
        "Ton audience étudiante n'est pas servie. Vues : destinataire évident du partage (le coloc). Abonnements : épisode 1 d'une série budget étudiant.",
    );
    expect(topic).toMatchObject({
      category: "Veille concurrentielle",
      platforms: ["tiktok"],
      keywords: ["argent", "abonnement", "budget"],
      lifespan: "durable",
      saturation: "moyenne",
      sensitivity: { level: "faible" },
    });
    expect(topic.scores.total).toBeGreaterThan(0);
  });

  it("produces a script request the API accepts and the script prompt can use", () => {
    const request = { ...fixtureRequest, topic: handoff.topic, signals: handoff.signals, angle: handoff.angle };
    const parsed = scriptRequestSchema.safeParse(request);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
    const { user } = buildScriptPrompt(request, { playbook: PLAYBOOK, budget: 101, now: NOW });
    expect(user).toContain("[P1] TikTok · vidéo courte · « POV : tu découvres ce que te coûte vraiment ton abonnement » · par @budgetmalin");
    expect(user).toContain("Type : Angle personnalisé");
  });

  it("is stable for the same idea and distinct across ideas", () => {
    const two = fixtureReport({
      stats,
      insights: { ...fixtureInsights, ideas: [fixtureInsights.ideas[0], { ...fixtureInsights.ideas[0], title: "Autre idée", inspiredBy: [] }] },
    });
    expect(ideaToStudio(report, 0).topic.id).toBe(handoff.topic.id);
    const other = ideaToStudio(two, 1);
    expect(other.topic.id).not.toBe(handoff.topic.id);
    // No source post: no evidence rather than unrelated posts.
    expect(other.signals).toEqual([]);
    expect(other.topic.whyNow).toBe(`${fixtureInsights.ideas[0].whyForYou}`);
  });

  it("drops references to posts that are not in the report", () => {
    const ghost = fixtureReport({
      stats,
      insights: { ...fixtureInsights, ideas: [{ ...fixtureInsights.ideas[0], inspiredBy: ["inconnu", "t2", "t2"] }] },
    });
    expect(ideaToStudio(ghost, 0).signals.map((s) => s.url)).toEqual(["https://www.tiktok.com/@budgetmalin/video/t2"]);
  });

  it("states raw counts only when derived metrics are forbidden (YouTube)", () => {
    const restricted = fixtureReport({ stats, data: { ...fixtureCreator, ratiosAllowed: false } });
    expect(ideaToStudio(restricted, 0).topic.whyNow).not.toContain("×");
  });

  it("explains in French when the idea does not exist", () => {
    expect(() => ideaToStudio(report, 5)).toThrow(new RangeError("Idée introuvable dans cette analyse : relancez l'analyse du concurrent."));
    expect(() => ideaToStudio({ ...report, insights: undefined }, 0)).toThrow(RangeError);
  });
});
