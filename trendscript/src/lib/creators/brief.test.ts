import { describe, expect, it } from "vitest";
import { scriptRequestSchema } from "../schemas";
import { fixtureRequest } from "../script/__fixtures__/script";
import { fixtureCreator, fixtureInsights, fixtureReport, NOW } from "./__fixtures__/creator";
import { toCompetitorBrief } from "./brief";
import { computeCreatorStats } from "./stats";

const stats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });
const plain = (value: string) => value.replace(/[  ]/g, " ");

function acceptedBySchema(brief: ReturnType<typeof toCompetitorBrief>) {
  const parsed = scriptRequestSchema.safeParse({ ...fixtureRequest, competitors: [brief] });
  return { ok: parsed.success, issues: parsed.error?.issues.slice(0, 3) };
}

describe("toCompetitorBrief — AI report", () => {
  const brief = toCompetitorBrief(fixtureReport({ stats }));

  it("carries the identity, the median and the recent titles (newest first)", () => {
    expect(brief.platform).toBe("tiktok");
    expect(brief.handle).toBe("budgetmalin");
    expect(brief.medianViews).toBe(57_500);
    expect(brief.recentTitles.slice(0, 2)).toEqual(["Tu paies encore des frais bancaires ?", "3 erreurs qui vident ton compte chaque mois"]);
    expect(brief.recentTitles).toHaveLength(10);
  });

  it("summarises Claude's insights for the script prompt", () => {
    expect(brief.positioning).toBe(
      "Vulgarisation budget pour jeunes actifs, promesse : économiser sans se priver. Audience : Jeunes actifs urbains (déduction d'après les sujets). Ton : Tutoiement, rythme rapide, POV et listes.",
    );
    expect(brief.pillars[0]).toBe("Dépenses cachées — 3 publications sur 10 (30 %) — médiane 450 k vues (×7,8 la médiane du compte)");
    expect(brief.hookPatterns).toEqual(["Liste d'erreurs + conséquence chiffrée — ex. « 3 erreurs qui vident ton compte »"]);
    expect(brief.overused).toEqual([
      "Format récurrent : POV face caméra — Mise en situation en 25 s.",
      "Signature à ne pas reprendre : Sa série « Épisode N » de règles budgétaires",
    ]);
    expect(brief.gaps).toEqual([
      "Budget des étudiants — Jamais traité alors que l'audience est jeune.",
      "Pour te différencier : Cible les étudiants — Montre de vrais budgets à 800 € par mois.",
    ]);
    expect(brief.followDrivers).toEqual(["Probablement la série numérotée (Épisode 3) qui donne une raison de revenir."]);
  });

  it("is accepted by the script request schema", () => {
    expect(acceptedBySchema(brief)).toEqual({ ok: true, issues: undefined });
  });

  it("caps and clips every list to the schema limits", () => {
    const long = "x".repeat(500);
    const many = Array.from({ length: 20 }, (_, i) => ({ opportunity: `${i} ${long}`, why: "w" }));
    const report = fixtureReport({
      stats,
      insights: { ...fixtureInsights, gaps: many, positioning: "p".repeat(2000), doNotCopy: Array.from({ length: 20 }, (_, i) => `d${i}`) },
      data: { ...fixtureCreator, posts: Array.from({ length: 30 }, (_, i) => ({ ...fixtureCreator.posts[0], id: `x${i}`, title: `Titre ${i} ${long}` })) },
    });
    const capped = toCompetitorBrief(report);
    expect(capped.gaps).toHaveLength(10);
    expect(capped.overused).toHaveLength(10);
    expect(capped.recentTitles).toHaveLength(15);
    expect(capped.gaps.every((g) => g.length <= 300)).toBe(true);
    expect(capped.positioning.length).toBeLessThanOrEqual(1000);
    expect(acceptedBySchema(capped).ok).toBe(true);
  });

  it("skips empty titles and duplicates", () => {
    const posts = [
      { ...fixtureCreator.posts[0], id: "a", title: "  " },
      { ...fixtureCreator.posts[0], id: "b", title: "Même titre" },
      { ...fixtureCreator.posts[0], id: "c", title: "même  titre" },
    ];
    expect(toCompetitorBrief(fixtureReport({ stats, data: { ...fixtureCreator, posts } })).recentTitles).toEqual(["Même titre"]);
  });
});

describe("toCompetitorBrief — stats mode (Claude unavailable)", () => {
  const brief = toCompetitorBrief(fixtureReport({ stats, mode: "stats", insights: undefined, model: undefined }));

  it("builds the positioning from the real bio and hashtags", () => {
    expect(plain(brief.positioning)).toBe(
      "Budget Malin (@budgetmalin) — TikTok, 200 k abonnés. Bio : « Je t'apprends à gérer ton argent sans te prendre la tête 💸 ». Hashtags les plus utilisés : #argent, #budget, #epargne, #abonnement, #paris, #crypto.",
    );
    expect(brief.pillars.slice(0, 2)).toEqual(["#argent (6 publications)", "#budget (4 publications)"]);
  });

  it("uses the over-performing titles as hooks not to reuse, and reach beyond followers as follow hints", () => {
    expect(brief.hookPatterns).toEqual([
      "Accroche d'une publication à ×34,8 sa médiane : « Comment j'ai économisé 10 000 € en un an »",
      "Accroche d'une publication à ×15,7 sa médiane : « POV : tu découvres ce que te coûte vraiment ton abonnement »",
      "Accroche d'une publication à ×7,8 sa médiane : « 3 erreurs qui vident ton compte chaque mois »",
    ]);
    expect(brief.followDrivers).toEqual([
      "Portée au-delà de ses abonnés (vues = ×10 ses abonnés) : « Comment j'ai économisé 10 000 € en un an »",
      "Portée au-delà de ses abonnés (vues = ×4,5 ses abonnés) : « POV : tu découvres ce que te coûte vraiment ton abonnement »",
      "Portée au-delà de ses abonnés (vues = ×2,3 ses abonnés) : « 3 erreurs qui vident ton compte chaque mois »",
    ]);
    expect(brief.overused).toEqual([]);
    expect(brief.gaps).toEqual([]);
    expect(acceptedBySchema(brief).ok).toBe(true);
  });

  it("states no ratio when the source's terms forbid derived metrics (YouTube)", () => {
    const data = { ...fixtureCreator, ratiosAllowed: false };
    const restricted = computeCreatorStats(data, { now: NOW, timeZone: "Europe/Paris" });
    const youtube = toCompetitorBrief(fixtureReport({ stats: restricted, data, mode: "stats", insights: undefined }));
    expect(youtube.hookPatterns[0]).toBe("Accroche d'une de ses publications les plus vues : « Comment j'ai économisé 10 000 € en un an »");
    expect(youtube.followDrivers).toBeUndefined();
    expect(youtube.hookPatterns.join(" ")).not.toContain("×");
  });
});
