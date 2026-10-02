import { describe, expect, it } from "vitest";
import { detectSensitivity } from "./sensitivity";

describe("detectSensitivity", () => {
  it("flags a sensitive term in the title", () => {
    expect(detectSensitivity("Attentat à Nice").level).toBe("elevee");
  });

  it("does not hide a finance topic over a lone mention in one article", () => {
    const result = detectSensitivity("Livret A", [
      "Livret A, assurance-vie : l'État veut prélever l'argent oublié après un décès",
      "Financer le nucléaire par le Livret A, une fausse bonne idée ?",
      "Compte courant rémunéré, Livret A, PEA : comment choisir",
      "Le gouvernement veut ponctionner l'épargne oubliée",
    ]);
    expect(result.level).toBe("moyenne");
    expect(result.reason).toMatch(/Mention ponctuelle/);
  });

  it("escalates when several sources talk about deaths", () => {
    const result = detectSensitivity("Christa Pike", [
      "Condamnée à mort, son exécution échoue à deux reprises",
      "Christa Pike : son exécution ratée ravive le débat sur la peine de mort",
    ]);
    expect(result).toEqual({ level: "elevee", reason: "Sujet sensible : décès / violence." });
  });

  it("only treats recurring election vocabulary as political", () => {
    expect(detectSensitivity("Budget 2027", ["Le gouvernement présente son budget"]).level).toBe("faible");
    expect(
      detectSensitivity("Sénatoriales", ["Les candidats aux élections sénatoriales", "Résultats des élections"]).reason,
    ).toBe("À traiter avec prudence : politique.");
  });
});
