/**
 * Test fixtures only — never imported by app code. Built around the
 * playbook's own running example (the 25 October 2026 clock change).
 */

import type { CreatorProfile, ScriptDraft, ScriptRequest, ScriptSettings, Signal, Topic } from "../../types";

export const NOW = Date.parse("2026-10-02T15:00:00Z");

export const fixtureSignals: Signal[] = [
  {
    id: "google_trends:abc1",
    source: "google_trends",
    platform: "google",
    kind: "search_trend",
    title: "changement d'heure",
    url: "https://trends.google.com/trends/explore?q=changement+d%27heure&geo=FR",
    publishedAt: "2026-10-02T06:00:00Z",
    metrics: { searchVolume: 20000, increasePct: 1000 },
    tags: ["heure d'hiver"],
    related: [
      {
        title: "Changement d'heure 2026 : à quelle date passe-t-on à l'heure d'hiver ?",
        url: "https://www.example-news.fr/societe/changement-heure-2026",
        source: "Example News",
      },
    ],
    strength: 90,
  },
  {
    id: "google_news:def2",
    source: "google_news",
    platform: "news",
    kind: "news",
    title: "Heure d'hiver : ce qui change dans la nuit du 24 au 25 octobre",
    url: "https://www.example-daily.fr/heure-hiver-25-octobre",
    author: "Example Daily",
    publishedAt: "2026-10-02T09:30:00Z",
    metrics: { rank: 2 },
    tags: [],
    related: [],
    strength: 70,
  },
  {
    id: "tiktok_apify:ghi3",
    source: "tiktok_apify",
    platform: "tiktok",
    kind: "short_video",
    title: "POV : ton corps le lundi après le changement d'heure #heure #sommeil",
    text: "POV : ton corps le lundi après le changement d'heure #heure #sommeil",
    url: "https://www.tiktok.com/@exemple/video/7420000000000000000",
    author: "@exemple",
    publishedAt: "2026-10-01T18:00:00Z",
    metrics: { views: 1_250_000, likes: 98_000, comments: 1_200 },
    tags: ["heure", "sommeil"],
    related: [],
    query: "sommeil",
    strength: 80,
    outlier: true,
  },
];

export const fixtureTopic: Topic = {
  id: "topic-heure",
  title: "Changement d'heure du 25 octobre",
  summary: "Les recherches sur le passage à l'heure d'hiver montent, la presse détaille ce qui change dans la nuit du 24 au 25 octobre.",
  whyNow: "Recherche en forte hausse sur Google (tranche 20 k+), un TikTok à 1,2 M de vues sur le sujet.",
  category: "Société",
  platforms: ["google", "news", "tiktok"],
  signalIds: fixtureSignals.map((s) => s.id),
  keywords: ["changement d'heure", "heure d'hiver"],
  lifespan: "court",
  saturation: "moyenne",
  sensitivity: { level: "faible", reason: "Aucun risque particulier." },
  scores: { momentum: 80, reach: 75, crossPlatform: 55, freshness: 90, nicheFit: 70, total: 74 },
  angles: [
    {
      id: "topic-heure-conseil",
      type: "conseil",
      title: "3 réglages à faire samedi soir avant le changement d'heure",
      pitch: "Les réglages qui évitent de rater son réveil lundi.",
      hook: "Samedi soir, fais ces 3 réglages.",
      whyItWorks: "Fort potentiel d'enregistrement.",
    },
  ],
};

export const fixtureSettings: ScriptSettings = {
  platform: "instagram_reels",
  durationSec: 45,
  virality: 72,
  pedagogy: 55,
  tone: "decontracte",
  format: "face_camera",
  hookStyle: "contre_intuitif",
  cta: "share",
  language: "fr",
  research: false,
  pace: "normal",
  sponsored: false,
  aiVisuals: false,
};

export const fixtureProfile: CreatorProfile = {
  name: "Léa Explique",
  niche: "sommeil et productivité",
  audience: "jeunes actifs 22-35 ans",
  positioning: "conseils concrets, sans culpabiliser",
  voice: "tutoiement, phrases courtes, un peu d'autodérision",
  avoid: "les marques de compléments alimentaires",
  defaultCta: "Abonne-toi pour la suite",
};

export const fixtureRequest: ScriptRequest = {
  topic: fixtureTopic,
  signals: fixtureSignals,
  angle: fixtureTopic.angles[0],
  settings: fixtureSettings,
  profile: fixtureProfile,
  geo: "FR",
};

const words = (n: number, word = "mot") => Array.from({ length: n }, () => word).join(" ");

/** A well-formed 45 s draft: 101 words of voice-over, contiguous beats. */
export function fixtureDraft(overrides: Partial<ScriptDraft> = {}): ScriptDraft {
  const beats = [
    { startSec: 0, endSec: 3, label: "Hook", voiceover: `Ton réveil va te mentir dimanche. ${words(2)}` },
    { startSec: 3, endSec: 8, label: "Enjeu", voiceover: words(11) },
    { startSec: 8, endSec: 18, label: "Point 1", voiceover: words(22) },
    { startSec: 18, endSec: 20, label: "Relance", voiceover: words(5) },
    { startSec: 20, endSec: 32, label: "Point 2", voiceover: words(27) },
    { startSec: 32, endSec: 40, label: "Payoff", voiceover: words(18) },
    { startSec: 40, endSec: 45, label: "CTA", voiceover: words(11) },
  ].map((b) => ({ ...b, onScreenText: "", visual: "plan serré", editing: "[ZOOM]" }));
  return {
    title: "Changement d'heure : 3 réglages avant dimanche",
    hooks: [
      { style: "Contre-intuitif", spoken: "Ton réveil va te mentir dimanche.", onScreenText: "Ton réveil va te mentir", visual: "main qui attrape le téléphone", rationale: "Surprise." },
      { style: "Question", spoken: "Tu sais à quelle heure tu te lèves lundi ?", onScreenText: "Lundi, tu te lèves quand ?", visual: "réveil", rationale: "Curiosité." },
      { style: "Liste", spoken: "3 réglages à faire samedi soir.", onScreenText: "3 réglages avant dimanche", visual: "liste", rationale: "Promesse claire." },
    ],
    beats,
    fullScript: beats.map((b) => b.voiceover).join("\n"),
    caption: "Changement d'heure : les 3 réglages à faire avant dimanche.\nSources : Example Daily, 2 oct.\nEnvoie ça à ton pote qui rate toujours son réveil.",
    hashtags: ["#changementdheure", "#sommeil", "#astuce"],
    cta: "Envoie ça à ton pote qui rate toujours son réveil.",
    strengths: ["Hook contre-intuitif"],
    risks: ["Sujet déjà couvert"],
    checklist: [{ criterion: "Hook", passed: true, comment: "7 mots" }],
    factsToVerify: [
      { claim: "Passage à l'heure d'hiver dans la nuit du 24 au 25 octobre", sourceUrl: "https://www.example-daily.fr/heure-hiver-25-octobre", confidence: "haute" },
    ],
    sources: [{ title: "Heure d'hiver", url: "https://www.example-daily.fr/heure-hiver-25-octobre", source: "Example Daily" }],
    ...overrides,
  };
}
