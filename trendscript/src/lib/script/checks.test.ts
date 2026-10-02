import { describe, expect, it } from "vitest";
import type { ScriptBeat, ScriptDraft, ScriptSettings } from "../types";
import { fixtureDraft, fixtureSettings } from "./__fixtures__/script";
import { checkScript } from "./checks";
import { wordBudget } from "./metrics";

const BUDGET = wordBudget(fixtureSettings.durationSec, fixtureSettings.pace); // 101

function check(draft: Partial<ScriptDraft> = {}, settings: Partial<ScriptSettings> = {}, budget = BUDGET): string[] {
  return checkScript(fixtureDraft(draft), { ...fixtureSettings, ...settings }, budget);
}

const words = (n: number) => Array.from({ length: n }, () => "mot").join(" ");

function beat(startSec: number, endSec: number, overrides: Partial<ScriptBeat> = {}): ScriptBeat {
  return { startSec, endSec, label: `${startSec}-${endSec}`, voiceover: "", onScreenText: "", visual: "", editing: "", ...overrides };
}

describe("checkScript", () => {
  it("returns no warning for a well-formed draft", () => {
    expect(BUDGET).toBe(101);
    expect(check()).toEqual([]);
  });

  describe("hooks", () => {
    it("asks for exactly 3 variants", () => {
      const draft = fixtureDraft();
      expect(check({ hooks: draft.hooks.slice(0, 2) })).toContain(
        "2 variantes d'accroche au lieu de 3 : régénérez pour pouvoir comparer.",
      );
      expect(check({ hooks: draft.hooks.slice(0, 1) })[0]).toMatch(/^1 variante d'accroche au lieu de 3/);
    });

    it("flags on-screen hook text over 7 words, with its position and text", () => {
      const draft = fixtureDraft();
      const hooks = draft.hooks.map((hook, i) =>
        i === 1 ? { ...hook, onScreenText: "Ce que personne ne te dit sur ton réveil" } : hook,
      );
      const warnings = check({ hooks });
      expect(warnings).toEqual([
        "Accroche 2 : texte à l'écran de 9 mots (7 maximum pour être lu en 1 seconde) — raccourcissez « Ce que personne ne te dit sur ton réveil ».",
      ]);
    });

    it("accepts exactly 7 words", () => {
      const draft = fixtureDraft();
      const hooks = draft.hooks.map((hook) => ({ ...hook, onScreenText: "un deux trois quatre cinq six sept" }));
      expect(check({ hooks })).toEqual([]);
    });
  });

  describe("word budget", () => {
    it("flags a voice-over over budget + 10 %", () => {
      const [warning] = check({ fullScript: words(113) });
      expect(warning).toBe(
        "Voix off trop longue : 113 mots pour un budget de 101 (45 s) — coupez ou passez au débit « dynamique », sinon la vidéo dépassera la durée visée.",
      );
    });

    it("flags a voice-over under budget − 10 %", () => {
      expect(check({ fullScript: words(89) })[0]).toMatch(/^Voix off courte : 89 mots pour un budget de 101 \(45 s\)/);
    });

    it("accepts the ±10 % window edges", () => {
      expect(check({ fullScript: words(90) })).toEqual([]);
      expect(check({ fullScript: words(112) })).toEqual([]);
    });

    it("does not count stage directions", () => {
      expect(check({ fullScript: `[ZOOM] ${words(101)} [B-ROLL : horloge]` })).toEqual([]);
    });
  });

  describe("beats", () => {
    it("requires a timeline", () => {
      expect(check({ beats: [] })).toContain("Aucun découpage temporel : régénérez le script.");
    });

    it("reports a late start, gaps, overlaps, reversed beats and a wrong end in one warning", () => {
      const beats = [beat(1, 10), beat(12, 20), beat(18, 30), beat(30, 25, { label: "Payoff" }), beat(25, 35)];
      const warnings = check({ beats });
      expect(warnings).toEqual([
        "Découpage à revoir : le premier temps commence à 1 s ; trou ou chevauchement entre 10 s et 12 s ; trou ou chevauchement entre 20 s et 18 s ; le temps « Payoff » finit avant de commencer ; la timeline se termine à 35 s pour une durée visée de 45 s.",
      ]);
    });

    it("tolerates half-second rounding between beats", () => {
      const beats = [beat(0, 3.2), beat(3.5, 20), beat(20, 45)];
      expect(check({ beats })).toEqual([]);
    });

    it("tolerates an end within max(2 s, 10 %) of the target duration", () => {
      expect(check({ beats: [beat(0, 20), beat(20, 41)] })).toEqual([]); // 45 s ± 4.5
      expect(check({ beats: [beat(0, 20), beat(20, 40)] })[0]).toContain("se termine à 40 s");
      expect(check({ beats: [beat(0, 13)], fullScript: words(34) }, { durationSec: 15 }, 34)).toEqual([]); // 15 s ± 2
      expect(check({ beats: [beat(0, 12)], fullScript: words(34) }, { durationSec: 15 }, 34)[0]).toContain("se termine à 12 s");
    });
  });

  describe("Instagram", () => {
    it("caps hashtags at 5", () => {
      const hashtags = ["#a", "#b", "#c", "#d", "#e", "#f"];
      expect(check({ hashtags })).toEqual(["Instagram limite à 5 hashtags (6 proposés) : gardez les 5 plus précis."]);
      expect(check({ hashtags: hashtags.slice(0, 5) })).toEqual([]);
    });

    it("warns that a comment-keyword CTA can be classified as engagement bait", () => {
      expect(check({}, { cta: "comment_keyword" })[0]).toMatch(/^CTA « commente un mot-clé » sur Instagram/);
      expect(check({}, { cta: "comment_keyword", platform: "tiktok" })).toEqual([]);
    });

    it("limits caption + hashtags to 2 200 characters", () => {
      const hashtags = ["#abc", "#def"]; // 2 × (4 + 1) = 10
      expect(check({ caption: "x".repeat(2190), hashtags })).toEqual([]);
      expect(check({ caption: "x".repeat(2191), hashtags })).toEqual([
        "Légende + hashtags : 2201 caractères pour une limite de 2200.",
      ]);
    });
  });

  describe("TikTok", () => {
    it("recommends 3 to 5 hashtags, and says nothing when there are none", () => {
      const tiktok = { platform: "tiktok" as const };
      expect(check({ hashtags: ["#a", "#b"] }, tiktok)).toEqual(["TikTok : 3 à 5 hashtags précis recommandés (2 proposés)."]);
      expect(check({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] }, tiktok)[0]).toContain("(6 proposés)");
      expect(check({ hashtags: ["#a", "#b", "#c", "#d"] }, tiktok)).toEqual([]);
      expect(check({ hashtags: [] }, tiktok)).toEqual([]);
    });

    it("allows a 4 000-character caption", () => {
      const tiktok = { platform: "tiktok" as const };
      expect(check({ caption: "x".repeat(3900), hashtags: ["#a", "#b", "#c"] }, tiktok)).toEqual([]);
      expect(check({ caption: "x".repeat(4000), hashtags: ["#a", "#b", "#c"] }, tiktok)[0]).toMatch(/limite de 4000\.$/);
    });
  });

  describe("YouTube Shorts", () => {
    const youtube = { platform: "youtube_shorts" as const };

    it("recommends 1 to 3 hashtags and warns that over 60 they are all ignored", () => {
      expect(check({ hashtags: ["#a", "#b", "#c"] }, youtube)).toEqual([]);
      expect(check({ hashtags: ["#a", "#b", "#c", "#d"] }, youtube)).toEqual([
        "YouTube Shorts : 1 à 3 hashtags recommandés (4 proposés).",
      ]);
      const many = Array.from({ length: 61 }, (_, i) => `#t${i}`);
      expect(check({ hashtags: many }, youtube)).toEqual(["YouTube ignore tous les hashtags au-delà de 60 (61 proposés)."]);
    });

    it("limits the title to 100 characters", () => {
      expect(check({ title: "t".repeat(100) }, youtube)).toEqual([]);
      expect(check({ title: "t".repeat(101) }, youtube)).toEqual([
        "Titre YouTube de 101 caractères : 100 maximum, mot-clé au début.",
      ]);
    });

    it("reminds the Content ID rule for Shorts over 60 s, louder when music or clips are planned", () => {
      const ninety = { ...youtube, durationSec: 90 as const };
      const base = { fullScript: words(203), beats: [beat(0, 45), beat(45, 90)] };
      expect(check(base, ninety, 203)).toEqual([
        "Short de plus d'1 min : n'ajoutez aucune musique ni extrait protégé (une réclamation Content ID bloquerait la vidéo partout).",
      ]);
      const withMusic = { ...base, beats: [beat(0, 45, { editing: "[SFX] Musique tendance en fond" }), beat(45, 90)] };
      expect(check(withMusic, ninety, 203)[0]).toMatch(/^Short de plus d'1 min avec musique ou extrait tiers/);
    });

    it("does not apply YouTube rules to other platforms", () => {
      expect(check({ title: "t".repeat(150) })).toEqual([]);
    });
  });

  describe("compliance", () => {
    it("requires the legal mention on a paid partnership", () => {
      expect(check({}, { sponsored: true })[0]).toMatch(/^Partenariat rémunéré : ajoutez « Publicité »/);
      expect(check({ caption: "Publicité — avec MaMarque. Le reste." }, { sponsored: true })).toEqual([]);
      expect(check({ caption: "COLLABORATION COMMERCIALE avec MaMarque" }, { sponsored: true })).toEqual([]);
      expect(check({ caption: "publicite" }, { sponsored: true })).toEqual([]);
    });

    it("reminds the AI label when realistic AI visuals are used", () => {
      expect(check({}, { aiVisuals: true })[0]).toMatch(/^Visuels IA réalistes : activez l'étiquette IA/);
    });

    it.each([
      "Like si toi aussi tu dors mal.",
      "Tague 3 amis qui ratent leur réveil.",
      "Identifie 2 potes.",
      "Commente un emoji si t'es team été.",
    ])("flags mechanical engagement bait: %s", (cta) => {
      expect(check({ cta })).toEqual([
        "Appel à l'engagement mécanique détecté (« like si », « tague… ») : les plateformes le pénalisent, reformulez le CTA.",
      ]);
    });

    it("also looks for engagement bait in the voice-over", () => {
      expect(check({ fullScript: `${words(97)} Like si t'es d'accord` })).toHaveLength(1);
    });

    it("does not flag an open question or a targeted share", () => {
      expect(check({ cta: "Toi, tu garderais quelle heure ? Envoie ça à ton coloc." })).toEqual([]);
    });
  });

  describe("facts", () => {
    const sourced = { claim: "a", sourceUrl: "https://example.fr/a", confidence: "haute" as const };
    const unsourced = { claim: "b", sourceUrl: null, confidence: "faible" as const };

    it("counts claims without a source", () => {
      expect(check({ factsToVerify: [sourced, unsourced, { ...unsourced, claim: "c" }] })).toEqual([
        "2 affirmations sans source : vérifiez-les avant de publier.",
      ]);
      expect(check({ factsToVerify: [unsourced] })).toEqual(["1 affirmation sans source : vérifiez-les avant de publier."]);
    });

    it("counts low-confidence claims separately when they are not just the unsourced ones", () => {
      const weakButSourced = { ...sourced, confidence: "faible" as const };
      expect(check({ factsToVerify: [weakButSourced] })).toEqual([
        "1 affirmation à confiance faible dans la liste des faits à vérifier.",
      ]);
    });

    it("still reports a weak sourced claim when the number of unsourced claims happens to be the same", () => {
      const unsourcedMedium = { ...unsourced, confidence: "moyenne" as const };
      const weakButSourced = { ...sourced, claim: "d", confidence: "faible" as const };
      expect(check({ factsToVerify: [unsourcedMedium, weakButSourced] })).toEqual([
        "1 affirmation sans source : vérifiez-les avant de publier.",
        "1 affirmation à confiance faible dans la liste des faits à vérifier.",
      ]);
    });

    it("does not report unsourced weak claims twice", () => {
      expect(check({ factsToVerify: [unsourced, unsourced, { ...sourced, confidence: "faible" }] })).toEqual([
        "2 affirmations sans source : vérifiez-les avant de publier.",
        "1 affirmation à confiance faible dans la liste des faits à vérifier.",
      ]);
    });

    it("counts {À VÉRIFIER : …} placeholders left in the voice-over, accents optional", () => {
      const fullScript = `${words(98)} {À VÉRIFIER : date} {a verifier : chiffre} {A VÉRIFIER: lieu}`;
      expect(check({ fullScript })).toEqual(["3 éléments « {À VÉRIFIER : …} » à compléter avant le tournage."]);
    });
  });

  describe("pedagogy vs. duration", () => {
    it("suggests a series when pedagogy is too high for the duration", () => {
      const short = { beats: [beat(0, 15)], fullScript: words(34) };
      expect(check(short, { pedagogy: 60, durationSec: 15 }, 34)).toEqual([
        "Pédagogie élevée pour 15 s : envisagez une série (partie 1, partie 2) ou une durée plus longue.",
      ]);
      const thirty = { beats: [beat(0, 30)], fullScript: words(68) };
      expect(check(thirty, { pedagogy: 80, durationSec: 30 }, 68)).toHaveLength(1);
      expect(check(thirty, { pedagogy: 79, durationSec: 30 }, 68)).toEqual([]);
      expect(check({}, { pedagogy: 100, durationSec: 45 })).toEqual([]);
    });
  });
});
