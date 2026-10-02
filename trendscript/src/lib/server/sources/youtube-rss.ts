/**
 * Keyless YouTube signal: the public Atom feeds of a curated list of French
 * news / explainer channels (`/feeds/videos.xml?channel_id=UC…`, last 15
 * uploads each, with public view and like counts). Zero quota, no account.
 *
 * It shows what the newsrooms that matter to a French audience are covering
 * right now — not what the whole of YouTube is watching.
 */

import { XMLParser } from "fast-xml-parser";
import type { Signal } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { SourceError, fetchText } from "../http";
import { errorMessage, extractHashtags, isRecent, mapWithConcurrency, toCount, toIso } from "./social-utils";
import type { Env, SourceConnector, SourceContext } from "./types";

export interface RssChannel {
  id: string;
  name: string;
}

/**
 * Default French channels. Every id was checked live on 2026-10-02: the feed
 * answered 200 with this exact channel title and uploads from the last 72 h.
 * Mix of youth digital media, TV news and newspapers across the spectrum.
 */
export const DEFAULT_FR_CHANNELS: RssChannel[] = [
  { id: "UCAcAnMF0OrCtUep3Y4M-ZPw", name: "HugoDécrypte - Actus du jour" },
  { id: "UCO6K_kkdP-lnSCiO3tPx7WA", name: "franceinfo" },
  { id: "UCYpRDnhk5H8h16jpS84uqsA", name: "Le Monde" },
  { id: "UCCDz_XYeKWd0OIyjp95dqyQ", name: "Le Figaro" },
  { id: "UCXwDLMDV86ldKoFVc_g8P0g", name: "BFMTV" },
  { id: "UCsrPUA0ZSDCNZC6wyRlR7ZA", name: "TF1 INFO" },
  { id: "UCfHn_8-ehdem86fEvlFg-Gw", name: "Le Parisien" },
  { id: "UCSKdvgqdnj72_SLggp7BDTg", name: "Brut" },
  { id: "UCHQda5vLxrH0Ff0I0kMq4zw", name: "Konbini" },
  { id: "UC9GGzAhhvhJO1hL10-BcgNA", name: "LeHuffPost" },
];

/** Countries where the French default list is a natural fit. */
const FRANCOPHONE_EUROPE = new Set(["FR", "BE", "CH", "LU", "MC"]);
export const MAX_RSS_CHANNELS = 10;
const MAX_AGE_MS = 72 * 3_600_000;
const CHANNEL_ID = /^UC[\w-]{22}$/;

export function feedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export interface ChannelSelection {
  channels: RssChannel[];
  warning?: string;
}

/** Pure: channels to read — `YOUTUBE_RSS_CHANNELS` override, else the French list for `fr`. */
export function resolveRssChannels(env: Env, language: string, geo: string): ChannelSelection {
  const override = env.YOUTUBE_RSS_CHANNELS?.trim();
  if (override) {
    const ids = [...new Set(override.split(/[\s,;]+/).filter(Boolean))];
    const valid = ids.filter((id) => CHANNEL_ID.test(id));
    const invalid = ids.filter((id) => !CHANNEL_ID.test(id));
    const notes: string[] = [];
    if (invalid.length) notes.push(`Identifiant(s) de chaîne ignoré(s) dans YOUTUBE_RSS_CHANNELS : ${invalid.slice(0, 5).join(", ")} (format attendu : UC… sur 24 caractères).`);
    if (valid.length > MAX_RSS_CHANNELS) notes.push(`Seules les ${MAX_RSS_CHANNELS} premières chaînes de YOUTUBE_RSS_CHANNELS sont lues.`);
    return {
      channels: valid.slice(0, MAX_RSS_CHANNELS).map((id) => ({ id, name: id })),
      warning: notes.length ? notes.join(" ") : undefined,
    };
  }
  if (language.toLowerCase() !== "fr") {
    return {
      channels: [],
      warning: `Pas de liste de chaînes par défaut pour la langue « ${language} » : renseignez YOUTUBE_RSS_CHANNELS (identifiants UC… séparés par des virgules).`,
    };
  }
  return {
    channels: DEFAULT_FR_CHANNELS,
    warning: FRANCOPHONE_EUROPE.has(geo.toUpperCase())
      ? undefined
      : "Chaînes d'actualité françaises (France) : renseignez YOUTUBE_RSS_CHANNELS pour suivre des chaînes de votre pays.",
  };
}

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

export interface FeedVideo {
  videoId: string;
  channelId?: string;
  channelTitle?: string;
  title: string;
  url: string;
  publishedAt?: string;
  description?: string;
  thumbnailUrl?: string;
  views?: number;
  /** `media:starRating@count` ≈ likes. */
  likes?: number;
  /** Exact for channel feeds: Shorts link to /shorts/{id}. */
  isShort: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep numeric-looking titles ("2026") as strings.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "entry" || name === "link",
});

type XmlNode = Record<string, unknown>;

function asNode(value: unknown): XmlNode | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlNode) : undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  const node = asNode(value);
  return typeof node?.["#text"] === "string" ? (node["#text"] as string) || undefined : undefined;
}

function alternateLink(entry: XmlNode): string | undefined {
  const links = Array.isArray(entry.link) ? (entry.link as unknown[]) : [];
  for (const link of links) {
    const node = asNode(link);
    const href = node?.["@_href"];
    if (typeof href === "string" && (node?.["@_rel"] === "alternate" || node?.["@_rel"] === undefined)) return href;
  }
  return undefined;
}

/** Pure: Atom feed XML → videos. Throws SourceError when the document is not a YouTube feed. */
export function parseYoutubeFeed(xml: string): FeedVideo[] {
  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch {
    throw new SourceError("Flux YouTube illisible (XML invalide)");
  }
  const feed = asNode(doc.feed);
  if (!feed) throw new SourceError("Flux YouTube inattendu (pas de <feed>)");
  const feedTitle = asText(feed.title);
  const entries = Array.isArray(feed.entry) ? (feed.entry as unknown[]) : [];

  const videos: FeedVideo[] = [];
  for (const raw of entries) {
    const entry = asNode(raw);
    if (!entry) continue;
    const videoId = asText(entry["yt:videoId"]);
    const title = asText(entry.title);
    if (!videoId || !title) continue;
    const link = alternateLink(entry);
    const group = asNode(entry["media:group"]);
    const community = asNode(group?.["media:community"]);
    const thumbnail = asNode(group?.["media:thumbnail"]);
    videos.push({
      videoId,
      channelId: asText(entry["yt:channelId"]),
      channelTitle: asText(asNode(entry.author)?.name) ?? feedTitle,
      title,
      url: link ?? `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: toIso(asText(entry.published)),
      description: asText(group?.["media:description"]),
      thumbnailUrl: typeof thumbnail?.["@_url"] === "string" ? (thumbnail["@_url"] as string) : undefined,
      views: toCount(asNode(community?.["media:statistics"])?.["@_views"]),
      likes: toCount(asNode(community?.["media:starRating"])?.["@_count"]),
      isShort: /\/shorts\//.test(link ?? ""),
    });
  }
  return videos;
}

/** Pure: feed videos → signals, keeping the last 72 h. */
export function feedVideosToSignals(videos: FeedVideo[], now: number): Signal[] {
  return videos
    .filter((video) => video.publishedAt && isRecent(video.publishedAt, now, MAX_AGE_MS))
    .map((video) => ({
      id: `youtube_rss:${shortHash(video.url)}`,
      source: "youtube_rss" as const,
      platform: "youtube" as const,
      kind: video.isShort ? ("short_video" as const) : ("video" as const),
      title: video.title,
      text: truncate(video.description),
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      author: video.channelTitle,
      publishedAt: video.publishedAt,
      metrics: { views: video.views, likes: video.likes },
      tags: extractHashtags(`${video.title} ${video.description ?? ""}`, 10),
      related: [],
      strength: 0,
    }));
}

async function fetchFeed(channel: RssChannel, signal: AbortSignal): Promise<FeedVideo[]> {
  const load = () =>
    fetchText(feedUrl(channel.id), `Flux YouTube ${channel.name}`, {
      signal,
      timeoutMs: 15_000,
      headers: { Accept: "application/atom+xml, application/xml;q=0.9" },
    });
  let xml: string;
  try {
    xml = await load();
  } catch (error) {
    // Feeds fail intermittently (404/5xx): one retry, unless we were cancelled.
    if (signal.aborted) throw error;
    xml = await load();
  }
  return parseYoutubeFeed(xml);
}

export const youtubeRssConnector: SourceConnector = {
  id: "youtube_rss",
  meta: {
    label: "YouTube – chaînes d'actualité (RSS)",
    platform: "youtube",
    free: true,
    needsKeywords: false,
    description:
      "Vidéos et Shorts publiés ces 72 dernières heures par une sélection de chaînes d'info et de vulgarisation françaises (HugoDécrypte, franceinfo, Le Monde, Le Figaro, BFMTV, TF1 INFO, Le Parisien, Brut, Konbini, HuffPost), avec leurs vues et likes publics. Montre ce que couvrent les médias, pas ce que tout YouTube regarde.",
    envVars: [],
    setup: [
      "Rien à configurer : la source est gratuite, sans clé ni compte.",
      "Optionnel : pour suivre vos propres chaînes, renseignez YOUTUBE_RSS_CHANNELS avec leurs identifiants séparés par des virgules (10 maximum).",
      "Pour trouver l'identifiant d'une chaîne : ouvrez la chaîne sur YouTube, cliquez sur la description (« …plus »), puis « Partager la chaîne » → « Copier l'ID de la chaîne » (il commence par UC).",
      "Sans YOUTUBE_RSS_CHANNELS, la liste par défaut n'est utilisée que pour la langue française.",
    ],
    costNote: "Gratuit et sans quota : flux RSS publics de YouTube (15 dernières vidéos par chaîne).",
    docsUrl: feedUrl(DEFAULT_FR_CHANNELS[0].id),
    ttlMs: 30 * 60 * 1000,
  },
  isConfigured: () => true,
  async fetch(ctx: SourceContext) {
    const { channels, warning } = resolveRssChannels(ctx.env, ctx.language, ctx.geo);
    if (channels.length === 0) return { signals: [], warning };

    const results = await mapWithConcurrency(channels, 4, (channel) => fetchFeed(channel, ctx.signal));
    const signals: Signal[] = [];
    const failed: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") signals.push(...feedVideosToSignals(result.value, ctx.now));
      else failed.push(channels[i].name);
    });

    if (failed.length === channels.length) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw new SourceError(`Aucun flux YouTube n'a répondu (${errorMessage(first?.reason)})`, undefined, true);
    }
    const notes = [warning];
    if (failed.length) notes.push(`Flux indisponible(s) : ${failed.join(", ")}.`);
    if (signals.length === 0) notes.push("Aucune vidéo publiée ces 72 dernières heures par les chaînes suivies.");
    const text = notes.filter(Boolean).join(" ");
    return { signals, warning: text || undefined };
  },
};
