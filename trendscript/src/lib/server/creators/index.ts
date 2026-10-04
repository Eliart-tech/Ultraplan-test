/**
 * Creator fetchers for the competitor analysis: a platform + a handle →
 * the account and its real recent posts with their public counters.
 * Nothing is estimated: a platform that cannot be read throws a French,
 * actionable SourceError, and every limit of the data ends up in
 * `CreatorData.warnings`.
 */

import { CREATOR_PLATFORMS, type CreatorData, type CreatorPlatform, type CreatorPlatformStatus } from "../../types";
import { cached } from "../cache";
import { SourceError } from "../http";
import { tiktokActors } from "../sources/tiktok-apify";
import type { Env } from "../sources/types";
import { CREATOR_CACHE_TTL_MS, MAX_CREATOR_POSTS, type FetchCreatorOptions } from "./common";
import { YOUTUBE_CHANNEL_ID, normalizeHandle } from "./handles";
import { fetchInstagramCreator, instagramSharesEnabled } from "./instagram";
import { fetchLinkedinCreator } from "./linkedin";
import { fetchTiktokCreator } from "./tiktok";
import { fetchYoutubeCreator, youtubeRatiosAllowed } from "./youtube";

export { normalizeHandle, creatorProfileUrl } from "./handles";
export { linkedinHitsToCreatorPosts, linkedinCreatorSearchQuery, fetchLinkedinCreatorWeb } from "./linkedin";

export type { FetchCreatorOptions } from "./common";

function has(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

/** Which platforms can be analysed with this environment, through what (French, honest). */
export function creatorCapabilities(env: Env): CreatorPlatformStatus[] {
  const apify = has(env, "APIFY_TOKEN");
  const meta = has(env, "INSTAGRAM_ACCESS_TOKEN") && has(env, "INSTAGRAM_USER_ID");
  const youtubeKey = has(env, "YOUTUBE_API_KEY");
  const firecrawl = has(env, "FIRECRAWL_API_KEY");

  const youtubeRatios = youtubeRatiosAllowed(env)
    ? " Ratios vues ÷ abonnés activés (YT_DERIVED_METRICS_APPROVED=true : avenant « derived metrics » accepté)."
    : " Ratios vues ÷ abonnés désactivés : les règles développeurs de YouTube les interdisent sans l'avenant « derived metrics » — renseignez YT_DERIVED_METRICS_APPROVED=true une fois cet avenant accepté.";
  const statuses: Record<CreatorPlatform, CreatorPlatformStatus> = {
    youtube: youtubeKey
      ? {
          platform: "youtube",
          available: true,
          via: "YouTube Data API (50 dernières vidéos)",
          note: `Vues, likes, commentaires, durée de chaque vidéo et nombre d'abonnés (arrondi par YouTube). 3 unités de quota par analyse, sans recherche.${youtubeRatios}`,
        }
      : {
          platform: "youtube",
          available: true,
          via: "Page publique + flux RSS officiel (15 dernières vidéos)",
          note: `Gratuit et sans clé : vues et likes des 15 dernières vidéos, abonnés arrondis tels qu'affichés, mais ni commentaires ni durées (si le flux RSS de YouTube est en panne : vidéos et Shorts lus sur les onglets de la chaîne, vues arrondies, sans dates). Ajoutez YOUTUBE_API_KEY (gratuite) pour analyser jusqu'à 50 vidéos avec toutes leurs statistiques.${youtubeRatios}`,
        },
    instagram: meta
      ? {
          platform: "instagram",
          available: true,
          via: apify ? "API Meta (Business Discovery), repli Apify" : "API Meta (Business Discovery)",
          note: apify
            ? "Comptes Créateur ou Entreprise via l'API Meta (vues, likes, commentaires, abonnés ; ni partages ni enregistrements) ; les autres comptes publics passent par Apify (reels uniquement)."
            : "Gratuit, mais seulement pour les comptes Créateur ou Entreprise : vues, likes, commentaires et abonnés, ni partages ni enregistrements. Ajoutez APIFY_TOKEN pour analyser aussi les comptes personnels publics.",
        }
      : apify
        ? {
            platform: "instagram",
            available: true,
            via: "Apify (Instagram Reel Scraper + Profile Scraper)",
            note: `Reels de tout compte public (épinglés exclus) : vues, likes, commentaires, durée, son et abonnés. ≈ 0,08 $ pour 30 reels. ${
              instagramSharesEnabled(env)
                ? "Partages activés (APIFY_INSTAGRAM_SHARES, ≈ 0,007 $ de plus par reel)."
                : "Partages non récupérés (option payante : APIFY_INSTAGRAM_SHARES=1)."
            } Photos et carrousels non lus.`,
          }
        : {
            platform: "instagram",
            available: false,
            via: "Non configuré",
            note: "Renseignez APIFY_TOKEN (tout compte public) ou INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID (API Meta, comptes Créateur ou Entreprise) dans Réglages.",
          },
    tiktok: apify
      ? {
          platform: "tiktok",
          available: true,
          via: `Apify (${tiktokActors(env).search.replace("~", "/")})`,
          note: "Vidéos récentes de tout compte public (épinglées exclues) : vues, likes, commentaires, partages, enregistrements, durée, son et abonnés. ≈ 0,11 $ pour 30 vidéos.",
        }
      : {
          platform: "tiktok",
          available: false,
          via: "Non configuré",
          note: "Renseignez APIFY_TOKEN dans Réglages : TikTok n'ouvre aucune API publique pour lire les vidéos d'un autre compte.",
        },
    linkedin: apify
      ? {
          platform: "linkedin",
          available: true,
          via: "Apify (LinkedIn Profile Posts)",
          note: "Publications des 3 derniers mois d'un profil ou d'une page entreprise : réactions, commentaires, republications. LinkedIn ne fournit ni vues ni nombre d'abonnés. ≈ 0,06 $ pour 30 publications.",
        }
      : firecrawl
        ? {
            platform: "linkedin",
            available: true,
            via: "Recherche web (Firecrawl)",
            note: "Publications indexées par le moteur de recherche, datées mais sans réactions, commentaires ni vues : pas de statistiques de performance. Ajoutez APIFY_TOKEN pour l'engagement réel.",
          }
        : {
            platform: "linkedin",
            available: false,
            via: "Non configuré",
            note: "Renseignez APIFY_TOKEN (publications avec engagement) ou FIRECRAWL_API_KEY (publications sans compteurs) dans Réglages.",
          },
  };
  return CREATOR_PLATFORMS.map((platform) => statuses[platform]);
}

/** Cache key part that changes when the data route changes (adding a key must not serve the keyless result). */
function route(platform: CreatorPlatform, env: Env): string {
  switch (platform) {
    case "youtube":
      return `${has(env, "YOUTUBE_API_KEY") ? "api" : "keyless"}${youtubeRatiosAllowed(env) ? "+ratios" : ""}`;
    case "instagram":
      return `${has(env, "INSTAGRAM_ACCESS_TOKEN") && has(env, "INSTAGRAM_USER_ID") ? "meta" : "apify"}${instagramSharesEnabled(env) ? "+shares" : ""}`;
    case "tiktok":
      return tiktokActors(env).search;
    case "linkedin":
      return has(env, "APIFY_TOKEN") ? "apify" : "web";
  }
}

const FETCHERS: Record<CreatorPlatform, (handle: string, options: FetchCreatorOptions) => Promise<CreatorData>> = {
  youtube: fetchYoutubeCreator,
  instagram: fetchInstagramCreator,
  tiktok: fetchTiktokCreator,
  linkedin: fetchLinkedinCreator,
};

/**
 * Real recent posts (newest first) and account facts for a handle.
 * Accepts a raw "@handle" or profile URL too. Results are cached 6 h per
 * platform + handle + post count. Throws SourceError (French) when the
 * platform is not configured, the account does not exist / is private, or
 * nothing can be read.
 */
export async function fetchCreator(platform: CreatorPlatform, handle: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const fetcher = FETCHERS[platform];
  if (!fetcher) throw new SourceError(`Plateforme non prise en charge : ${String(platform)}.`);
  const clean = normalizeHandle(platform, handle);
  if (!clean) {
    throw new SourceError(
      `Pseudo ${platform === "linkedin" ? "ou adresse de profil " : ""}invalide : « ${handle.trim().slice(0, 80)} ». Indiquez @pseudo ou l'adresse du profil.`,
    );
  }
  const maxPosts = Math.min(MAX_CREATOR_POSTS, Math.max(1, Math.round(Number.isFinite(options.maxPosts) ? options.maxPosts : 30)));
  // YouTube channel ids are case-sensitive; handles are not.
  const key = platform === "youtube" && YOUTUBE_CHANNEL_ID.test(clean) ? clean : clean.toLowerCase();
  const { value } = await cached(`creator:${platform}:${route(platform, options.env)}:${key}:${maxPosts}`, CREATOR_CACHE_TTL_MS, () =>
    fetcher(clean, { ...options, maxPosts }),
  );
  return value;
}
