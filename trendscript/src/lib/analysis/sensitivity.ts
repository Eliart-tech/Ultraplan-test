/**
 * Keyword-based brand-safety pre-check (French + English). Claude refines it
 * in AI mode; in basic mode it is the only guard.
 *
 * It looks at the topic title and at each evidence text separately, and only
 * escalates when a sensitive term is central (in the title) or recurrent
 * (several sources). A single "décès" in an article about assurance-vie, or
 * "gouvernement" in budget news, must not hide a personal-finance topic.
 */

import type { Level3 } from "../types";
import { stripAccents } from "./text";

interface Rule {
  pattern: RegExp;
  reason: string;
  /** Evidence texts that must match (besides the title) to escalate. */
  minHits: number;
}

const HIGH: Rule[] = [
  { pattern: /\b(mort|morts|deces|decede|tue|tues|meurtre|assassinat|homicide|execution|killed|dead|death)\b/, reason: "décès / violence", minHits: 2 },
  { pattern: /\b(attentat|terroris\w*|fusillade|shooting|attack)\b/, reason: "attentat / violence armée", minHits: 2 },
  { pattern: /\b(guerre|war|bombardements?|frappes?|missiles?|otages?)\b/, reason: "conflit armé", minHits: 2 },
  { pattern: /\b(viol|agression sexuelle|pedocriminalite|abus sexuels?|rape)\b/, reason: "violences sexuelles", minHits: 1 },
  { pattern: /\b(suicide|suicid\w*)\b/, reason: "suicide", minHits: 1 },
  { pattern: /\b(accident|crash|catastrophe|seisme|inondations?|incendie)\b/, reason: "drame / catastrophe", minHits: 2 },
  { pattern: /\b(enfants?|mineurs?|eleves?)\b.*\b(disparu|enleve|victime)/, reason: "mineurs impliqués", minHits: 1 },
];

const MEDIUM: Rule[] = [
  { pattern: /\b(elections?|electoral|scrutin|referendum|candidats?|candidate|campagne electorale|deputes?|senateurs?|partis? politiques?)\b/, reason: "politique", minHits: 2 },
  { pattern: /\b(proces|tribunal|condamnee?s?|mise? en examen|garde a vue|plainte|justice)\b/, reason: "affaire judiciaire (présomption d'innocence)", minHits: 1 },
  { pattern: /\b(maladie|cancer|virus|epidemie|vaccins?|medicaments?)\b/, reason: "santé (risque de désinformation)", minHits: 2 },
  { pattern: /\b(religion|islam|juifs?|chretiens?|musulmans?|immigration|migrants?)\b/, reason: "sujet clivant", minHits: 2 },
  { pattern: /\b(bourse|crypto|bitcoin|investir|placements?)\b/, reason: "finance (pas de conseil personnalisé)", minHits: 1 },
];

const normalize = (value: string) => stripAccents(value.toLowerCase());

/**
 * @param title the topic title (a match here is always significant)
 * @param texts evidence texts: headlines, video titles, summary…
 */
export function detectSensitivity(title: string, texts: string[] = []): { level: Level3; reason: string } {
  const head = normalize(title);
  const bodies = texts.map(normalize).filter(Boolean);
  const hits = (pattern: RegExp) => bodies.filter((body) => pattern.test(body)).length;
  const escalates = (rule: Rule) => {
    if (rule.pattern.test(head)) return true;
    const count = hits(rule.pattern);
    // Recurrent: enough sources, and not a lone mention in a long list.
    return count >= rule.minHits && count >= Math.min(rule.minHits, bodies.length) && count / Math.max(1, bodies.length) >= 0.2;
  };

  for (const rule of HIGH) {
    if (escalates(rule)) return { level: "elevee", reason: `Sujet sensible : ${rule.reason}.` };
  }
  for (const rule of MEDIUM) {
    if (escalates(rule)) return { level: "moyenne", reason: `À traiter avec prudence : ${rule.reason}.` };
  }
  const passing = HIGH.find((rule) => hits(rule.pattern) > 0);
  if (passing) {
    return {
      level: "moyenne",
      reason: `Mention ponctuelle (${passing.reason}) dans les sources : vérifiez le contexte.`,
    };
  }
  return { level: "faible", reason: "Aucun signal de sensibilité détecté automatiquement." };
}
