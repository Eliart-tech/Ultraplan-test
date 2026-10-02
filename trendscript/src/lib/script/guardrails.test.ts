import { describe, expect, it } from "vitest";
import type { Level3, ScriptSettings, Topic } from "../types";
import { fixtureSettings, fixtureTopic } from "./__fixtures__/script";
import { applyGuardrails, MAX_SENSITIVE_VIRALITY, topicRisk } from "./guardrails";

function topicWith(level: Level3, reason: string): Topic {
  return { ...fixtureTopic, sensitivity: { level, reason } };
}

function settingsWith(overrides: Partial<ScriptSettings>): ScriptSettings {
  return { ...fixtureSettings, ...overrides };
}

describe("topicRisk", () => {
  it("is green for a low-sensitivity topic", () => {
    expect(topicRisk(fixtureTopic)).toBe("vert");
  });

  it("is strict orange for any 'elevee' topic, whatever the reason", () => {
    expect(topicRisk(topicWith("elevee", "Sujet sensible : décès / violence."))).toBe("orange_strict");
    expect(topicRisk(topicWith("elevee", ""))).toBe("orange_strict");
  });

  it.each([
    "À traiter avec prudence : politique.",
    "À traiter avec prudence : affaire judiciaire (présomption d'innocence).",
    "À traiter avec prudence : santé (risque de désinformation).",
    "À traiter avec prudence : sujet clivant.",
    "Procès en cours : présomption d'innocence",
    "Élections municipales : pas de pronostic présenté comme un fait",
    "Campagne de vaccination, sources institutionnelles uniquement",
    "Enquête judiciaire en cours",
    "Débat sur l'immigration",
    "Réélection contestée du maire",
    "Les électeurs appelés aux urnes dimanche",
    "Loi électorale : pas de sondage la veille",
  ])("is orange for a 'moyenne' topic with a political / judicial / health / divisive reason: %s", (reason) => {
    expect(topicRisk(topicWith("moyenne", reason))).toBe("orange");
  });

  it.each([
    "À traiter avec prudence : finance (pas de conseil personnalisé).",
    "Brand safety : alcool",
    // "électricité" / "processeur" contain "elect" / "proces" but are not elections or trials.
    "Sujet économique : hausse du prix de l'électricité, éviter le ton anxiogène",
    "Voitures électriques : sujet de consommation",
    "Nouveau processeur : risque de rumeurs non confirmées",
    "Sélection des Bleus : rumeurs de transfert",
  ])("stays green for a 'moyenne' topic without an orange reason: %s", (reason) => {
    expect(topicRisk(topicWith("moyenne", reason))).toBe("vert");
  });

  it("matches reasons without accents and in any case", () => {
    expect(topicRisk(topicWith("moyenne", "SANTE PUBLIQUE"))).toBe("orange");
    expect(topicRisk(topicWith("moyenne", "election presidentielle"))).toBe("orange");
  });
});

describe("applyGuardrails", () => {
  it("leaves a green topic untouched, without notices", () => {
    const settings = settingsWith({ virality: 95, tone: "provocateur", hookStyle: "pov", cta: "comment_keyword" });
    const result = applyGuardrails(fixtureTopic, settings);
    expect(result.settings).toEqual(settings);
    expect(result.notices).toEqual([]);
  });

  it("never mutates the settings it receives", () => {
    const settings = settingsWith({ virality: 90, tone: "humoristique" });
    const copy = structuredClone(settings);
    applyGuardrails(topicWith("elevee", "Sujet sensible : décès / violence."), settings);
    expect(settings).toEqual(copy);
  });

  it("adds a general-information notice on a 'moyenne' finance topic, without capping", () => {
    const settings = settingsWith({ virality: 90 });
    const result = applyGuardrails(topicWith("moyenne", "À traiter avec prudence : finance (pas de conseil personnalisé)."), settings);
    expect(result.settings.virality).toBe(90);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toContain("Sujet financier");
  });

  describe("orange topic", () => {
    const topic = topicWith("moyenne", "À traiter avec prudence : politique.");

    it(`caps virality at ${MAX_SENSITIVE_VIRALITY} and explains why with the short reason`, () => {
      const result = applyGuardrails(topic, settingsWith({ virality: 85.6 }));
      expect(result.settings.virality).toBe(39);
      expect(result.notices[0]).toBe(
        "Sujet sensible (politique) : viralité plafonnée à 39 (au lieu de 86) pour que la forme ne déforme pas les faits.",
      );
    });

    it("keeps a virality already under the cap", () => {
      const result = applyGuardrails(topic, settingsWith({ virality: 30 }));
      expect(result.settings.virality).toBe(30);
      expect(result.notices.some((n) => n.includes("plafonnée"))).toBe(false);
    });

    it.each(["humoristique", "provocateur"] as const)("replaces the %s tone with journalistique", (tone) => {
      const result = applyGuardrails(topic, settingsWith({ tone, virality: 20 }));
      expect(result.settings.tone).toBe("journalistique");
      expect(result.notices.some((n) => n.startsWith("Ton « ") && n.includes("« Journalistique »"))).toBe(true);
    });

    it("keeps an allowed tone", () => {
      expect(applyGuardrails(topic, settingsWith({ tone: "expert" })).settings.tone).toBe("expert");
    });

    it("keeps hook style, CTA and sponsorship (strict rules only apply to drama)", () => {
      const settings = settingsWith({ hookStyle: "pov", cta: "comment_keyword", sponsored: true });
      const result = applyGuardrails(topic, settings);
      expect(result.settings.hookStyle).toBe("pov");
      expect(result.settings.cta).toBe("comment_keyword");
      expect(result.notices.some((n) => n.includes("Partenariat"))).toBe(false);
    });

    it("always announces the « ce qu'on sait / ce qu'on ignore » passage", () => {
      const result = applyGuardrails(topic, settingsWith({ virality: 10, tone: "expert" }));
      expect(result.notices).toContain(
        "Le script inclut un passage « ce qu'on sait / ce qu'on ignore » et attribue chaque fait à sa source.",
      );
    });

    it("warns about reduced Instagram reach on political topics only", () => {
      const onInstagram = applyGuardrails(topic, settingsWith({ platform: "instagram_reels" }));
      expect(onInstagram.notices.at(-1)).toContain("Instagram ne recommande pas par défaut le contenu politique");

      const onTikTok = applyGuardrails(topic, settingsWith({ platform: "tiktok" }));
      expect(onTikTok.notices.some((n) => n.includes("Instagram ne recommande pas"))).toBe(false);

      const health = applyGuardrails(topicWith("moyenne", "Santé : information générale"), settingsWith({ platform: "instagram_reels" }));
      expect(health.notices.some((n) => n.includes("Instagram ne recommande pas"))).toBe(false);
    });

    it("labels the notice without a reason when the reason is only a prefix", () => {
      const result = applyGuardrails(topicWith("elevee", "Sujet sensible :"), settingsWith({ virality: 50 }));
      expect(result.notices[0]).toMatch(/^Sujet sensible : viralité plafonnée/);
    });
  });

  describe("strict orange topic (drama)", () => {
    const topic = topicWith("elevee", "Sujet sensible : drame / catastrophe.");

    it.each(["chiffre_choc", "polemique_mesuree", "pov"] as const)("replaces the %s hook by a factual one chosen by Claude", (hookStyle) => {
      const result = applyGuardrails(topic, settingsWith({ hookStyle }));
      expect(result.settings.hookStyle).toBe("auto");
      expect(result.notices.some((n) => n.includes("remplacée par une accroche factuelle"))).toBe(true);
    });

    it("keeps a neutral hook style", () => {
      expect(applyGuardrails(topic, settingsWith({ hookStyle: "question" })).settings.hookStyle).toBe("question");
    });

    it("removes the comment-keyword CTA (lead generation on a tragedy)", () => {
      const result = applyGuardrails(topic, settingsWith({ cta: "comment_keyword" }));
      expect(result.settings.cta).toBe("none");
      expect(result.notices).toContain("CTA « commentaire mot-clé » retiré : aucun appel commercial sur un sujet dramatique.");
    });

    it("keeps other CTAs", () => {
      expect(applyGuardrails(topic, settingsWith({ cta: "share" })).settings.cta).toBe("share");
    });

    it("warns against a paid partnership but leaves the decision to the creator", () => {
      const result = applyGuardrails(topic, settingsWith({ sponsored: true }));
      expect(result.settings.sponsored).toBe(true);
      expect(result.notices.some((n) => n.startsWith("Partenariat rémunéré sur un sujet dramatique"))).toBe(true);
    });

    it("applies every rule at once, in a stable order", () => {
      const result = applyGuardrails(
        topic,
        settingsWith({ virality: 100, tone: "humoristique", hookStyle: "chiffre_choc", cta: "comment_keyword", sponsored: true }),
      );
      expect(result.settings).toMatchObject({
        virality: 39,
        tone: "journalistique",
        hookStyle: "auto",
        cta: "none",
        sponsored: true,
      });
      expect(result.notices.map((n) => n.slice(0, 22))).toEqual([
        "Sujet sensible (drame ",
        "Ton « Humoristique » r",
        "Accroche « Chiffre cho",
        "CTA « commentaire mot-",
        "Partenariat rémunéré s",
        "Le script inclut un pa",
      ]);
    });
  });
});
