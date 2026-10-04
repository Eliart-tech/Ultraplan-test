/**
 * French labels and number formats shared by the competitor modules (brief,
 * coverage, idea hand-off, prompts). Pure and client-safe.
 */

import type { CreatorAccount, CreatorPlatform, CreatorPost, CreatorStats, Platform, SignalKind, SourceId } from "../types";

export const CREATOR_PLATFORM_LABELS: Record<CreatorPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

/**
 * Closest existing trend source per platform, used when a competitor's post
 * becomes evidence for a script (no dedicated SourceId for competitor posts).
 */
export const CREATOR_SOURCE_IDS: Record<CreatorPlatform, SourceId> = {
  instagram: "instagram_apify",
  tiktok: "tiktok_apify",
  youtube: "youtube",
  linkedin: "linkedin_apify",
};

export const CREATOR_SIGNAL_PLATFORMS: Record<CreatorPlatform, Platform> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
};

export const POST_KIND_LABELS: Record<CreatorPost["kind"], string> = {
  short_video: "vidéo courte",
  video: "vidéo",
  social_post: "publication",
};

export function postKindLabel(platform: CreatorPlatform, kind: CreatorPost["kind"] | SignalKind): string {
  if (kind === "short_video") {
    return platform === "instagram" ? "Reel" : platform === "youtube" ? "Short" : "vidéo courte";
  }
  if (kind === "video") return platform === "youtube" ? "vidéo longue" : "vidéo";
  return "publication";
}

const compactFormatter = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const decimalFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const preciseFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** 12345 → "12,3 k", 1 500 000 → "1,5 M" (French compact notation). */
export function formatCompactFr(value: number): string {
  return compactFormatter.format(value);
}

/** 4.37 → "4,4 %" (or "4,37 %" with 2 decimals). */
export function formatPercentFr(value: number, decimals: 1 | 2 = 1): string {
  return `${(decimals === 2 ? preciseFormatter : decimalFormatter).format(value)} %`;
}

/** 3.4 → "×3,4". */
export function formatRatio(ratio: number): string {
  return `×${decimalFormatter.format(ratio)}`;
}

/** 0.35 → "×0,35", 3.2 → "×3,2" (views ÷ followers). */
export function formatMultiplier(multiplier: number): string {
  return `×${(multiplier < 1 ? preciseFormatter : decimalFormatter).format(multiplier)}`;
}

/** "1,2 M vues" or "score d'engagement 450". */
export function formatRankingValue(value: number, metric: CreatorStats["rankingMetric"]): string {
  return metric === "views" ? `${formatCompactFr(value)} vues` : `score d'engagement ${formatCompactFr(value)}`;
}

export function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** "@handle" (LinkedIn profiles are named, handles there are URL slugs). */
export function accountLabel(account: Pick<CreatorAccount, "platform" | "handle" | "displayName">): string {
  if (account.platform === "linkedin" && account.displayName?.trim()) return account.displayName.trim();
  return `@${account.handle}`;
}

/** Short human reference to a post: « its title » or « publication du 12 sept. ». */
export function postLabel(post: Pick<CreatorPost, "title" | "publishedAt">, max = 60): string {
  const title = post.title.replace(/\s+/g, " ").trim();
  if (title) return `« ${clip(title, max)} »`;
  const time = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
  if (Number.isNaN(time)) return "une publication sans titre";
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(time);
  return `la publication du ${day}`;
}
