import { describe, expect, it } from "vitest";
import { fixtureDraft } from "@/lib/script/__fixtures__/script";
import { countWords } from "@/lib/script/metrics";
import type { GeneratedScript } from "@/lib/types";
import { applyHook, replaceLoose } from "./apply-hook";

function generated(): GeneratedScript {
  const draft = fixtureDraft();
  const wordCount = countWords(draft.fullScript);
  return {
    ...draft,
    id: "script-1",
    createdAt: "2026-10-02T15:00:00Z",
    model: "claude-opus-5-5",
    wordCount,
    wordBudget: 101,
    estimatedDurationSec: 45,
    warnings: [],
  };
}

describe("replaceLoose", () => {
  it("replaces the first occurrence, tolerating whitespace differences", () => {
    expect(replaceLoose("Bonjour   à\ntous. Bonjour à tous.", "Bonjour à tous.", "Salut.")).toBe("Salut. Bonjour à tous.");
  });

  it("returns null when the text is absent or the search is empty", () => {
    expect(replaceLoose("Bonjour", "Au revoir", "x")).toBeNull();
    expect(replaceLoose("Bonjour", "   ", "x")).toBeNull();
  });

  it("treats regex characters literally", () => {
    expect(replaceLoose("Prix (2026) ? 3 $.", "(2026) ? 3 $", "X")).toBe("Prix X.");
  });
});

describe("applyHook", () => {
  it("returns the same script for index 0 or an out-of-range index", () => {
    const script = generated();
    expect(applyHook(script, 0)).toBe(script);
    expect(applyHook(script, 3)).toBe(script);
    expect(applyHook(script, -1)).toBe(script);
    expect(applyHook(script, 1.5)).toBe(script);
  });

  it("swaps the first beat, the start of fullScript and reorders the hooks", () => {
    const script = generated();
    const next = applyHook(script, 2);

    expect(next.hooks.map((hook) => hook.style)).toEqual(["Liste", "Contre-intuitif", "Question"]);
    expect(next.beats[0].voiceover.startsWith("3 réglages à faire samedi soir.")).toBe(true);
    expect(next.beats[0].voiceover).not.toContain("Ton réveil va te mentir dimanche.");
    expect(next.beats[0].onScreenText).toBe("3 réglages avant dimanche");
    expect(next.fullScript.startsWith("3 réglages à faire samedi soir.")).toBe(true);
    expect(next.fullScript).not.toContain("Ton réveil va te mentir");
    // Everything after the opening is untouched.
    expect(next.beats.slice(1)).toEqual(script.beats.slice(1));
    expect(next.fullScript.split("\n").slice(1)).toEqual(script.fullScript.split("\n").slice(1));
    expect(next.title).toBe(script.title);
  });

  it("does not mutate the input", () => {
    const script = generated();
    const snapshot = JSON.parse(JSON.stringify(script));
    applyHook(script, 1);
    expect(script).toEqual(snapshot);
  });

  it("recomputes the word count and scales the estimated duration", () => {
    const script = generated();
    const next = applyHook(script, 1);
    const expectedWords = countWords(next.fullScript);
    expect(next.wordCount).toBe(expectedWords);
    expect(next.wordCount).toBe(script.wordCount + 3); // 9-word question vs 6-word statement
    expect(next.estimatedDurationSec).toBe(Math.round((45 * expectedWords) / script.wordCount));
    expect(next.wordBudget).toBe(script.wordBudget);
  });

  it("swaps the visual only when the first beat used the old hook's visual", () => {
    const base = generated();
    const script = {
      ...base,
      beats: [{ ...base.beats[0], visual: "main qui attrape le téléphone, gros plan" }, ...base.beats.slice(1)],
    };
    expect(applyHook(script, 1).beats[0].visual).toBe("réveil, gros plan");
    expect(applyHook(base, 1).beats[0].visual).toBe("plan serré");
  });

  it("falls back gracefully when the model paraphrased the hook", () => {
    const base = generated();
    const paraphrased = "Dimanche, ton réveil va mentir.";
    const script = {
      ...base,
      beats: [{ ...base.beats[0], voiceover: paraphrased, onScreenText: "Réveil menteur" }, ...base.beats.slice(1)],
      fullScript: `${paraphrased}\n${base.beats.slice(1).map((beat) => beat.voiceover).join("\n")}`,
    };
    const next = applyHook(script, 1);
    expect(next.beats[0].voiceover).toBe("Tu sais à quelle heure tu te lèves lundi ?");
    expect(next.beats[0].onScreenText).toBe("Lundi, tu te lèves quand ?");
    expect(next.fullScript.startsWith("Tu sais à quelle heure tu te lèves lundi ?\n")).toBe(true);
    expect(next.fullScript).not.toContain(paraphrased);
  });

  it("prepends the new hook when the opening cannot be located", () => {
    const base = generated();
    const longOpening = `Il était une fois ${"un très long début ".repeat(10)}sans ponctuation`;
    const script = {
      ...base,
      beats: [{ ...base.beats[0], voiceover: "autre chose" }, ...base.beats.slice(1)],
      fullScript: longOpening,
    };
    const next = applyHook(script, 2);
    expect(next.fullScript).toBe(`3 réglages à faire samedi soir.\n\n${longOpening}`);
  });

  it("works on a plain draft without metadata", () => {
    const draft = fixtureDraft();
    const next = applyHook(draft, 1);
    expect(next.hooks[0].style).toBe("Question");
    expect("wordCount" in next).toBe(false);
  });

  it("re-applying from the original gives the same result as a direct swap", () => {
    const script = generated();
    const viaOne = applyHook(script, 1);
    const direct = applyHook(script, 1);
    expect(viaOne).toEqual(direct);
    // Back to hook 0 = the original script.
    expect(applyHook(script, 0)).toEqual(script);
  });
});
