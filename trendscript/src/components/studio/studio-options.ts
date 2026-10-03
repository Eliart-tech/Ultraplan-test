/**
 * Static choices and French labels of the Studio (countries, languages,
 * badges, sort options, defaults). Pure and client-safe.
 */

import type { BadgeTone } from "@/components/ui/badge";
import type {
  CtaType,
  Lifespan,
  Level3,
  Platform,
  ScriptSettings,
  SignalKind,
  SourceId,
} from "@/lib/types";

export interface CountryOption {
  value: string;
  label: string;
  /** Main language, suggested when the country changes. */
  language: string;
}

/**
 * Markets offered in the Radar. Luxembourg is left out on purpose: Google
 * Trends publishes no daily trends for it.
 */
export const COUNTRIES: CountryOption[] = [
  { value: "FR", label: "France", language: "fr" },
  { value: "BE", label: "Belgique", language: "fr" },
  { value: "CH", label: "Suisse", language: "fr" },
  { value: "CA", label: "Canada", language: "fr" },
  { value: "MA", label: "Maroc", language: "fr" },
  { value: "US", label: "États-Unis", language: "en" },
  { value: "GB", label: "Royaume-Uni", language: "en" },
  { value: "DE", label: "Allemagne", language: "de" },
  { value: "ES", label: "Espagne", language: "es" },
  { value: "IT", label: "Italie", language: "it" },
  { value: "PT", label: "Portugal", language: "pt" },
  { value: "NL", label: "Pays-Bas", language: "nl" },
];

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "de", label: "Allemand" },
  { value: "es", label: "Espagnol" },
  { value: "it", label: "Italien" },
  { value: "pt", label: "Portugais" },
  { value: "nl", label: "Néerlandais" },
];

export function countryLabel(code: string): string {
  return COUNTRIES.find((country) => country.value === code)?.label ?? code;
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((language) => language.value === code)?.label ?? code;
}

export function countryLanguage(code: string): string | undefined {
  return COUNTRIES.find((country) => country.value === code)?.language;
}

export const MIN_TOPICS = 5;
export const MAX_TOPICS = 15;
export const DEFAULT_TOPICS = 8;
export const MAX_KEYWORDS = 8;

/** Labels used when /api/sources is not loaded yet (progress list, notes). */
export const SOURCE_FALLBACK: Record<SourceId, { label: string; platform: Platform }> = {
  google_trends: { label: "Google Trends", platform: "google" },
  google_news: { label: "Google Actualités", platform: "news" },
  wikipedia: { label: "Wikipédia", platform: "wikipedia" },
  serpapi_trends: { label: "SerpApi — Google Trends", platform: "google" },
  youtube_rss: { label: "YouTube (RSS)", platform: "youtube" },
  youtube: { label: "YouTube (API officielle)", platform: "youtube" },
  instagram_graph: { label: "Instagram (API Meta)", platform: "instagram" },
  instagram_apify: { label: "Instagram Reels (Apify)", platform: "instagram" },
  tiktok_apify: { label: "TikTok (Apify)", platform: "tiktok" },
  linkedin_web: { label: "LinkedIn (recherche web)", platform: "linkedin" },
  linkedin_apify: { label: "LinkedIn (Apify)", platform: "linkedin" },
};

export const LIFESPAN_META: Record<Lifespan, { label: string; tone: BadgeTone; window: string }> = {
  flash: { label: "Flash", tone: "hot", window: "Pic de 24 à 48 h : publiez aujourd'hui ou demain." },
  court: { label: "Court", tone: "accent", window: "Fenêtre de quelques jours : publiez cette semaine." },
  durable: { label: "Durable", tone: "success", window: "Intérêt durable : publiable pendant plusieurs semaines." },
};

export const SATURATION_META: Record<Level3, { label: string; tone: BadgeTone; hint: string }> = {
  faible: { label: "Peu traité", tone: "success", hint: "Peu de créateurs en parlent : la place est à prendre." },
  moyenne: { label: "Déjà traité", tone: "neutral", hint: "Plusieurs créateurs en parlent : misez sur un angle différenciant." },
  elevee: { label: "Saturé", tone: "warning", hint: "Beaucoup de vidéos existent déjà : un angle original est indispensable." },
};

export const SIGNAL_KIND_LABELS: Record<SignalKind, string> = {
  search_trend: "Recherche",
  news: "Article",
  article_views: "Article consulté",
  short_video: "Vidéo courte",
  video: "Vidéo",
  social_post: "Publication",
};

export type TopicSort = "score" | "momentum" | "freshness" | "niche";

export const SORT_LABELS: Record<TopicSort, string> = {
  score: "Score",
  momentum: "Momentum",
  freshness: "Fraîcheur",
  niche: "Pertinence niche",
};

/** CTA types that take a detail, with the matching field label. */
export const CTA_DETAIL: Partial<Record<CtaType, { label: string; placeholder: string }>> = {
  comment_keyword: { label: "Mot-clé à commenter", placeholder: "Ex. : GUIDE" },
  link_in_bio: { label: "Ce qu'on trouve en bio", placeholder: "Ex. : mon guide gratuit sur le budget" },
  follow: { label: "Pourquoi s'abonner", placeholder: "Ex. : la partie 2 sort demain" },
  share: { label: "À qui l'envoyer", placeholder: "Ex. : à ton pote qui rate toujours son réveil" },
};

/** Suggestions of the "Affiner" panel. */
export const REFINE_SUGGESTIONS = [
  "Hook plus percutant",
  "Plus court",
  "Plus pédagogique",
  "Plus d'humour",
  "Ton plus expert",
  "Ajouter un exemple concret",
] as const;

/** Settings of a first generation (spec defaults). */
export function defaultScriptSettings(language = "fr"): ScriptSettings {
  return {
    platform: "instagram_reels",
    durationSec: 45,
    virality: 60,
    pedagogy: 60,
    tone: "decontracte",
    format: "face_camera",
    hookStyle: "auto",
    cta: "auto",
    ctaDetail: "",
    language,
    research: true,
    extraInstructions: "",
    pace: "normal",
    sponsored: false,
    aiVisuals: false,
  };
}

/** Caption length limits per script platform (characters). */
export const CAPTION_LIMITS: Record<ScriptSettings["platform"], number> = {
  instagram_reels: 2200,
  tiktok: 4000,
  youtube_shorts: 5000,
  linkedin: 3000,
};
