import { describe, expect, it } from "vitest";
import { SCORE_EXPLANATION } from "@/lib/analysis/scoring";
import { parseScoreItems, parseScoreWeights } from "./score-explanation";

describe("parseScoreItems", () => {
  it("splits each sentence into a label and a capitalised text", () => {
    expect(parseScoreItems(["Portée : force des 3 meilleurs signaux."])).toEqual([
      { label: "Portée", text: "Force des 3 meilleurs signaux." },
    ]);
    expect(parseScoreItems(["Sans séparateur."])).toEqual([{ label: "", text: "Sans séparateur." }]);
  });
});

describe("parseScoreWeights", () => {
  it("reads both weightings from the total-score sentence", () => {
    expect(
      parseScoreWeights(
        "25 % momentum, 20 % portée, 15 % multi-plateforme, 10 % fraîcheur, 30 % pertinence niche (sans niche : 35/30/20/15).",
      ),
    ).toEqual([
      { label: "momentum", withNiche: 25, withoutNiche: 35 },
      { label: "portée", withNiche: 20, withoutNiche: 30 },
      { label: "multi-plateforme", withNiche: 15, withoutNiche: 20 },
      { label: "fraîcheur", withNiche: 10, withoutNiche: 15 },
      { label: "pertinence niche", withNiche: 30, withoutNiche: 0 },
    ]);
  });

  it("returns nothing when the sentence doesn't add up", () => {
    expect(parseScoreWeights("Moyenne pondérée des composantes.")).toEqual([]);
    expect(parseScoreWeights("50 % momentum, 20 % portée")).toEqual([]);
  });

  it("parses the real SCORE_EXPLANATION (keeps the Réglages page in sync with the formula)", () => {
    const total = parseScoreItems(SCORE_EXPLANATION).find((item) => item.label === "Score total");
    expect(total).toBeDefined();
    const weights = parseScoreWeights(total?.text ?? "");
    expect(weights).toHaveLength(5);
    expect(weights.reduce((sum, weight) => sum + (weight.withoutNiche ?? 0), 0)).toBe(100);
  });
});
