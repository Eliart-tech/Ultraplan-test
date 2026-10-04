/**
 * Test fixtures only — never imported by app code. Claude's answer to the
 * "Ce qui cartonne" prompt built from `fixtureViralPosts`. With YouTube
 * ratios disabled, the prompt order is:
 *   p1 tt1 · p2 IG1abc (explosent) · p3 tt2 · p4 IG2def · p5 yt1 (cartonnent)
 *   · p6 tt3 (bonne) · p7 IG4jkl · p8 tt5 (audience inconnue)
 *   · p9 tt4 · p10 IG3ghi · p11 yt3 · p12 yt2 (contraste).
 * It deliberately contains mistakes the post-processing must catch: 4
 * unknown references (p99, p42, p77, p50), 2 quotes that are not in any
 * video, a quote attributed to the wrong video, and 3 items left without a
 * real video (a topic, a hook pattern, a recipe).
 */

import type { ViralOutput } from "../viral";

export function fixtureViralOutput(overrides: Partial<ViralOutput> = {}): ViralOutput {
  const idea = (title: string, inspiredBy: string[]) => ({
    inspiredBy,
    title,
    angle: "Liste d'erreurs adaptée au rythme de bureau, comme [p1].",
    hook: "Tu fais sûrement la 2e erreur ce soir.",
    format: "Face caméra, 30 s, 3 erreurs puis le geste du soir",
    viewsLever: "Chaque jeune actif se reconnaît et l'envoie à un collègue.",
    followLever: "Épisode 1 d'une série de 3 annoncée à l'écran.",
    whyForYou: "Colle à ton audience de jeunes actifs.",
  });
  return {
    topics: [
      { postRefs: ["p3", "p99"], topic: "Fatigue malgré 8 h de sommeil", evidence: "[p3] : vues = ×4 ses abonnés, absent du contraste." },
      { postRefs: ["p42"], topic: "Sujet inventé", evidence: "Aucune." },
    ],
    hookPatterns: [
      {
        pattern: "Contre-pied d'un conseil populaire",
        whyItWorks: "Le spectateur veut savoir pourquoi il a tort.",
        examples: [
          { ref: "p2", quote: "« Le réveil à 5 h ne te rendra pas productif »" },
          { ref: "p2", quote: "une phrase qui n'existe dans aucune vidéo" },
        ],
      },
      // Quote attributed to p3 but it is the title of p1: re-attributed.
      { pattern: "Liste d'erreurs numérotée", whyItWorks: "Promesse claire.", examples: [{ ref: "p3", quote: "3 erreurs qui ruinent ton sommeil" }] },
      { pattern: "Sans aucune preuve", whyItWorks: "", examples: [{ ref: "p1", quote: "rien de tout ça n'est écrit" }] },
    ],
    formats: [{ postRefs: ["p1", "[p3]"], name: "Liste face caméra de 25 s", description: "Trois points rapides, comme [p1]." }],
    durations: "Les gagnantes durent 22 à 45 s ([p3], [p4]), le contraste dépasse 60 s.",
    followDrivers: [
      {
        postRefs: ["p2"],
        insight: "Les séries annoncées donnent probablement une raison de revenir",
        evidence: "[p2] annonce « Partie 1/3 » et fait ×25 ses abonnés.",
      },
    ],
    recipes: [
      {
        postRefs: ["p1", "p2"],
        name: "Liste d'erreurs + promesse pour ce soir",
        description: "3 erreurs concrètes, la pire en dernier, puis le geste à faire ce soir.",
        viewsLever: "Chaque spectateur se reconnaît dans une erreur et l'envoie.",
        followLever: "Promesse d'une suite : raison de revenir, probablement.",
        examples: [{ ref: "p1", quote: "la 2e tout le monde la fait" }],
      },
      { postRefs: ["p77"], name: "Recette fantôme", description: "Rien.", viewsLever: "", followLever: "", examples: [] },
    ],
    avoid: ["Routines du soir esthétiques sans conseil, comme [p10]", "Routines du soir esthétiques sans conseil, comme [p10]"],
    ideas: [
      idea("Les 3 erreurs de sommeil des jeunes actifs", ["p1", "p2", "p50"]),
      idea("Le mythe du réveil à 5 h", ["p2"]),
      idea("Pourquoi tu es épuisé après 8 h", ["p3"]),
      idea("Finir à 17 h sans culpabiliser", ["p4"]),
      idea("Ma nuit idéale en 30 s", ["p1"]),
      idea("Sixième idée en trop", ["p1"]),
    ],
    summary: "Les erreurs de sommeil expliquées en liste cartonnent ([p1], [p3]) ; signal limité par 6 vidéos gagnantes.",
    ...overrides,
  };
}
