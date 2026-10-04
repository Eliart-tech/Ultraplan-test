/**
 * Test fixtures only — never imported by app code. Claude's answer to the
 * competitor analysis of the `budgetmalin` fixture creator
 * (src/lib/creators/__fixtures__/creator.ts): p1 = t1 … p10 = t10.
 */

import type { CompetitorOutput } from "../competitor";

export function fixtureCompetitorOutput(overrides: Partial<CompetitorOutput> = {}): CompetitorOutput {
  return {
    positioning: "Vulgarisation du budget pour jeunes actifs, avec des mises en situation ([p5]).",
    audience: "Jeunes actifs urbains, d'après les sujets (déduction).",
    tone: "Tutoiement, rythme rapide.",
    pillars: [
      { postRefs: ["p1", "p2", "p5"], name: "Dépenses cachées", description: "Frais et abonnements, comme [p5]." },
      { postRefs: ["p3", "[p8]", "p99"], name: "Épargne", description: "Livrets." },
      { postRefs: ["p42"], name: "Pilier fantôme", description: "Aucune publication réelle." },
    ],
    formats: [{ postRefs: ["p5"], name: "POV face caméra", description: "Mise en situation en 25 s." }],
    hookPatterns: [
      {
        pattern: "Liste d'erreurs + conséquence",
        whyItWorks: "Peur de perdre de l'argent.",
        examples: [
          // Case, apostrophe and spacing differ from the post: still verbatim.
          { ref: "p2", quote: "« 3 erreurs qui  VIDENT ton compte »" },
          // Paraphrase: dropped.
          { ref: "p2", quote: "3 fautes qui vident ton compte" },
        ],
      },
      {
        pattern: "POV dépense cachée",
        whyItWorks: "Identification immédiate.",
        // Wrong reference, but the quote is verbatim in p5: re-attributed.
        examples: [{ ref: "p9", quote: "POV : tu découvres ce que te coûte vraiment ton abonnement" }],
      },
      {
        pattern: "Hook inventé",
        whyItWorks: "—",
        examples: [{ ref: "p1", quote: "Cette phrase n'existe nulle part" }],
      },
    ],
    whatWorks: [
      { postRefs: ["p5", "p2"], insight: "Les POV et listes sur l'argent qui fuit explosent", evidence: "[p5] et [p2] : ×15,7 et ×7,8 sa médiane." },
      { postRefs: ["p77"], insight: "Sans preuve", evidence: "[p77]" },
    ],
    whatFlops: [{ postRefs: ["p8"], insight: "Les FAQ longues tombent à plat.", evidence: "[p8] : 190 s, ×0,3." }],
    followDrivers: [
      {
        postRefs: ["p7", "p3"],
        insight: "Probablement les séries numérotées, qui donnent une raison de revenir (hypothèse).",
        evidence: "[p7, p3] : « Épisode 3 », « Partie 2 ».",
      },
    ],
    ctaAndEngagement: "CTA d'enregistrement sur les listes ([p2]).",
    gaps: [{ opportunity: "Budget des étudiants", why: "Jamais traité." }, { opportunity: "  ", why: "vide" }],
    differentiation: [{ recommendation: "Cible les étudiants", how: "Montre de vrais budgets à 800 €." }],
    doNotCopy: ["Sa série « Épisode N »", "sa série « épisode n »", ""],
    ideas: [
      {
        inspiredBy: ["p5", "p2", "p404"],
        title: "Le vrai coût de tes abonnements étudiants",
        angle: "Calcul en direct, inspiré de [p5] mais pour un budget étudiant.",
        hook: "J'ai additionné tes abonnements. Assieds-toi.",
        format: "Face caméra, 30–45 s",
        viewsLever: "Destinataire évident du partage : le coloc.",
        followLever: "Épisode 1 d'une série budget étudiant annoncée à l'écran",
        whyForYou: "Ton audience étudiante n'est pas servie.",
      },
    ],
    ...overrides,
  };
}
