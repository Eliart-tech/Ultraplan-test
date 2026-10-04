/**
 * Creator fetchers of the HTML edition (Concurrents page). Same parsing and
 * normalisation code as the server; only the transport changes:
 * - youtube: the server's keyless fetcher. Its youtube.com requests (the
 *   channel's "Vidéos" and "Shorts" tabs, the RSS feed) are answered through
 *   the viewer's Firecrawl connector by the fake server — one feed attempt
 *   only, since each attempt costs a Firecrawl credit;
 * - linkedin: the server's web-search fetcher, on Firecrawl search;
 * - instagram, tiktok: server only (Apify), explained in French.
 * The "Ce qui cartonne" lab is server only (editionViralCapabilities).
 */

import { fetchCreator, fetchLinkedinCreatorWeb, normalizeHandle } from "@/lib/server/creators";
import type { FetchCreatorOptions } from "@/lib/server/creators";
import { SourceError } from "@/lib/server/http";
import type { CreatorData, CreatorPlatform, CreatorPlatformStatus } from "@/lib/types";
import { VIRAL_PLATFORMS } from "@/lib/types";
import type { ViralPlatformStatus } from "@/lib/viral/labels";
import { firecrawlMode } from "./edition-text";
import { firecrawlSearch, firecrawlUnavailableReason, firecrawlUsable } from "./firecrawl";

/** The channel tab pages and the feed: what one YouTube analysis reads through Firecrawl. */
const YOUTUBE_CREDITS = "2 à 3 crédits Firecrawl par analyse";

/** Which platforms the Concurrents page can analyse in this view, through what (French, honest). */
export function editionCreatorCapabilities(): CreatorPlatformStatus[] {
  const { mode, why } = firecrawlMode();
  const live = mode !== "off";
  const condition = mode === "maybe" ? " si votre connecteur Firecrawl est connecté à votre compte claude.ai" : "";
  const serverOnly = (platform: CreatorPlatform, label: string): CreatorPlatformStatus => ({
    platform,
    available: false,
    via: "Version serveur uniquement",
    note: `${label} n'affiche pas les publications d'un compte sans connexion : l'analyse passe par Apify (APIFY_TOKEN) dans la version serveur de TrendScript.`,
  });
  return [
    serverOnly("instagram", "Instagram"),
    serverOnly("tiktok", "TikTok"),
    live
      ? {
          platform: "youtube",
          available: true,
          via: "Page publique de la chaîne, via votre connecteur Firecrawl",
          note: `Disponible${condition} : abonnés arrondis tels qu'affichés, 15 dernières vidéos avec vues et likes (flux RSS officiel) ou, si ce flux est en panne, les vidéos et Shorts des onglets de la chaîne (vues arrondies, sans dates). ${YOUTUBE_CREDITS}, résultat gardé 10 min.`,
        }
      : { platform: "youtube", available: false, via: "Firecrawl requis", note: `Indisponible ici : ${why}.` },
    live
      ? {
          platform: "linkedin",
          available: true,
          via: "Recherche web, via votre connecteur Firecrawl",
          note: `Disponible${condition} : publications indexées par le moteur de recherche, datées mais sans réactions, commentaires ni vues (pas de statistiques de performance). Environ 2 crédits Firecrawl par analyse. La version serveur avec APIFY_TOKEN lit l'engagement réel.`,
        }
      : { platform: "linkedin", available: false, via: "Firecrawl requis", note: `Indisponible ici : ${why}.` },
  ];
}

async function requireFirecrawl(label: string): Promise<void> {
  if (await firecrawlUsable()) return;
  throw new SourceError(`${label} indisponible dans cette vue : ${await firecrawlUnavailableReason()}.`);
}

/** `fetchCreator` of the edition (same signature, injected into runCompetitorAnalysis). */
export async function editionFetchCreator(platform: CreatorPlatform, handle: string, options: FetchCreatorOptions): Promise<CreatorData> {
  switch (platform) {
    case "youtube":
      await requireFirecrawl("YouTube");
      return fetchCreator("youtube", handle, { ...options, youtubeFeedBudgetMs: 0 });
    case "linkedin": {
      await requireFirecrawl("LinkedIn");
      const clean = normalizeHandle("linkedin", handle);
      if (!clean) throw new SourceError(`Profil LinkedIn invalide : « ${handle.trim().slice(0, 80)} ».`);
      const data = await fetchLinkedinCreatorWeb(clean, options, (query, { limit, tbs, location, signal }) =>
        firecrawlSearch(query, { limit, tbs, location, signal }),
      );
      // No key to add in this page: the engagement route is the server version's.
      const warnings = data.warnings.map((warning) =>
        warning.replace(/Renseignez APIFY_TOKEN pour obtenir l'engagement réel\./, "La version serveur de TrendScript (avec APIFY_TOKEN) lit l'engagement réel."),
      );
      return { ...data, warnings };
    }
    case "instagram":
    case "tiktok":
      throw new SourceError(
        `${platform === "instagram" ? "Instagram" : "TikTok"} n'est analysable que dans la version serveur de TrendScript (avec APIFY_TOKEN) : ses pages ne montrent pas les publications d'un compte sans connexion.`,
      );
  }
}

/**
 * "Ce qui cartonne" in this view: nothing to read. The lab searches a niche's
 * videos and their authors' follower counts through Apify (Instagram, TikTok)
 * and the YouTube Data API — keys only the server version holds.
 */
export function editionViralCapabilities(): ViralPlatformStatus[] {
  const notes: Record<(typeof VIRAL_PLATFORMS)[number], string> = {
    instagram:
      "Reels d'une niche et abonnés de leurs auteurs : Instagram n'offre aucune voie publique sans compte, la version serveur passe par Apify (APIFY_TOKEN).",
    tiktok:
      "Vidéos d'une niche avec vues, partages, enregistrements et abonnés des auteurs : la version serveur passe par Apify (APIFY_TOKEN).",
    youtube:
      "Recherche des vidéos les plus vues d'une niche : la version serveur passe par l'API officielle de YouTube (YOUTUBE_API_KEY, gratuite).",
  };
  return VIRAL_PLATFORMS.map((platform) => ({ platform, available: false, via: "Version serveur uniquement", note: notes[platform] }));
}
