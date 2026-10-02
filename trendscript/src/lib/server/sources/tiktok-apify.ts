/**
 * TikTok through Apify (TikTok has no trends API open to commercial users;
 * the Creative Center's own JSON endpoint now answers "no permission"):
 *
 * (a) always — `clockworks/tiktok-trends-scraper`: the Creative Center's
 *     trending hashtags for the country over 7 days (TikTok's own ranking).
 * (b) with keywords — `clockworks/tiktok-scraper`: most-liked videos of the
 *     past week for up to 3 niche keywords, with real counters.
 *
 * Both runs are independent: one failing only adds a warning.
 */

import type { RelatedLink, Signal } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { SourceError } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "./apify";
import { DAY_MS, captionTitle, errorMessage, isRecent, normalizeTag, toCount, toIso, uniqueTags } from "./social-utils";
import type { Env, SourceConnector, SourceContext, SourceFetchResult } from "./types";

export const TIKTOK_TRENDS_ACTOR = "clockworks~tiktok-trends-scraper";
export const TIKTOK_SEARCH_ACTOR = "clockworks~tiktok-scraper";
const TRENDING_HASHTAGS = 50;
const MAX_QUERIES = 3;
const VIDEOS_PER_QUERY = 15;

/** Countries accepted by the trends actor's `adsCountryCode` (from its input schema, 2026-09-30 build). */
export const TIKTOK_TRENDS_COUNTRIES = new Set(
  "AR AU AT BH BD BY BE BR BG KH CA CL CO HR CZ DK EG EE FI FR DE GR HU IS ID IQ IE IL IT JP JO KZ KW LV LB LT LU MO MY MX MA MM NL NZ NG NO OM PK PE PH PL PT QA RO SA SG SK ZA KR ES SE CH TW TH TR UA AE GB US UZ VN".split(
    " ",
  ),
);

/** Actor ids can be swapped (e.g. the cheaper `clockworks~free-tiktok-scraper`, same input). */
export function tiktokActors(env: Env) {
  return {
    trends: env.APIFY_TIKTOK_TRENDS_ACTOR?.trim() || TIKTOK_TRENDS_ACTOR,
    search: env.APIFY_TIKTOK_ACTOR?.trim() || TIKTOK_SEARCH_ACTOR,
  };
}

// ---------------------------------------------------------------------------
// (a) Creative Center trending hashtags
// ---------------------------------------------------------------------------

/** Pure: trends actor input — hashtags only, 7 days, for the country. */
export function buildTiktokTrendsInput(geo: string) {
  return {
    adsScrapeHashtags: true,
    adsCountryCode: geo,
    adsTimeRange: "7",
    resultsPerPage: TRENDING_HASHTAGS,
    adsScrapeSounds: false,
    adsScrapeCreators: false,
    adsScrapeVideos: false,
  };
}

/** Output row of clockworks/tiktok-trends-scraper (hashtag fields we use). */
export interface ApifyTiktokTrendItem {
  id?: string;
  /** "hashtag" | "sound" | "creator" | "video" — absent on some hashtag rows. */
  type?: string;
  name?: string;
  url?: string;
  countryCode?: string;
  rank?: number;
  /** Positive = climbing in the ranking. */
  rankDiff?: number;
  markedAsNew?: boolean;
  isPromoted?: boolean;
  industryName?: string;
  videoCount?: number;
  viewCount?: number;
  trendingHistogram?: { date?: string; value?: number }[];
  relatedCreators?: { nickName?: string; profileUrl?: string }[];
}

/** Dataset fields we read (keeps the payload small; `error` needed to spot failed rows). */
export const TIKTOK_TRENDS_FIELDS = [
  "id",
  "type",
  "name",
  "url",
  "countryCode",
  "rank",
  "rankDiff",
  "markedAsNew",
  "isPromoted",
  "industryName",
  "videoCount",
  "viewCount",
  "trendingHistogram",
  "relatedCreators",
  "error",
];

/** Creative Center page listing the trends of a country (the old /inspiration/ URL redirects here). */
export function creativeCenterUrl(geo: string): string {
  return `https://ads.tiktok.com/creative/creativeCenter/trends?countryCode=${encodeURIComponent(geo)}&period=7`;
}

/**
 * Growth of the hashtag's own popularity curve over the period (%), from
 * the mean of the first two points to the mean of the last two. Undefined
 * when the curve is missing or starts at zero — never invented from rankDiff.
 */
export function histogramIncreasePct(histogram: ApifyTiktokTrendItem["trendingHistogram"]): number | undefined {
  const values = (histogram ?? []).map((point) => toCount(point?.value)).filter((v): v is number => v !== undefined);
  if (values.length < 4) return undefined;
  const start = (values[0] + values[1]) / 2;
  const end = (values[values.length - 2] + values[values.length - 1]) / 2;
  if (start <= 0) return undefined;
  const pct = Math.round(((end - start) / start) * 100);
  return pct > 0 ? pct : undefined;
}

const fr = new Intl.NumberFormat("fr-FR");

function trendText(item: ApifyTiktokTrendItem, geo: string): string {
  const parts = [`Hashtag tendance TikTok (${item.countryCode || geo}, 7 jours)`];
  if (item.rank) {
    const diff = Number.isFinite(Number(item.rankDiff)) ? Number(item.rankDiff) : 0;
    parts.push(`rang ${item.rank}${diff > 0 ? ` (+${diff} places)` : diff < 0 ? ` (${diff} places)` : ""}`);
  }
  if (item.markedAsNew) parts.push("nouveau dans le top 100");
  const videos = toCount(item.videoCount);
  if (videos !== undefined) parts.push(`${fr.format(videos)} vidéos`);
  if (item.industryName) parts.push(`secteur : ${item.industryName}`);
  return parts.join(" · ");
}

/** Pure: trends dataset → `search_trend` signals (promoted entries dropped: they are paid, not organic). */
export function normalizeTiktokTrends(items: ApifyTiktokTrendItem[], geo: string): Signal[] {
  const signals: Signal[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.type && item.type !== "hashtag") continue;
    if (item.isPromoted) continue;
    const name = normalizeTag(item.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const url = item.url?.startsWith("https://") ? item.url : `https://www.tiktok.com/tag/${encodeURIComponent(name)}`;
    const histogram = item.trendingHistogram ?? [];
    const related: RelatedLink[] = [
      { title: `TikTok Creative Center – tendances ${geo}`, url: creativeCenterUrl(geo), source: "TikTok" },
      ...(item.relatedCreators ?? [])
        .filter((creator) => creator?.profileUrl?.startsWith("https://"))
        .slice(0, 3)
        .map((creator) => ({ title: creator.nickName || creator.profileUrl!, url: creator.profileUrl!, source: "TikTok" })),
    ];

    signals.push({
      id: `tiktok_apify:${shortHash(url)}`,
      source: "tiktok_apify",
      platform: "tiktok",
      kind: "search_trend",
      title: `#${name}`,
      text: trendText(item, geo),
      url,
      // Date of the latest point of TikTok's curve, i.e. how fresh the ranking is.
      publishedAt: toIso(histogram[histogram.length - 1]?.date),
      metrics: {
        views: toCount(item.viewCount),
        rank: toCount(item.rank),
        increasePct: histogramIncreasePct(histogram),
      },
      tags: [name],
      related,
      strength: 0,
    });
  }
  return signals;
}

// ---------------------------------------------------------------------------
// (b) Keyword video search
// ---------------------------------------------------------------------------

/** Pure: search actor input — most-liked videos of the past week, no downloads. */
export function buildTiktokSearchInput(keywords: string[]) {
  const searchQueries = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, MAX_QUERIES);
  return {
    searchQueries,
    searchSection: "/video",
    videoSearchSorting: "MOST_LIKED",
    videoSearchDateFilter: "PAST_WEEK",
    resultsPerPage: VIDEOS_PER_QUERY,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  };
}

export const TIKTOK_SEARCH_FIELDS = [
  "id",
  "text",
  "textLanguage",
  "createTime",
  "createTimeISO",
  "webVideoUrl",
  "isAd",
  "isSponsored",
  "isSlideshow",
  "isPinned",
  "playCount",
  "diggCount",
  "shareCount",
  "commentCount",
  "collectCount",
  "authorMeta",
  "musicMeta",
  "videoMeta",
  "hashtags",
  "searchQuery",
  "input",
  "url",
  "error",
  "errorCode",
];

/** Output row of clockworks/tiktok-scraper (fields we use). */
export interface ApifyTiktokVideoItem {
  id?: string;
  text?: string;
  /** ISO 639-1, "un" = unknown. */
  textLanguage?: string;
  createTime?: number;
  createTimeISO?: string;
  webVideoUrl?: string;
  isAd?: boolean;
  isSponsored?: boolean;
  isSlideshow?: boolean;
  isPinned?: boolean;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  collectCount?: number;
  authorMeta?: { name?: string; nickName?: string; fans?: number };
  musicMeta?: { musicName?: string; musicAuthor?: string; musicOriginal?: boolean };
  videoMeta?: { duration?: number; coverUrl?: string };
  hashtags?: { name?: string }[];
  searchQuery?: string;
  input?: string;
}

export interface TiktokVideoOptions {
  now: number;
  language: string;
}

export interface TiktokVideoResult {
  signals: Signal[];
  dropped: { otherLanguage: number; tooOld: number; ads: number };
}

/** Pure: search dataset → `short_video` signals (ads dropped, other languages dropped, ≤ 8 days). */
export function normalizeTiktokVideos(items: ApifyTiktokVideoItem[], { now, language }: TiktokVideoOptions): TiktokVideoResult {
  const dropped = { otherLanguage: 0, tooOld: 0, ads: 0 };
  const byUrl = new Map<string, Signal>();
  for (const item of items) {
    const url = item.webVideoUrl;
    if (!url?.startsWith("https://www.tiktok.com/")) continue;
    if (item.isAd) {
      dropped.ads++;
      continue;
    }
    const lang = item.textLanguage?.toLowerCase();
    if (lang && lang !== "un" && !lang.startsWith(language.toLowerCase())) {
      dropped.otherLanguage++;
      continue;
    }
    const publishedAt = toIso(item.createTimeISO) ?? toIso(item.createTime);
    if (!isRecent(publishedAt, now, 8 * DAY_MS)) {
      dropped.tooOld++;
      continue;
    }
    if (byUrl.has(url)) continue;

    const handle = item.authorMeta?.name;
    const author = handle ? `@${handle}` : item.authorMeta?.nickName;
    const music = item.musicMeta;
    const musicLabel =
      music && music.musicOriginal === false && music.musicName
        ? `Son : « ${music.musicName} »${music.musicAuthor ? ` – ${music.musicAuthor}` : ""}`
        : undefined;
    const duration = toCount(item.videoMeta?.duration);
    byUrl.set(url, {
      id: `tiktok_apify:${shortHash(url)}`,
      source: "tiktok_apify",
      platform: "tiktok",
      kind: "short_video",
      title: captionTitle(item.text, `Vidéo TikTok de ${author ?? "un créateur"}`),
      text:
        [
          truncate(item.text, musicLabel ? 420 : 500),
          musicLabel,
          item.isSlideshow ? "Carrousel photo" : undefined,
          item.isSponsored ? "Contenu sponsorisé" : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      url,
      thumbnailUrl: item.videoMeta?.coverUrl,
      author,
      publishedAt,
      metrics: {
        views: toCount(item.playCount),
        likes: toCount(item.diggCount),
        comments: toCount(item.commentCount),
        shares: toCount(item.shareCount),
        saves: toCount(item.collectCount),
        followers: toCount(item.authorMeta?.fans),
        // Slideshows report 0 s.
        durationSec: duration ? Math.round(duration) : undefined,
      },
      tags: uniqueTags((item.hashtags ?? []).map((tag) => tag?.name)),
      related: [],
      query: item.searchQuery ?? item.input,
      strength: 0,
    });
  }
  return { signals: [...byUrl.values()], dropped };
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

function errorRowsNote(rows: ApifyErrorRow[]): string | undefined {
  return rows.length ? `Apify a signalé ${rows.length} erreur(s) sur la recherche de vidéos.` : undefined;
}

export async function fetchTiktok(ctx: SourceContext): Promise<SourceFetchResult> {
  const actors = tiktokActors(ctx.env);
  const options = { token: ctx.env.APIFY_TOKEN?.trim() ?? "", signal: ctx.signal, maxChargeUsd: apifyMaxChargeUsd(ctx.env) };
  const warnings: string[] = [];
  const geo = ctx.geo.toUpperCase();

  const trendsSupported = TIKTOK_TRENDS_COUNTRIES.has(geo);
  if (!trendsSupported) {
    warnings.push(`Le TikTok Creative Center ne fournit pas de hashtags tendance pour le pays « ${geo} ».`);
  }
  const searchInput = buildTiktokSearchInput(ctx.keywords);

  const [trends, videos] = await Promise.allSettled([
    trendsSupported
      ? runApifyActorDetailed<ApifyTiktokTrendItem>(actors.trends, buildTiktokTrendsInput(geo), {
          ...options,
          fields: TIKTOK_TRENDS_FIELDS,
        })
      : Promise.resolve(null),
    searchInput.searchQueries.length > 0
      ? runApifyActorDetailed<ApifyTiktokVideoItem>(actors.search, searchInput, { ...options, fields: TIKTOK_SEARCH_FIELDS })
      : Promise.resolve(null),
  ]);

  const signals: Signal[] = [];
  const failures: unknown[] = [];

  if (trends.status === "fulfilled" && trends.value) {
    const trendSignals = normalizeTiktokTrends(trends.value.items, geo);
    signals.push(...trendSignals);
    if (trendSignals.length === 0) warnings.push(`Aucun hashtag tendance renvoyé par le Creative Center pour ${geo}.`);
  } else if (trends.status === "rejected") {
    failures.push(trends.reason);
    warnings.push(`Hashtags tendance indisponibles : ${errorMessage(trends.reason)}`);
  }

  if (videos.status === "fulfilled" && videos.value) {
    const result = normalizeTiktokVideos(videos.value.items, { now: ctx.now, language: ctx.language });
    signals.push(...result.signals);
    if (result.signals.length === 0) {
      warnings.push(`Aucune vidéo TikTok récente trouvée pour ${searchInput.searchQueries.join(", ")}.`);
    }
    if (result.dropped.otherLanguage > 0) {
      warnings.push(`${result.dropped.otherLanguage} vidéo(s) écartée(s) car publiées dans une autre langue.`);
    }
    const note = errorRowsNote(videos.value.errorRows);
    if (note) warnings.push(note);
  } else if (videos.status === "rejected") {
    failures.push(videos.reason);
    warnings.push(`Recherche de vidéos indisponible : ${errorMessage(videos.reason)}`);
  } else if (searchInput.searchQueries.length === 0) {
    warnings.push("Ajoutez des mots-clés pour obtenir aussi les vidéos TikTok les plus likées de la semaine sur votre niche.");
  }

  const attempted = Number(trendsSupported) + Number(searchInput.searchQueries.length > 0);
  if (attempted > 0 && failures.length === attempted) {
    // Nothing worked: surface the first real error (invalid token, no credit…).
    const first = failures[0];
    throw first instanceof SourceError ? first : new SourceError(errorMessage(first));
  }
  return { signals, warning: warnings.length ? warnings.join(" ") : undefined };
}

export const tiktokApifyConnector: SourceConnector = {
  id: "tiktok_apify",
  meta: {
    label: "TikTok (Apify)",
    platform: "tiktok",
    free: false,
    needsKeywords: false,
    description:
      "Hashtags tendance du TikTok Creative Center pour votre pays sur 7 jours (classement de TikTok, vues cumulées) et, avec vos mots-clés, les vidéos les plus likées de la semaine avec leurs vraies statistiques. Données publiques collectées via Apify : TikTok n'ouvre pas son API de tendances aux usages commerciaux.",
    envVars: ["APIFY_TOKEN"],
    setup: [
      "Créez un compte sur https://apify.com (l'offre gratuite inclut 5 $ de crédit d'utilisation par mois).",
      "Dans la console Apify (https://console.apify.com), ouvrez Settings → API & Integrations.",
      "Copiez votre « Personal API token » (il commence par apify_api_).",
      "Ajoutez APIFY_TOKEN=votre_jeton dans le fichier .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
      "Optionnel : APIFY_MAX_CHARGE_USD fixe le coût maximal de chaque exécution (0.5 $ par défaut — c'est aussi le minimum accepté par ces acteurs).",
      "Optionnel : APIFY_TIKTOK_ACTOR=clockworks~free-tiktok-scraper utilise une variante moins chère pour la recherche de vidéos.",
      "Le même jeton active aussi la source Instagram (Apify).",
    ],
    costNote:
      "Payant à l'usage : environ 3,70 $ pour 1 000 résultats sur l'offre gratuite Apify (3 $ sur l'offre Starter à 19 $/mois), plus 1,30 $ pour 1 000 par filtre de tri ou de date. Une analyse ≈ 0,19 $ pour 50 hashtags tendance + ≈ 0,28 $ pour 3 mots-clés × 15 vidéos, chaque exécution étant plafonnée par APIFY_MAX_CHARGE_USD (0,50 $ par défaut) et mise en cache 6 h. Le crédit gratuit de 5 $/mois couvre environ 10 analyses avec mots-clés.",
    docsUrl: "https://apify.com/clockworks/tiktok-trends-scraper",
    ttlMs: 6 * 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.APIFY_TOKEN?.trim()),
  fetch: fetchTiktok,
};
