/**
 * Instagram Reels under the creator's niche hashtags, through the Apify
 * actor `apify/instagram-hashtag-scraper` (resultsType "reels").
 *
 * Instagram has no public "trending reels" endpoint: this returns the
 * *recent* reels of each hashtag with their real public counters, which the
 * scoring module then ranks (views vs. median → outliers).
 */

import type { Signal } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "./apify";
import {
  DAY_MS,
  captionTitle,
  clearlyNotFrench,
  isRecent,
  keywordsToHashtags,
  toCount,
  toIso,
  uniqueTags,
} from "./social-utils";
import type { SourceConnector, SourceContext } from "./types";

export const INSTAGRAM_HASHTAG_ACTOR = "apify~instagram-hashtag-scraper";
const MAX_HASHTAGS = 5;
const RESULTS_PER_HASHTAG = 20;
const MAX_AGE_DAYS = 30;

/** Dataset fields we read (keeps the payload small; `error*` needed to spot failed rows). */
export const INSTAGRAM_APIFY_FIELDS = [
  "id",
  "type",
  "shortCode",
  "url",
  "inputUrl",
  "caption",
  "hashtags",
  "timestamp",
  "likesCount",
  "commentsCount",
  "videoPlayCount",
  "igPlayCount",
  "videoViewCount",
  "reshareCount",
  "ownerUsername",
  "ownerFullName",
  "productType",
  "videoDuration",
  "displayUrl",
  "isPinned",
  "paidPartnership",
  "musicInfo",
  "error",
  "errorDescription",
];

/** Output row of apify/instagram-hashtag-scraper (fields we use). */
export interface ApifyInstagramItem {
  id?: string;
  type?: string;
  shortCode?: string;
  url?: string;
  inputUrl?: string;
  caption?: string;
  hashtags?: string[];
  timestamp?: string;
  /** -1 when the owner hides likes. */
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  igPlayCount?: number;
  /** Deprecated by Instagram, may be stale — last resort. */
  videoViewCount?: number;
  reshareCount?: number;
  ownerUsername?: string;
  ownerFullName?: string;
  /** "clips" = reel, "feed" = regular post. */
  productType?: string;
  videoDuration?: number;
  displayUrl?: string;
  isPinned?: boolean;
  paidPartnership?: boolean;
  musicInfo?: {
    artist_name?: string;
    song_name?: string;
    uses_original_audio?: boolean;
  };
}

/** Pure: actor input for the niche keywords (accents stripped, spaces removed, max 5). */
export function buildInstagramApifyInput(keywords: string[]) {
  return {
    hashtags: keywordsToHashtags(keywords, MAX_HASHTAGS),
    resultsType: "reels" as const,
    resultsLimit: RESULTS_PER_HASHTAG,
  };
}

function isReel(item: ApifyInstagramItem): boolean {
  return item.productType === "clips" || /\/reels?\//.test(item.url ?? "");
}

/** Permalink (`/reel/{shortCode}/`) — never the expiring CDN media URL. */
function reelUrl(item: ApifyInstagramItem): string | undefined {
  if (item.shortCode) return `https://www.instagram.com/reel/${item.shortCode}/`;
  return item.url?.startsWith("https://www.instagram.com/") ? item.url : undefined;
}

/** The hashtag that produced the row: from `inputUrl` (…/explore/tags/<tag>), else a requested tag it carries. */
function sourceHashtag(item: ApifyInstagramItem, requested: string[]): string | undefined {
  const fromUrl = item.inputUrl?.match(/\/explore\/tags\/([^/?#]+)/)?.[1];
  if (fromUrl) {
    try {
      return decodeURIComponent(fromUrl).toLowerCase();
    } catch {
      return fromUrl.toLowerCase();
    }
  }
  const tags = new Set((item.hashtags ?? []).map((tag) => tag.toLowerCase()));
  return requested.find((tag) => tags.has(tag));
}

function musicLabel(item: ApifyInstagramItem): string | undefined {
  const music = item.musicInfo;
  if (!music || music.uses_original_audio !== false || !music.song_name) return undefined;
  return `Son : « ${music.song_name} »${music.artist_name ? ` – ${music.artist_name}` : ""}`;
}

export interface NormalizeOptions {
  now: number;
  /** Requested hashtags, to attribute each reel to its query. */
  hashtags: string[];
  language: string;
}

export interface NormalizeResult {
  signals: Signal[];
  /** Requested hashtags that produced at least one kept reel (duplicates included). */
  matchedHashtags: string[];
  /** Counts of rows dropped by each filter (reported in the warning). */
  dropped: { notReel: number; tooOld: number; otherLanguage: number; duplicate: number };
}

/** Pure: dataset rows → signals (reels only, last 30 days, deduped by permalink). */
export function normalizeInstagramItems(items: ApifyInstagramItem[], { now, hashtags, language }: NormalizeOptions): NormalizeResult {
  const dropped = { notReel: 0, tooOld: 0, otherLanguage: 0, duplicate: 0 };
  const byUrl = new Map<string, Signal>();
  const matched = new Set<string>();

  for (const item of items) {
    const url = reelUrl(item);
    if (!url || !isReel(item) || item.isPinned) {
      dropped.notReel++;
      continue;
    }
    const publishedAt = toIso(item.timestamp);
    if (!isRecent(publishedAt, now, MAX_AGE_DAYS * DAY_MS)) {
      dropped.tooOld++;
      continue;
    }
    if (language === "fr" && clearlyNotFrench(item.caption)) {
      dropped.otherLanguage++;
      continue;
    }

    const views = toCount(item.videoPlayCount) ?? toCount(item.igPlayCount) ?? toCount(item.videoViewCount);
    const author = item.ownerUsername ? `@${item.ownerUsername}` : item.ownerFullName;
    const music = musicLabel(item);
    const caption = truncate(item.caption, music ? 420 : 500);
    const duration = toCount(item.videoDuration);
    const signal: Signal = {
      id: `instagram_apify:${shortHash(url)}`,
      source: "instagram_apify",
      platform: "instagram",
      kind: "short_video",
      title: captionTitle(item.caption, `Reel de ${author ?? "un compte Instagram"}`),
      text: [caption, music, item.paidPartnership ? "Partenariat rémunéré" : undefined].filter(Boolean).join(" · ") || undefined,
      url,
      thumbnailUrl: item.displayUrl,
      author,
      publishedAt,
      metrics: {
        views,
        likes: toCount(item.likesCount),
        comments: toCount(item.commentsCount),
        shares: toCount(item.reshareCount),
        durationSec: duration ? Math.round(duration) : undefined,
      },
      tags: uniqueTags(item.hashtags ?? []),
      related: [],
      query: sourceHashtag(item, hashtags),
      strength: 0,
    };

    if (signal.query) matched.add(signal.query);
    const existing = byUrl.get(url);
    if (existing) {
      dropped.duplicate++;
      if ((signal.metrics.views ?? 0) <= (existing.metrics.views ?? 0)) continue;
    }
    byUrl.set(url, signal);
  }
  return { signals: [...byUrl.values()], matchedHashtags: [...matched], dropped };
}

/** Pure: French warning summarising empty hashtags and filtered rows. */
export function instagramApifyWarning(
  hashtags: string[],
  result: NormalizeResult,
  errorRows: ApifyErrorRow[],
): string | undefined {
  const parts: string[] = [];
  const empty = hashtags.filter((tag) => !result.matchedHashtags.includes(tag));
  if (result.signals.length === 0) {
    parts.push(`Aucun reel de moins de ${MAX_AGE_DAYS} jours trouvé pour ${hashtags.map((t) => `#${t}`).join(", ")}.`);
  } else if (empty.length > 0) {
    parts.push(`Aucun reel récent pour ${empty.map((t) => `#${t}`).join(", ")}.`);
  }
  if (result.dropped.otherLanguage > 0) {
    parts.push(`${result.dropped.otherLanguage} reel(s) écarté(s) car la légende n'est visiblement pas en français.`);
  }
  if (errorRows.length > 0) {
    parts.push(`Apify a signalé ${errorRows.length} erreur(s) (hashtag vide, privé ou bloqué).`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export const instagramApifyConnector: SourceConnector = {
  id: "instagram_apify",
  meta: {
    label: "Instagram Reels (Apify)",
    platform: "instagram",
    free: false,
    needsKeywords: true,
    description:
      "Reels publiés ces 30 derniers jours sous vos hashtags de niche, avec leurs vraies vues, likes et commentaires publics (acteur Apify « Instagram Hashtag Scraper »). Instagram ne publie aucun classement « tendance » : les reels qui sortent du lot sont repérés en comparant leurs vues à celles des autres.",
    envVars: ["APIFY_TOKEN"],
    setup: [
      "Créez un compte sur https://apify.com (l'offre gratuite inclut 5 $ de crédit d'utilisation par mois).",
      "Dans la console Apify (https://console.apify.com), ouvrez Settings → API & Integrations.",
      "Copiez votre « Personal API token » (il commence par apify_api_).",
      "Ajoutez APIFY_TOKEN=votre_jeton dans le fichier .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
      "Optionnel : APIFY_MAX_CHARGE_USD fixe le coût maximal d'une exécution (0.5 $ par défaut).",
      "Saisissez vos mots-clés de niche dans le Radar : ils sont transformés en hashtags (accents et espaces retirés, 5 maximum).",
      "Le même jeton active aussi la source TikTok.",
    ],
    costNote:
      "Payant à l'usage : environ 2,60 $ pour 1 000 reels sur l'offre gratuite Apify (2,30 $ sur l'offre Starter à 19 $/mois). Une analyse = 5 hashtags × 20 reels maximum ≈ 0,26 $, plafonnée par APIFY_MAX_CHARGE_USD (0,50 $ par défaut) et mise en cache 6 h. Le crédit gratuit de 5 $/mois couvre environ 19 analyses ; sur l'offre gratuite, seule la première page de résultats de chaque hashtag est renvoyée. Données publiques collectées par Apify, hors API officielle d'Instagram.",
    docsUrl: "https://apify.com/apify/instagram-hashtag-scraper",
    ttlMs: 6 * 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.APIFY_TOKEN?.trim()),
  async fetch(ctx: SourceContext) {
    const input = buildInstagramApifyInput(ctx.keywords);
    if (input.hashtags.length === 0) {
      return {
        signals: [],
        warning: "Instagram (Apify) a besoin de mots-clés ou hashtags de niche pour chercher des reels.",
      };
    }
    const { items, errorRows } = await runApifyActorDetailed<ApifyInstagramItem>(INSTAGRAM_HASHTAG_ACTOR, input, {
      token: ctx.env.APIFY_TOKEN?.trim() ?? "",
      signal: ctx.signal,
      maxChargeUsd: apifyMaxChargeUsd(ctx.env),
      fields: INSTAGRAM_APIFY_FIELDS,
    });
    const result = normalizeInstagramItems(items, { now: ctx.now, hashtags: input.hashtags, language: ctx.language });
    return { signals: result.signals, warning: instagramApifyWarning(input.hashtags, result, errorRows) };
  },
};
