/**
 * Keyword-based brand-safety pre-check (French + English). Claude refines it
 * in AI mode; in basic mode it is the only guard, so it errs on the side of
 * flagging.
 */

import type { Level3 } from "../types";
import { stripAccents } from "./text";

const HIGH: [RegExp, string][] = [
  [/\b(mort|morts|deces|decede|tue|tues|meurtre|assassinat|homicide|killed|dead|death)\b/, "décès / violence"],
  [/\b(attentat|terroris\w*|fusillade|shooting|attack)\b/, "attentat / violence armée"],
  [/\b(guerre|war|bombardement|frappes?|missiles?|otages?)\b/, "conflit armé"],
  [/\b(viol|agression sexuelle|pedocriminalite|abus sexuels?|rape)\b/, "violences sexuelles"],
  [/\b(suicide|suicid\w*)\b/, "suicide"],
  [/\b(accident|crash|catastrophe|seisme|inondations?|incendie)\b/, "drame / catastrophe"],
  [/\b(enfants?|mineurs?|eleves?)\b.*\b(disparu|enleve|victime)/, "mineurs impliqués"],
];

const MEDIUM: [RegExp, string][] = [
  [/\b(election|elections|vote|scrutin|candidat|president|gouvernement|ministre|depute|parti|politique)\b/, "politique"],
  [/\b(proces|tribunal|condamne|mis en examen|garde a vue|plainte|enquete|justice)\b/, "affaire judiciaire (présomption d'innocence)"],
  [/\b(sante|maladie|cancer|virus|epidemie|vaccin|medicament|traitement)\b/, "santé (risque de désinformation)"],
  [/\b(religion|islam|juif|chretien|musulman|immigration|migrants?)\b/, "sujet clivant"],
  [/\b(bourse|crypto|bitcoin|investir|placement)\b/, "finance (pas de conseil personnalisé)"],
];

export function detectSensitivity(text: string): { level: Level3; reason: string } {
  const haystack = stripAccents(text.toLowerCase());
  for (const [pattern, reason] of HIGH) {
    if (pattern.test(haystack)) return { level: "elevee", reason: `Sujet sensible : ${reason}.` };
  }
  for (const [pattern, reason] of MEDIUM) {
    if (pattern.test(haystack)) return { level: "moyenne", reason: `À traiter avec prudence : ${reason}.` };
  }
  return { level: "faible", reason: "Aucun signal de sensibilité détecté automatiquement." };
}
