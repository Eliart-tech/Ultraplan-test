/**
 * French labels and honest wording shared by the "Ce qui cartonne" modules
 * (scoring notes, Claude prompt, script brief, UI). Pure and client-safe:
 * the same sentences explain the metrics everywhere.
 */

import type { ViralPlatform, ViralPost, ViralTier } from "../types";

const YOUTUBE_CHANNEL_ID = /^UC[\w-]{22}$/;

/** "@handle", or the channel's name when a YouTube author is only known by its channel id. */
export function viralAuthorLabel(post: Pick<ViralPost, "platform" | "author">): string {
  const { handle, displayName } = post.author;
  if (post.platform === "youtube" && YOUTUBE_CHANNEL_ID.test(handle)) return displayName?.trim() || handle;
  return `@${handle.replace(/^@+/, "")}`;
}

export const VIRAL_PLATFORM_LABELS: Record<ViralPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const VIRAL_TIER_LABELS: Record<ViralTier, { label: string; description: string }> = {
  explose: { label: "Explose", description: "Vue au moins 10 fois plus que son auteur n'a d'abonnés." },
  cartonne: {
    label: "Cartonne",
    description: "Vue au moins 3 fois plus que son auteur n'a d'abonnés, ou 3 fois plus que les comptes de même taille.",
  },
  bon: { label: "Bon", description: "Vue au moins autant de fois que son auteur a d'abonnés." },
  normal: { label: "Normal", description: "Dans la moyenne, ou audience de l'auteur inconnue." },
};

/** Which platform statuses `/api/sources` exposes for the lab (`viralCapabilities`). */
export interface ViralPlatformStatus {
  platform: ViralPlatform;
  available: boolean;
  /** French: what the data goes through ("Apify (Instagram Hashtag Scraper)"…). */
  via: string;
  /** French: what is measured, what it costs, what is missing. */
  note: string;
}

/** What the multiplier measures — and what no platform publishes. Shown in the UI and given to Claude. */
export const VIRAL_HONESTY_NOTE =
  "×N son audience = vues ÷ abonnés de l'auteur (abonnés comptés au moins 1 000) : une vidéo vue bien au-delà de l'audience de son créateur a été poussée à des non-abonnés pour son contenu, et c'est là que se gagnent les nouveaux abonnés. Aucune plateforme ne publie le nombre d'abonnés gagnés par vidéo pour le compte d'un autre : les leviers d'abonnement sont des hypothèses tirées de signaux publics, pas des mesures.";

/** The tier thresholds are heuristics until calibrated on real French data. */
export const VIRAL_THRESHOLDS_NOTE =
  "Paliers provisoires, à calibrer sur des données françaises réelles : « explose » à partir de ×10 son audience, « cartonne » à partir de ×3 (ou 3 fois la médiane des comptes de même taille), « bon » à partir de ×1.";

/** YouTube API Developer Policies III.E.4: no derived metrics without the 2026 amendment. */
export const VIRAL_YOUTUBE_RATIOS_NOTE =
  "YouTube : ratios désactivés (règles développeurs YouTube : pas de métriques dérivées sans l'avenant « derived metrics », YT_DERIVED_METRICS_APPROVED). Vues, likes, commentaires bruts et vues par jour uniquement ; le palier « cartonne » y désigne les 10 % de vidéos YouTube les plus vues de l'analyse.";
