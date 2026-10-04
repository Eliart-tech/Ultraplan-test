/**
 * Which platforms the "Ce qui cartonne" lab can read with this environment,
 * through what, and what it costs — honest French notes for /api/sources.
 * Booleans and public wording only: never a key value.
 */

import { VIRAL_PLATFORMS, type ViralPlatform } from "../../types";
import type { ViralPlatformStatus } from "../../viral/labels";
import { youtubeRatiosAllowed } from "../creators/youtube";
import { tiktokActors } from "../sources/tiktok-apify";
import type { Env } from "../sources/types";

function has(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

export function viralCapabilities(env: Env): ViralPlatformStatus[] {
  const apify = has(env, "APIFY_TOKEN");
  const meta = has(env, "INSTAGRAM_ACCESS_TOKEN") && has(env, "INSTAGRAM_USER_ID");
  const youtubeKey = has(env, "YOUTUBE_API_KEY");

  const statuses: Record<ViralPlatform, ViralPlatformStatus> = {
    instagram: apify
      ? {
          platform: "instagram",
          available: true,
          via: meta
            ? "Apify (Instagram Hashtag Scraper) + abonnés via l'API Meta, repli Apify"
            : "Apify (Instagram Hashtag Scraper + Profile Scraper)",
          note: `Reels récents de vos mots-clés transformés en hashtags (5 maximum, environ 100 reels), épinglés et partenariats rémunérés exclus, puis abonnés des auteurs des 15 reels les plus vus (${
            meta ? "API Meta gratuite pour les comptes Créateur ou Entreprise, Apify pour les autres" : "≈ 0,04 $ via Apify"
          }). ≈ 0,30 $ par analyse, mise en cache 6 h. Partages et enregistrements non fournis par Instagram.`,
        }
      : {
          platform: "instagram",
          available: false,
          via: "Non configuré",
          note: meta
            ? "Renseignez APIFY_TOKEN dans Réglages : la recherche par hashtag de l'API Meta ne donne ni les vues ni l'auteur des reels (l'API Meta sert ensuite à lire les abonnés des auteurs)."
            : "Renseignez APIFY_TOKEN dans Réglages : Instagram n'offre aucune API publique pour trouver les reels d'une niche avec leurs vues et leur auteur.",
        },
    tiktok: apify
      ? {
          platform: "tiktok",
          available: true,
          via: `Apify (${tiktokActors(env).search.replace("~", "/")})`,
          note: "Vidéos les plus likées de la période pour chaque mot-clé (environ 60), publicités, contenus sponsorisés et épinglés exclus, avec vues, partages, enregistrements et abonnés de l'auteur (arrondis par TikTok). ≈ 0,40 $ par analyse au maximum, mise en cache 6 h.",
        }
      : {
          platform: "tiktok",
          available: false,
          via: "Non configuré",
          note: "Renseignez APIFY_TOKEN dans Réglages : TikTok n'ouvre pas d'API publique de recherche de vidéos aux usages commerciaux.",
        },
    youtube: youtubeKey
      ? {
          platform: "youtube",
          available: true,
          via: "YouTube Data API (1 recherche + 2 unités de quota)",
          note: youtubeRatiosAllowed(env)
            ? "Jusqu'à 50 vidéos les plus vues de la période sur vos mots-clés, avec abonnés des chaînes (arrondis par YouTube). Ratios vues ÷ abonnés activés (YT_DERIVED_METRICS_APPROVED=true : avenant « derived metrics » accepté)."
            : "Jusqu'à 50 vidéos les plus vues de la période sur vos mots-clés : vues, likes, commentaires et vues par jour bruts. Ratios vues ÷ abonnés désactivés : les règles développeurs de YouTube les interdisent sans l'avenant « derived metrics » — renseignez YT_DERIVED_METRICS_APPROVED=true une fois cet avenant accepté. Données YouTube à ne pas conserver plus de 30 jours.",
        }
      : {
          platform: "youtube",
          available: false,
          via: "Non configuré",
          note: "Renseignez YOUTUBE_API_KEY (gratuite, voir Réglages) : la recherche de vidéos par mots-clés passe par l'API officielle de YouTube.",
        },
  };
  return VIRAL_PLATFORMS.map((platform) => statuses[platform]);
}
