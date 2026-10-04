/**
 * Test fixtures only — never imported by app code. A TikTok personal-finance
 * creator with 10 posts whose statistics are worked out by hand in
 * stats.test.ts (views median 57 500, three outliers, one pinned post, one
 * post younger than 48 h).
 */

import type { CompetitorInsights, CompetitorReport, CompetitorRequest, CreatorData, CreatorPost, CreatorProfile } from "../../types";

export const NOW = Date.parse("2026-10-02T15:00:00Z");

function post(id: string, publishedAt: string, extra: Omit<Partial<CreatorPost>, "id" | "publishedAt">): CreatorPost {
  return {
    id,
    url: `https://www.tiktok.com/@budgetmalin/video/${id}`,
    title: "",
    publishedAt,
    kind: "short_video",
    metrics: {},
    hashtags: [],
    ...extra,
  };
}

export const fixturePosts: CreatorPost[] = [
  post("t1", "2026-10-02T05:00:00Z", {
    title: "Tu paies encore des frais bancaires ?",
    text: "Tu paies encore des frais bancaires ? Voici comment les supprimer en 2 minutes. Abonne-toi pour la partie 2 #banque #argent",
    durationSec: 28,
    metrics: { views: 8_000, likes: 600, comments: 20, shares: 10, saves: 30 },
    hashtags: ["banque", "argent"],
  }),
  post("t2", "2026-09-30T17:30:00Z", {
    title: "3 erreurs qui vident ton compte chaque mois",
    text: "3 erreurs qui vident ton compte chaque mois. Enregistre pour plus tard 💸 #argent #budget",
    durationSec: 42,
    metrics: { views: 450_000, likes: 40_000, comments: 900, shares: 6_000, saves: 12_000 },
    hashtags: ["argent", "budget"],
  }),
  post("t3", "2026-09-28T17:00:00Z", {
    title: "Partie 2 : le livret A est-il encore rentable ?",
    text: "Partie 2 : le livret A est-il encore rentable ? Je compare avec l'inflation. #epargne #argent",
    durationSec: 35,
    metrics: { views: 60_000, likes: 4_000, comments: 150, shares: 300, saves: 900 },
    hashtags: ["epargne", "argent"],
  }),
  post("t4", "2026-09-26T11:00:00Z", {
    title: "Mon budget de septembre en toute transparence",
    durationSec: 65,
    metrics: { views: 30_000, likes: 1_500, comments: 40, shares: 60, saves: 100 },
    hashtags: ["budget"],
  }),
  post("t5", "2026-09-24T17:15:00Z", {
    title: "POV : tu découvres ce que te coûte vraiment ton abonnement",
    text: "POV : tu découvres ce que te coûte vraiment ton abonnement 😳 #argent #abonnement",
    durationSec: 25,
    metrics: { views: 900_000, likes: 70_000, comments: 2_000, shares: 25_000, saves: 30_000 },
    hashtags: ["argent", "abonnement"],
  }),
  post("t6", "2026-09-22T19:00:00Z", {
    title: "Pourquoi je n'investis pas en crypto",
    durationSec: 120,
    metrics: { views: 20_000, likes: 900, comments: 30, shares: 20, saves: 50 },
    hashtags: ["crypto"],
  }),
  post("t7", "2026-09-20T17:00:00Z", {
    title: "Épisode 3 : la règle des 50/30/20",
    text: "Épisode 3 : la règle des 50/30/20. Lien en bio pour le tableur gratuit. #budget",
    durationSec: 31,
    metrics: { views: 55_000, likes: 3_000, comments: 100, shares: 200, saves: 400 },
    hashtags: ["budget"],
  }),
  post("t8", "2026-09-18T08:00:00Z", {
    title: "Je réponds à vos questions sur le LEP",
    durationSec: 190,
    metrics: { views: 15_000, likes: 700, comments: 15, shares: 5, saves: 20 },
    hashtags: ["epargne"],
  }),
  post("t9", "2026-09-16T17:00:00Z", {
    title: "Combien gagner pour vivre à Paris ?",
    durationSec: 44,
    metrics: { views: 70_000, likes: 5_000, comments: 300, shares: 500, saves: 800 },
    hashtags: ["argent", "paris"],
  }),
  post("t10", "2026-08-01T10:00:00Z", {
    title: "Comment j'ai économisé 10 000 € en un an",
    text: "Comment j'ai économisé 10 000 € en un an (sans me priver). #argent #budget",
    durationSec: 50,
    pinned: true,
    metrics: { views: 2_000_000, likes: 150_000, comments: 5_000, shares: 40_000, saves: 60_000 },
    hashtags: ["argent", "budget"],
  }),
];

export const fixtureCreator: CreatorData = {
  account: {
    platform: "tiktok",
    handle: "budgetmalin",
    displayName: "Budget Malin",
    url: "https://www.tiktok.com/@budgetmalin",
    followers: 200_000,
    totalPosts: 412,
    bio: "Je t'apprends à gérer ton argent sans te prendre la tête 💸",
    verified: false,
  },
  posts: fixturePosts,
  source: "Apify · TikTok Scraper",
  fetchedAt: "2026-10-02T15:00:00.000Z",
  warnings: [],
};

export const fixtureProfile: CreatorProfile = {
  name: "Léa Explique",
  niche: "finances personnelles des étudiants",
  audience: "étudiants et jeunes diplômés 18-25 ans",
  positioning: "zéro jargon, des exemples avec de vrais budgets étudiants",
  voice: "tutoiement, phrases courtes, autodérision",
  avoid: "la crypto et les placements risqués",
  defaultCta: "Abonne-toi pour la suite",
};

export const fixtureCompetitorRequest: CompetitorRequest = {
  platform: "tiktok",
  handle: "@budgetmalin",
  focus: "ses hooks",
  maxPosts: 30,
  profile: fixtureProfile,
  language: "fr",
  geo: "FR",
};

export const fixtureInsights: CompetitorInsights = {
  positioning: "Vulgarisation budget pour jeunes actifs, promesse : économiser sans se priver.",
  audience: "Jeunes actifs urbains (déduction d'après les sujets).",
  tone: "Tutoiement, rythme rapide, POV et listes.",
  pillars: [
    { name: "Dépenses cachées", description: "Abonnements et frais.", share: "3 publications sur 10 (30 %)", performance: "médiane 450 k vues (×7,8 la médiane du compte)", postIds: ["t1", "t2", "t5"] },
    { name: "Épargne", description: "Livrets.", share: "2 publications sur 10 (20 %)", performance: "médiane 37,5 k vues (×0,7 la médiane du compte)", postIds: ["t3", "t8"] },
  ],
  formats: [{ name: "POV face caméra", description: "Mise en situation en 25 s.", postIds: ["t5"] }],
  hookPatterns: [
    {
      pattern: "Liste d'erreurs + conséquence chiffrée",
      whyItWorks: "Peur de perdre de l'argent.",
      examples: [{ postId: "t2", quote: "3 erreurs qui vident ton compte" }],
    },
  ],
  whatWorks: [{ insight: "Les POV sur les dépenses cachées explosent.", evidence: "×15,7 sa médiane.", postIds: ["t5"] }],
  whatFlops: [{ insight: "Les FAQ longues tombent à plat.", evidence: "×0,3 sa médiane.", postIds: ["t8"] }],
  followDrivers: [
    { insight: "Probablement la série numérotée (Épisode 3) qui donne une raison de revenir.", evidence: "Séries : 30 %.", postIds: ["t7"] },
  ],
  ctaAndEngagement: "CTA d'enregistrement sur les listes.",
  gaps: [{ opportunity: "Budget des étudiants", why: "Jamais traité alors que l'audience est jeune." }],
  differentiation: [{ recommendation: "Cible les étudiants", how: "Montre de vrais budgets à 800 € par mois." }],
  doNotCopy: ["Sa série « Épisode N » de règles budgétaires"],
  ideas: [
    {
      title: "Le vrai coût de tes abonnements étudiants",
      angle: "Calcul en direct des abonnements d'un étudiant, avec le tableau à la fin.",
      hook: "J'ai additionné tes abonnements. Assieds-toi.",
      format: "Face caméra, 30–45 s, calcul à l'écran",
      whyForYou: "Ton audience étudiante n'est pas servie. Vues : destinataire évident du partage (le coloc). Abonnements : épisode 1 d'une série budget étudiant.",
      inspiredBy: ["t5", "t2"],
    },
  ],
};

/** A saved report around the fixture data (stats filled by the caller). */
export function fixtureReport(overrides: Partial<CompetitorReport> & Pick<CompetitorReport, "stats">): CompetitorReport {
  return {
    id: "report-1",
    createdAt: "2026-10-02T15:00:00.000Z",
    mode: "ai",
    model: "claude-opus-5-5",
    data: fixtureCreator,
    insights: fixtureInsights,
    notes: [],
    ...overrides,
  };
}
