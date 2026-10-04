/**
 * Test fixtures only — never imported by app code. A small "Ce qui cartonne"
 * run on the niche "sommeil et productivité": 5 TikTok videos, 4 Instagram
 * reels and 3 YouTube videos whose tiers are worked out by hand:
 *
 * | id     | followers  | views     | multiplier | tier                         |
 * |--------|------------|-----------|------------|------------------------------|
 * | tt1    | 5 000      | 900 000   | ×180       | explose                      |
 * | ig1    | 800 (1 000)| 25 000    | ×25        | explose                      |
 * | tt2    | 50 000     | 200 000   | ×4         | cartonne                     |
 * | ig2    | 120 000    | 400 000   | ×3,33      | cartonne                     |
 * | yt1    | 1,5 M      | 2 M       | —          | cartonne (top 10 % YouTube)  |
 * | tt3    | 2 M        | 2,5 M     | ×1,25      | bon                          |
 * | ig3    | 90 000     | 45 000    | ×0,5       | normal                       |
 * | tt4    | 300 000    | 30 000    | ×0,1       | normal                       |
 * | yt2    | 50 000     | 150 000   | —          | normal (YouTube, no ratios)  |
 * | yt3    | 8 000      | 20 000    | —          | normal (YouTube, no ratios)  |
 * | ig4    | unknown    | 300 000   | —          | normal (audience unknown)    |
 * | tt5    | unknown    | 40 000    | —          | normal (audience unknown)    |
 */

import { fixtureProfile } from "../../script/__fixtures__/script";
import type { ViralPatterns, ViralPlatform, ViralPlatformSummary, ViralReport, ViralRequest } from "../../types";
import { platformStats, scoreViralPosts, type ViralPostInput } from "../score";

export const NOW = Date.parse("2026-10-04T10:00:00Z");
const DAY = 86_400_000;

interface InputSpec {
  title: string;
  text?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followers?: number;
  handle: string;
  displayName?: string;
  daysAgo?: number;
  durationSec?: number;
  hashtags?: string[];
  query?: string;
}

const URLS: Record<ViralPlatform, (handle: string, id: string) => string> = {
  tiktok: (handle, id) => `https://www.tiktok.com/@${handle}/video/${id}`,
  instagram: (_handle, id) => `https://www.instagram.com/reel/${id}/`,
  youtube: (_handle, id) => `https://www.youtube.com/shorts/${id}`,
};

const PROFILES: Record<ViralPlatform, (handle: string) => string> = {
  tiktok: (handle) => `https://www.tiktok.com/@${handle}`,
  instagram: (handle) => `https://www.instagram.com/${handle}/`,
  youtube: (handle) => `https://www.youtube.com/@${handle}`,
};

export function viralInput(platform: ViralPlatform, id: string, spec: InputSpec): ViralPostInput {
  const metrics: ViralPostInput["metrics"] = {};
  for (const key of ["views", "likes", "comments", "shares", "saves"] as const) {
    if (spec[key] !== undefined) metrics[key] = spec[key];
  }
  return {
    id: `${platform}:${id}`,
    url: URLS[platform](spec.handle, id),
    title: spec.title,
    ...(spec.text ? { text: spec.text } : {}),
    publishedAt: new Date(NOW - (spec.daysAgo ?? 5) * DAY).toISOString(),
    kind: "short_video",
    ...(spec.durationSec !== undefined ? { durationSec: spec.durationSec } : {}),
    metrics,
    hashtags: spec.hashtags ?? [],
    platform,
    author: {
      handle: spec.handle,
      ...(spec.displayName ? { displayName: spec.displayName } : {}),
      ...(spec.followers !== undefined ? { followers: spec.followers } : {}),
      url: PROFILES[platform](spec.handle),
    },
    ...(spec.query ? { query: spec.query } : {}),
  };
}

export const fixtureViralInputs: ViralPostInput[] = [
  viralInput("tiktok", "tt1", {
    title: "3 erreurs qui ruinent ton sommeil",
    text: "3 erreurs qui ruinent ton sommeil (la 2e tout le monde la fait). Enregistre pour ce soir #sommeil #astuce",
    views: 900_000,
    likes: 80_000,
    comments: 1_200,
    shares: 20_000,
    saves: 30_000,
    followers: 5_000,
    handle: "dodo.coach",
    displayName: "Dodo Coach",
    daysAgo: 9,
    durationSec: 28,
    hashtags: ["sommeil", "astuce"],
    query: "sommeil",
  }),
  viralInput("instagram", "IG1abc", {
    title: "Le réveil à 5 h ne te rendra pas productif",
    text: "Le réveil à 5 h ne te rendra pas productif. Voici ce que dit vraiment la science du sommeil. Partie 1/3",
    views: 25_000,
    likes: 2_100,
    comments: 140,
    shares: 900,
    followers: 800,
    handle: "julie.focus",
    daysAgo: 3,
    durationSec: 34,
    query: "#productivite",
  }),
  viralInput("tiktok", "tt2", {
    title: "POV : tu dors 8 h et tu es quand même épuisé",
    text: "POV : tu dors 8 h et tu es quand même épuisé 😴 #sommeil",
    views: 200_000,
    likes: 15_000,
    comments: 300,
    shares: 1_000,
    saves: 2_000,
    followers: 50_000,
    handle: "nuitparfaite",
    daysAgo: 12,
    durationSec: 22,
    hashtags: ["sommeil"],
    query: "sommeil",
  }),
  viralInput("instagram", "IG2def", {
    title: "Ma méthode pour finir ma journée à 17 h",
    text: "Ma méthode pour finir ma journée à 17 h, sans culpabiliser. Abonne-toi pour la partie 2",
    views: 400_000,
    likes: 30_000,
    comments: 600,
    followers: 120_000,
    handle: "prodmaline",
    displayName: "Maline Productive",
    daysAgo: 20,
    durationSec: 45,
    query: "#productivite",
  }),
  viralInput("youtube", "yt1", {
    title: "J'ai testé le sommeil polyphasique pendant 30 jours",
    views: 2_000_000,
    likes: 90_000,
    comments: 4_000,
    followers: 1_500_000,
    handle: "UCaaaaaaaaaaaaaaaaaaaaaa",
    displayName: "Science Express",
    daysAgo: 25,
    durationSec: 58,
    query: "sommeil",
  }),
  viralInput("tiktok", "tt3", {
    title: "Pourquoi tu procrastines le soir",
    views: 2_500_000,
    likes: 120_000,
    comments: 2_000,
    shares: 5_000,
    saves: 10_000,
    followers: 2_000_000,
    handle: "psycho.express",
    daysAgo: 15,
    durationSec: 40,
    query: "productivité",
  }),
  viralInput("instagram", "IG3ghi", {
    title: "Ma routine du soir esthétique",
    views: 45_000,
    likes: 3_000,
    comments: 40,
    followers: 90_000,
    handle: "cosy.evening",
    daysAgo: 6,
    durationSec: 60,
    query: "#sommeil",
  }),
  viralInput("tiktok", "tt4", {
    title: "Ma routine du soir en 10 étapes",
    views: 30_000,
    likes: 1_000,
    comments: 20,
    shares: 10,
    saves: 50,
    followers: 300_000,
    handle: "lifestyle.lou",
    daysAgo: 4,
    durationSec: 75,
    query: "sommeil",
  }),
  viralInput("youtube", "yt2", {
    title: "Comment mieux dormir : 5 conseils",
    views: 150_000,
    likes: 4_000,
    comments: 100,
    followers: 50_000,
    handle: "UCbbbbbbbbbbbbbbbbbbbbbb",
    displayName: "Santé Facile",
    daysAgo: 10,
    durationSec: 50,
  }),
  viralInput("youtube", "yt3", {
    title: "Mon bureau minimaliste",
    views: 20_000,
    likes: 600,
    followers: 8_000,
    handle: "UCcccccccccccccccccccccc",
    daysAgo: 2,
    durationSec: 30,
  }),
  viralInput("instagram", "IG4jkl", {
    title: "Le café après 14 h, vraiment ?",
    views: 300_000,
    likes: 12_000,
    handle: "cafe.science",
    daysAgo: 7,
    durationSec: 31,
  }),
  viralInput("tiktok", "tt5", {
    title: "Mon avis sur les applis de sommeil",
    views: 40_000,
    likes: 2_000,
    handle: "techdodo",
    daysAgo: 8,
    durationSec: 33,
  }),
];

export const RATIOS = { youtube: false } as const;

export const fixtureViralPosts = scoreViralPosts(fixtureViralInputs, { now: NOW, ratiosAllowed: RATIOS });

export const fixtureViralRequest: ViralRequest = {
  platforms: ["instagram", "tiktok", "youtube"],
  keywords: ["sommeil", "productivité"],
  niche: "sommeil et productivité",
  periodDays: 30,
  geo: "FR",
  language: "fr",
  profile: fixtureProfile,
};

const SOURCES: Record<ViralPlatform, string> = {
  instagram: "Apify · Instagram Hashtag Scraper (reels)",
  tiktok: "Apify · TikTok Scraper (recherche de vidéos)",
  youtube: "YouTube Data API (recherche + statistiques)",
};

export const fixtureViralSummaries: ViralPlatformSummary[] = (["instagram", "tiktok", "youtube"] as const).map((platform) => ({
  platform,
  ...platformStats(fixtureViralPosts, platform),
  ratiosAllowed: platform !== "youtube",
  source: SOURCES[platform],
}));

export const fixtureViralPatterns: ViralPatterns = {
  summary: "Les vidéos qui expliquent une erreur de sommeil courante explosent sur les petits comptes.",
  recipes: [
    {
      name: "Liste d'erreurs + promesse pour ce soir",
      description: "3 erreurs concrètes, la pire en dernier, puis le geste à faire ce soir.",
      viewsLever: "Chaque spectateur se reconnaît dans une erreur et l'envoie à quelqu'un.",
      followLever: "Promesse d'une suite (la partie 2) : raison de revenir, probablement.",
      examples: [{ postId: "tiktok:tt1", quote: "3 erreurs qui ruinent ton sommeil" }],
      postIds: ["tiktok:tt1", "instagram:IG1abc"],
    },
  ],
  hookPatterns: [
    {
      pattern: "Contre-pied d'un conseil populaire",
      whyItWorks: "Le spectateur veut savoir pourquoi il a tort.",
      examples: [{ postId: "instagram:IG1abc", quote: "Le réveil à 5 h ne te rendra pas productif" }],
    },
  ],
  formats: [{ name: "Liste face caméra de 25 s", description: "Trois points rapides.", postIds: ["tiktok:tt1"] }],
  durations: "Les gagnantes durent entre 22 et 45 s.",
  topics: [{ topic: "Fatigue malgré le sommeil", evidence: "Deux vidéos gagnantes.", postIds: ["tiktok:tt2"] }],
  followDrivers: [{ insight: "Séries annoncées (hypothèse)", evidence: "Partie 1/3 sur une vidéo à ×25.", postIds: ["instagram:IG1abc"] }],
  avoid: ["Routines du soir esthétiques sans conseil : elles restent dans la moyenne."],
  ideas: [
    {
      title: "Les 3 erreurs de sommeil des jeunes actifs",
      angle: "Liste d'erreurs adaptée au rythme de bureau.",
      hook: "Tu fais sûrement la 2e erreur ce soir.",
      format: "Face caméra, 30 s, 3 erreurs puis le geste du soir",
      whyForYou: "Colle à ton audience de jeunes actifs. Vues : partage entre collègues. Abonnements : série en 3 parties.",
      inspiredBy: ["tiktok:tt1", "instagram:IG1abc"],
    },
  ],
};

export function fixtureViralReport(overrides: Partial<ViralReport> = {}): ViralReport {
  return {
    id: "report-1",
    createdAt: new Date(NOW).toISOString(),
    request: fixtureViralRequest,
    mode: "ai",
    model: "claude-opus-5-5",
    posts: fixtureViralPosts,
    platforms: fixtureViralSummaries,
    patterns: fixtureViralPatterns,
    notes: [],
    ...overrides,
  };
}
