/**
 * Sensitivity guardrails applied to the script settings before the prompt is
 * built (playbook §1.4, "feu orange"). Done in code so a slider pushed to 100
 * can never turn a tragedy or an election into clickbait, whatever the model
 * does. Pure and client-safe: the UI shows the same notices before
 * generating.
 */

import { stripAccents } from "../analysis/text";
import type { ScriptSettings, Topic } from "../types";
import { HOOK_STYLE_LABELS, TONE_LABELS } from "./levels";

/**
 * - "vert": no constraint;
 * - "orange": politics, justice, health, divisive social topics — factual
 *   form, capped virality, no humour/provocation;
 * - "orange_strict": drama, violence, deaths, minors (sensitivity "elevee") —
 *   same as orange plus no shock-number/polemic/POV hook and no lead-gen CTA.
 */
export type TopicRisk = "vert" | "orange" | "orange_strict";

export const MAX_SENSITIVE_VIRALITY = 39;

const ORANGE_REASONS =
  /politi|elect|scrutin|gouvern|judiciaire|justice|proces|tribunal|enquete|presomption|plainte|sante|medic|maladie|vaccin|sanitaire|epidemi|clivant|religi|immigr/;
const FINANCE_REASONS = /financ|bourse|crypto|invest|placement/;
const POLITICAL_REASONS = /politi|elect|scrutin|gouvern/;

const FORBIDDEN_TONES = new Set<ScriptSettings["tone"]>(["humoristique", "provocateur"]);
const FORBIDDEN_STRICT_HOOKS = new Set<ScriptSettings["hookStyle"]>(["chiffre_choc", "polemique_mesuree", "pov"]);

function normalizedReason(topic: Topic): string {
  return stripAccents(topic.sensitivity.reason.toLowerCase());
}

export function topicRisk(topic: Topic): TopicRisk {
  if (topic.sensitivity.level === "elevee") return "orange_strict";
  if (topic.sensitivity.level === "moyenne" && ORANGE_REASONS.test(normalizedReason(topic))) return "orange";
  return "vert";
}

/** Short reason for notices, without the detector's "Sujet sensible :" prefix. */
function shortReason(topic: Topic): string {
  return topic.sensitivity.reason
    .replace(/^(sujet sensible|à traiter avec prudence)\s*:\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

export function applyGuardrails(
  topic: Topic,
  settings: ScriptSettings,
): { settings: ScriptSettings; notices: string[] } {
  const risk = topicRisk(topic);
  const notices: string[] = [];
  const next: ScriptSettings = { ...settings };
  const reason = shortReason(topic);
  const normalized = normalizedReason(topic);

  if (risk === "vert") {
    if (topic.sensitivity.level === "moyenne" && FINANCE_REASONS.test(normalized)) {
      notices.push(
        "Sujet financier : le script reste de l'information générale, sans conseil personnalisé, et renvoie vers un professionnel.",
      );
    }
    return { settings: next, notices };
  }

  const label = reason ? `Sujet sensible (${reason})` : "Sujet sensible";

  if (next.virality > MAX_SENSITIVE_VIRALITY) {
    notices.push(
      `${label} : viralité plafonnée à ${MAX_SENSITIVE_VIRALITY} (au lieu de ${Math.round(next.virality)}) pour que la forme ne déforme pas les faits.`,
    );
    next.virality = MAX_SENSITIVE_VIRALITY;
  }

  if (FORBIDDEN_TONES.has(next.tone)) {
    notices.push(
      `Ton « ${TONE_LABELS[next.tone].label} » remplacé par « ${TONE_LABELS.journalistique.label} » : humour et provocation sont exclus sur un sujet sensible.`,
    );
    next.tone = "journalistique";
  }

  if (risk === "orange_strict") {
    if (FORBIDDEN_STRICT_HOOKS.has(next.hookStyle)) {
      notices.push(
        `Accroche « ${HOOK_STYLE_LABELS[next.hookStyle].label} » remplacée par une accroche factuelle choisie par Claude : pas de chiffre choc, de polémique ni de POV sur un drame.`,
      );
      next.hookStyle = "auto";
    }
    if (next.cta === "comment_keyword") {
      notices.push("CTA « commentaire mot-clé » retiré : aucun appel commercial sur un sujet dramatique.");
      next.cta = "none";
    }
    if (next.sponsored) {
      notices.push(
        "Partenariat rémunéré sur un sujet dramatique : fortement déconseillé (image de la marque, règles des annonceurs).",
      );
    }
  }

  notices.push("Le script inclut un passage « ce qu'on sait / ce qu'on ignore » et attribue chaque fait à sa source.");

  if (POLITICAL_REASONS.test(normalized) && next.platform === "instagram_reels") {
    notices.push(
      "Instagram ne recommande pas par défaut le contenu politique aux non-abonnés : attendez-vous à une portée réduite.",
    );
  }

  return { settings: next, notices };
}
