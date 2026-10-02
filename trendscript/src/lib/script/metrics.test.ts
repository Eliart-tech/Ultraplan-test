import { describe, expect, it } from "vitest";
import { budgetRange, countWords, estimateDuration, wordBudget, wordsPerSecond } from "./metrics";

describe("countWords", () => {
  it("counts plain words separated by any whitespace", () => {
    expect(countWords("Ton réveil va te mentir dimanche.")).toBe(6);
    expect(countWords("  un\tdeux\n\ntrois  ")).toBe(3);
  });

  it("returns 0 for empty or blank text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
  });

  it("keeps elisions and hyphenated words as one word (documented convention)", () => {
    expect(countWords("l'IA")).toBe(1);
    expect(countWords("j'ai vu qu'on change aujourd'hui")).toBe(5);
    expect(countWords("c'est-à-dire peut-être")).toBe(2);
    // Typographic apostrophe behaves like the ASCII one.
    expect(countWords("l’heure d’été")).toBe(2);
  });

  it("ignores stage directions in square brackets", () => {
    expect(countWords("[ZOOM] Regarde ça [B-ROLL : une horloge qui tourne] maintenant")).toBe(3);
  });

  it("counts a {À VÉRIFIER : …} placeholder as one word", () => {
    expect(countWords("Ça coûte {À VÉRIFIER : le prix exact en euros} par an")).toBe(5);
  });

  it("ignores tokens without letters or digits (emojis, dashes, ellipses)", () => {
    expect(countWords("Attends — 🔥 … voilà !")).toBe(2);
  });

  it("counts numbers as words", () => {
    expect(countWords("Le 25 octobre à 3 h")).toBe(6);
  });
});

describe("wordsPerSecond", () => {
  it("uses the playbook rates", () => {
    expect(wordsPerSecond("pose")).toBe(2.2);
    expect(wordsPerSecond("normal")).toBe(2.5);
    expect(wordsPerSecond("dynamique")).toBe(2.8);
  });
});

describe("wordBudget", () => {
  it("matches the playbook §0 table for every duration and pace", () => {
    const table: Record<number, [number, number, number]> = {
      15: [30, 34, 38],
      30: [59, 68, 76],
      45: [89, 101, 113],
      60: [119, 135, 151],
      90: [178, 203, 227],
    };
    for (const [duration, [pose, normal, dynamique]] of Object.entries(table)) {
      const d = Number(duration);
      expect(wordBudget(d, "pose"), `${d} s posé`).toBe(pose);
      expect(wordBudget(d, "normal"), `${d} s normal`).toBe(normal);
      expect(wordBudget(d, "dynamique"), `${d} s dynamique`).toBe(dynamique);
    }
  });
});

describe("estimateDuration", () => {
  it("is the inverse of wordBudget: a script on budget lasts its target duration", () => {
    for (const duration of [15, 30, 45, 60, 90]) {
      for (const pace of ["pose", "normal", "dynamique"] as const) {
        expect(estimateDuration(wordBudget(duration, pace), pace), `${duration} s ${pace}`).toBe(duration);
      }
    }
  });

  it("returns 0 for no words", () => {
    expect(estimateDuration(0, "normal")).toBe(0);
    expect(estimateDuration(-3, "normal")).toBe(0);
  });

  it("grows with the word count and shrinks with the pace", () => {
    expect(estimateDuration(150, "normal")).toBeGreaterThan(estimateDuration(100, "normal"));
    expect(estimateDuration(100, "dynamique")).toBeLessThan(estimateDuration(100, "pose"));
  });
});

describe("budgetRange", () => {
  it("accepts ±10 % around the budget", () => {
    expect(budgetRange(101)).toEqual({ min: 90, max: 112 });
    expect(budgetRange(34)).toEqual({ min: 30, max: 38 });
  });

  it("is exact on round budgets (no floating-point widening)", () => {
    // 100 × 1.1 = 110.00000000000001 in floating point: the window must still stop at 110.
    expect(budgetRange(100)).toEqual({ min: 90, max: 110 });
    expect(budgetRange(50)).toEqual({ min: 45, max: 55 });
    expect(budgetRange(0)).toEqual({ min: 0, max: 0 });
  });
});
