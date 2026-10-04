/**
 * YouTube channel → recent videos with their public counters.
 *
 * With `YOUTUBE_API_KEY` (3 quota units, no `search.list`):
 *   channels.list (forHandle | id) → uploads playlist → playlistItems.list
 *   (≤ 50 ids) → videos.list (snippet, statistics, contentDetails).
 *   The keyless RSS feed is read alongside: its links tell Shorts
 *   (`/shorts/{id}`) from long videos exactly for the 15 latest uploads.
 *
 * Without a key: the public channel page (channel id, subscriber and video
 * counts as displayed, bio) + the official RSS feed (15 latest uploads with
 * views and likes). Subscriber counts are read from the page *header* only:
 * the featured-channels shelf of the same page carries other channels' counts.
 */

import type { CreatorAccount, CreatorData, CreatorPost } from "../../types";
import { truncate } from "../../analysis/text";
import { BROWSER_USER_AGENT, SourceError, fetchText, fetchWithTimeout } from "../http";
import {
  SHORT_MAX_SECONDS,
  YOUTUBE_API,
  buildYoutubeVideosUrl,
  isoDurationToSeconds,
  youtubeError,
  type YoutubeVideo,
  type YoutubeVideosResponse,
} from "../sources/youtube";
import { feedUrl, parseYoutubeFeed, type FeedVideo } from "../sources/youtube-rss";
import { errorMessage, extractHashtags, scrubSecrets, toCount, toIso } from "../sources/social-utils";
import { BIO_MAX, CAPTION_MAX, buildCreatorData, noAudienceWarning, plural, type FetchCreatorOptions } from "./common";
import { YOUTUBE_CHANNEL_ID, creatorProfileUrl } from "./handles";
import type { Env } from "../sources/types";

/** Entries in a channel's RSS feed. */
export const RSS_MAX_VIDEOS = 15;
export const YOUTUBE_API_SOURCE = "YouTube Data API (officielle)";
export const YOUTUBE_KEYLESS_SOURCE = "YouTube · page publique de la chaîne + flux RSS officiel";

/**
 * Headers for the public channel page: French labels (parsed below) and the
 * `SOCS` consent cookie, so EU servers get the page rather than the
 * consent.youtube.com interstitial.
 */
export const YOUTUBE_PAGE_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_USER_AGENT,
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml",
  Cookie: "SOCS=CAI",
};

/**
 * YouTube API Developer Policies (III.E.4): no derived metrics such as
 * views ÷ subscribers on other channels' data without the "derived
 * metrics" amendment, which the operator declares with
 * YT_DERIVED_METRICS_APPROVED=true.
 */
export function youtubeRatiosAllowed(env: Env): boolean {
  return env.YT_DERIVED_METRICS_APPROVED?.trim() === "true";
}

export const YOUTUBE_RATIOS_DISABLED =
  "YouTube : les ratios (vues ÷ abonnés) sont désactivés — les règles développeurs de YouTube les interdisent sans l'avenant « derived metrics » (YT_DERIVED_METRICS_APPROVED). Chiffres bruts uniquement.";

function policyWarning(env: Env): string | undefined {
  return youtubeRatiosAllowed(env) ? undefined : YOUTUBE_RATIOS_DISABLED;
}

function notFound(handle: string): SourceError {
  const shown = YOUTUBE_CHANNEL_ID.test(handle) ? handle : `@${handle}`;
  return new SourceError(`Compte introuvable sur YouTube : vérifiez le pseudo (${shown}).`, 404);
}

function shownHandle(handle: string): string {
  return YOUTUBE_CHANNEL_ID.test(handle) ? `la chaîne ${handle}` : `@${handle}`;
}

// ---------------------------------------------------------------------------
// Public channel page (pure parsing)
// ---------------------------------------------------------------------------

const MULTIPLIERS: [RegExp, number][] = [
  [/^(milliards?|md|billions?|b)$/i, 1e9],
  [/^(millions?|m)$/i, 1e6],
  [/^(mille|k|thousand)$/i, 1e3],
];

/**
 * Count label as displayed by YouTube → number: "20,2 millions d’abonnés",
 * "882 k abonnés", "1 896 vidéos", "5.1M subscribers", "12,345 subscribers".
 */
export function parseCountLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const clean = label.replace(/[   ]/g, " ").trim();
  const match = clean.match(/(\d[\d .,]*)\s*(\p{L}+)?/u);
  if (!match) return undefined;
  const digits = match[1].trim();
  const multiplier = MULTIPLIERS.find(([pattern]) => pattern.test(match[2] ?? ""))?.[1];
  let value: number;
  if (multiplier) {
    // "20,2" / "5.1" / "1 234,5": spaces are thousands separators, the last , or . is the decimal mark.
    const normalized = digits.replace(/ /g, "").replace(/,(?=\d+$)/, ".").replace(/,/g, "");
    value = Number(normalized) * multiplier;
  } else {
    value = Number(digits.replace(/\D/g, ""));
  }
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function dig(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) current = record(current)?.[key];
  return current;
}

/** The `ytInitialData` JSON embedded in a YouTube page. */
function initialData(html: string): unknown {
  for (const marker of ["var ytInitialData = ", 'window["ytInitialData"] = ']) {
    const start = html.indexOf(marker);
    if (start < 0) continue;
    const from = start + marker.length;
    const end = html.indexOf(";</script>", from);
    if (end < 0) continue;
    try {
      return JSON.parse(html.slice(from, end));
    } catch {
      // try the next marker
    }
  }
  return undefined;
}

export interface YoutubeChannelPage {
  channelId: string;
  title?: string;
  description?: string;
  /** Handle without "@". */
  handle?: string;
  subscribers?: number;
  /** As displayed ("20,2 millions d’abonnés"). */
  subscribersLabel?: string;
  /** Rounded as displayed ("1,8 k vidéos" → 1800). */
  videoCount?: number;
  verified?: boolean;
}

/** Pure: channel page HTML → channel facts, or undefined when it is not a readable channel page. */
export function parseYoutubeChannelPage(html: string): YoutubeChannelPage | undefined {
  const data = initialData(html);
  const meta = record(dig(data, ["metadata", "channelMetadataRenderer"]));
  const channelId =
    text(meta?.externalId) ?? html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1];
  if (!channelId || !YOUTUBE_CHANNEL_ID.test(channelId)) return undefined;

  const header = record(dig(data, ["header", "pageHeaderRenderer", "content", "pageHeaderViewModel"]));
  const page: YoutubeChannelPage = {
    channelId,
    title: text(meta?.title) ?? text(dig(header, ["title", "dynamicTextViewModel", "text", "content"])),
    description: text(meta?.description),
  };

  for (const row of list(dig(header, ["metadata", "contentMetadataViewModel", "metadataRows"]))) {
    for (const part of list(record(row)?.metadataParts)) {
      const content = text(dig(part, ["text", "content"]));
      const label = text(record(part)?.accessibilityLabel) ?? content;
      if (!label) continue;
      if (content?.startsWith("@")) page.handle = content.slice(1);
      else if (/abonn|subscriber/i.test(label)) {
        page.subscribers = parseCountLabel(label);
        page.subscribersLabel = label.replace(/[  ]/g, " ");
      } else if (/vid[ée]o/i.test(label)) page.videoCount = parseCountLabel(label);
    }
  }
  if (!page.handle) {
    const vanity = text(meta?.vanityChannelUrl)?.match(/\/@([^/?#]+)/)?.[1];
    if (vanity) {
      try {
        page.handle = decodeURIComponent(vanity);
      } catch {
        page.handle = vanity;
      }
    }
  }
  // The verified badge is an icon attached to the channel name.
  if (JSON.stringify(header?.title ?? "").includes('"CHECK_CIRCLE_FILLED"')) page.verified = true;
  return page;
}

/** Pure: RSS feed videos → posts (views and likes; no comments or duration in the feed). */
export function feedVideosToCreatorPosts(videos: FeedVideo[]): CreatorPost[] {
  return videos.map((video) => ({
    id: video.videoId,
    url: video.url,
    title: video.title,
    text: truncate(video.description, CAPTION_MAX),
    publishedAt: video.publishedAt,
    kind: video.isShort ? ("short_video" as const) : ("video" as const),
    metrics: { views: video.views, likes: video.likes },
    hashtags: extractHashtags(`${video.title} ${video.description ?? ""}`),
  }));
}

export function pageToAccount(page: YoutubeChannelPage, handle: string): CreatorAccount {
  const accountHandle = page.handle ?? (YOUTUBE_CHANNEL_ID.test(handle) ? page.channelId : handle);
  return {
    platform: "youtube",
    handle: accountHandle,
    displayName: page.title,
    url: creatorProfileUrl("youtube", accountHandle),
    followers: page.subscribers,
    totalPosts: page.videoCount,
    bio: truncate(page.description, BIO_MAX),
    verified: page.verified,
  };
}

// ---------------------------------------------------------------------------
// Channel "Vidéos" and "Shorts" tabs (pure parsing) — the fallback when the
// RSS feed keeps failing: views rounded as displayed ("16 M"), durations of
// long videos, but no exact date, likes or comments.
// ---------------------------------------------------------------------------

export type YoutubeTab = "videos" | "shorts";

export interface YoutubeTabVideo {
  videoId: string;
  title: string;
  isShort: boolean;
  /** Rounded as displayed ("16 M" → 16 000 000). */
  views?: number;
  durationSec?: number;
  /** As displayed, long videos only ("il y a 1 mois"). */
  ageLabel?: string;
}

function collect(value: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, out);
  } else if (value && typeof value === "object") {
    for (const [name, child] of Object.entries(value)) {
      if (name === key) out.push(child);
      collect(child, key, out);
    }
  }
  return out;
}

/** "1:12:10" → 4330, "48:09" → 2889. */
export function clockToSeconds(label: string | undefined): number | undefined {
  const match = label?.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;
const VIEWS_WORD = /\b(vues?|views?)\b/i;
const AGE_WORDS = /\b(il y a|ago|diffus|streamed|premiered|premi[eè]re)\b/i;

/** The content of the page's selected tab when it is `tab` (a channel without that tab serves its home page). */
function selectedTabContent(data: unknown, tab: YoutubeTab): unknown {
  for (const entry of list(dig(data, ["contents", "twoColumnBrowseResultsRenderer", "tabs"]))) {
    const renderer = record(record(entry)?.tabRenderer);
    if (renderer?.selected !== true) continue;
    const url = text(dig(renderer, ["endpoint", "commandMetadata", "webCommandMetadata", "url"]));
    return url?.replace(/[?#].*$/, "").endsWith(`/${tab}`) ? renderer.content : undefined;
  }
  return undefined;
}

/** Pure: a channel tab page → its videos in display order (newest first). */
export function parseYoutubeTab(html: string, tab: YoutubeTab): YoutubeTabVideo[] {
  const data = selectedTabContent(initialData(html), tab);
  const videos: YoutubeTabVideo[] = [];
  const seen = new Set<string>();
  const add = (video: YoutubeTabVideo) => {
    if (!YOUTUBE_VIDEO_ID.test(video.videoId) || seen.has(video.videoId) || !video.title.trim()) return;
    seen.add(video.videoId);
    videos.push(video);
  };

  if (tab === "videos") {
    for (const lockup of collect(data, "lockupViewModel")) {
      const item = record(lockup);
      if (item?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") continue;
      const meta = record(dig(item, ["metadata", "lockupMetadataViewModel"]));
      const title = text(dig(meta, ["title", "content"]));
      const videoId = text(item.contentId);
      if (!title || !videoId) continue;
      let views: number | undefined;
      let ageLabel: string | undefined;
      for (const row of list(dig(meta, ["metadata", "contentMetadataViewModel", "metadataRows"]))) {
        for (const part of list(record(row)?.metadataParts)) {
          const label = (text(record(part)?.accessibilityLabel) ?? text(dig(part, ["text", "content"])))?.replace(/[  ]/g, " ");
          if (!label) continue;
          if (VIEWS_WORD.test(label) && views === undefined) views = parseCountLabel(label);
          else if (AGE_WORDS.test(label) && !ageLabel) ageLabel = label;
        }
      }
      // A live or scheduled stream has no view count yet: not a published video.
      if (views === undefined) continue;
      const badges = collect(item.contentImage, "thumbnailBadgeViewModel").map((badge) => text(record(badge)?.text));
      const durationSec = badges.map(clockToSeconds).find((seconds) => seconds !== undefined);
      add({ videoId, title, isShort: false, views, durationSec, ageLabel });
    }
  } else {
    for (const lockup of collect(data, "shortsLockupViewModel")) {
      const item = record(lockup);
      const videoId =
        text(dig(item, ["onTap", "innertubeCommand", "reelWatchEndpoint", "videoId"])) ??
        text(item?.entityId)?.replace(/^shorts-shelf-item-/, "");
      const title = text(dig(item, ["overlayMetadata", "primaryText", "content"]));
      const viewsLabel = text(dig(item, ["overlayMetadata", "secondaryText", "content"]));
      if (!videoId || !title) continue;
      add({ videoId, title, isShort: true, views: viewsLabel && VIEWS_WORD.test(viewsLabel) ? parseCountLabel(viewsLabel) : undefined });
    }
  }
  return videos;
}

/**
 * Pure: tab videos → posts. Long videos and Shorts alternate in halves of
 * `max` (each tab is newest first, but the two cannot be interleaved by date).
 */
export function tabVideosToCreatorPosts(long: YoutubeTabVideo[], shorts: YoutubeTabVideo[], max: number): CreatorPost[] {
  const longCount = Math.min(long.length, Math.max(Math.ceil(max / 2), max - shorts.length));
  const picked = [...long.slice(0, longCount), ...shorts.slice(0, Math.max(0, max - longCount))];
  return picked.map((video) => ({
    id: video.videoId,
    url: video.isShort ? `https://www.youtube.com/shorts/${video.videoId}` : `https://www.youtube.com/watch?v=${video.videoId}`,
    title: video.title,
    kind: video.isShort ? ("short_video" as const) : ("video" as const),
    durationSec: video.durationSec,
    metrics: { views: video.views },
    hashtags: extractHashtags(video.title),
  }));
}

// ---------------------------------------------------------------------------
// YouTube Data API (pure builders and mappers)
// ---------------------------------------------------------------------------

export interface YoutubeChannel {
  id?: string;
  snippet?: { title?: string; description?: string; customUrl?: string; publishedAt?: string; country?: string };
  /** Counters are JSON strings; subscriberCount is rounded to 3 significant figures. */
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface YoutubeChannelsResponse {
  items?: YoutubeChannel[];
}

export interface YoutubePlaylistItemsResponse {
  items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[];
}

/** channels.list for a handle ("@x") or a channel id — 1 unit. */
export function buildYoutubeChannelUrl(handle: string, apiKey: string): string {
  const params = new URLSearchParams({ part: "snippet,statistics,contentDetails" });
  if (YOUTUBE_CHANNEL_ID.test(handle)) params.set("id", handle);
  else params.set("forHandle", `@${handle}`);
  params.set("key", apiKey);
  return `${YOUTUBE_API}/channels?${params}`;
}

/** playlistItems.list on the uploads playlist (newest first) — 1 unit. */
export function buildYoutubePlaylistItemsUrl(playlistId: string, maxResults: number, apiKey: string): string {
  const params = new URLSearchParams({
    part: "contentDetails",
    playlistId,
    maxResults: String(Math.min(50, Math.max(1, maxResults))),
    key: apiKey,
  });
  return `${YOUTUBE_API}/playlistItems?${params}`;
}

export function uploadsPlaylistId(channel: YoutubeChannel): string | undefined {
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) return uploads;
  return channel.id && YOUTUBE_CHANNEL_ID.test(channel.id) ? `UU${channel.id.slice(2)}` : undefined;
}

export function playlistVideoIds(response: YoutubePlaylistItemsResponse): string[] {
  const ids = (response.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

export function youtubeChannelToAccount(channel: YoutubeChannel, handle: string): CreatorAccount {
  const customHandle = channel.snippet?.customUrl?.startsWith("@") ? channel.snippet.customUrl.slice(1) : undefined;
  const accountHandle = YOUTUBE_CHANNEL_ID.test(handle) ? (customHandle ?? channel.id ?? handle) : handle;
  return {
    platform: "youtube",
    handle: accountHandle,
    displayName: channel.snippet?.title,
    url: creatorProfileUrl("youtube", accountHandle),
    followers: channel.statistics?.hiddenSubscriberCount ? undefined : toCount(channel.statistics?.subscriberCount),
    totalPosts: toCount(channel.statistics?.videoCount),
    bio: truncate(channel.snippet?.description, BIO_MAX),
  };
}

export interface YoutubeVideoMapping {
  posts: CreatorPost[];
  /** Videos classified Short/long by duration because the RSS feed did not list them. */
  guessedFormat: number;
}

/**
 * Pure: videos.list items → posts. `shortFlags` (video id → is a Short) comes
 * from the RSS feed and is exact; other videos are classified by duration
 * (≤ 3 min ⇒ Short), which can mislabel a short horizontal video.
 */
export function youtubeVideosToCreatorPosts(videos: YoutubeVideo[], shortFlags: ReadonlyMap<string, boolean>): YoutubeVideoMapping {
  const posts: CreatorPost[] = [];
  let guessedFormat = 0;
  for (const video of videos) {
    const id = video.id;
    const snippet = video.snippet;
    if (!id || !snippet?.title || snippet.liveBroadcastContent === "upcoming") continue;
    const durationSec = isoDurationToSeconds(video.contentDetails?.duration);
    const flag = shortFlags.get(id);
    if (flag === undefined && durationSec !== undefined) guessedFormat++;
    const isShort = flag ?? (durationSec !== undefined && durationSec <= SHORT_MAX_SECONDS);
    posts.push({
      id,
      url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      title: snippet.title,
      text: truncate(snippet.description, CAPTION_MAX),
      publishedAt: toIso(snippet.publishedAt),
      kind: isShort ? "short_video" : "video",
      durationSec,
      metrics: {
        views: toCount(video.statistics?.viewCount),
        likes: toCount(video.statistics?.likeCount),
        comments: toCount(video.statistics?.commentCount),
      },
      hashtags: extractHashtags(`${snippet.title} ${snippet.description ?? ""}`),
    });
  }
  return { posts, guessedFormat };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function googleGet<T>(url: string, label: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal, timeoutMs: 20_000, headers: { Accept: "application/json" } });
  } catch (error) {
    const retryable = error instanceof SourceError ? error.retryable : true;
    throw new SourceError(`${label} : ${scrubSecrets(errorMessage(error))}`, undefined, retryable);
  }
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    const error = youtubeError(response.status, body, label);
    // youtubeError words quota errors for search.list; these calls use the 10 000-unit bucket.
    if (/^Quota YouTube/.test(error.message)) {
      throw new SourceError(
        "Quota quotidien de l'API YouTube atteint : réessayez après minuit heure du Pacifique (8 h ou 9 h à Paris).",
        response.status,
        true,
      );
    }
    throw error;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SourceError(`${label} a renvoyé une réponse JSON invalide`);
  }
}

/**
 * Retry budget for the RSS feed. Measured live on 2026-10-04: the feed
 * origin answers 404/500 for runs of up to ~10 s, then YouTube's edge keeps
 * serving the 200 it finally got — so spaced retries on the *same* URL work
 * (cache-busting parameters make it worse).
 */
export const FEED_RETRY_BUDGET_MS = 20_000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new SourceError("Requête annulée"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SourceError("Requête annulée"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Delay before retry n (1-based): 300, 500, 700, then 1 s. */
export function feedRetryDelay(attempt: number): number {
  return Math.min(1000, 100 + 200 * attempt);
}

async function loadFeed(channelId: string, signal: AbortSignal, budgetMs = FEED_RETRY_BUDGET_MS): Promise<FeedVideo[]> {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    try {
      const xml = await fetchText(feedUrl(channelId), "Flux RSS YouTube", {
        signal,
        timeoutMs: 15_000,
        headers: { Accept: "application/atom+xml, application/xml;q=0.9" },
      });
      return parseYoutubeFeed(xml);
    } catch (error) {
      const delay = feedRetryDelay(attempt);
      if (signal.aborted || Date.now() + delay >= deadline) throw error;
      await wait(delay, signal);
    }
  }
}

interface ChannelPageRead {
  page: YoutubeChannelPage;
  /** Latest long videos listed on the page (empty when it is not the "Vidéos" tab). */
  long: YoutubeTabVideo[];
}

/**
 * The channel's "Vidéos" tab: the same header as the home page at about a
 * third of its weight, plus the latest long videos (the RSS fallback). A
 * channel without that tab is read from its home page.
 */
async function loadChannelPage(handle: string, signal: AbortSignal): Promise<ChannelPageRead> {
  const home = creatorProfileUrl("youtube", handle);
  let response = await fetchWithTimeout(`${home}/videos`, { signal, timeoutMs: 20_000, headers: YOUTUBE_PAGE_HEADERS });
  if (response.status === 404) response = await fetchWithTimeout(home, { signal, timeoutMs: 20_000, headers: YOUTUBE_PAGE_HEADERS });
  if (response.status === 404) throw notFound(handle);
  if (!response.ok) {
    throw new SourceError(
      `La page YouTube de ${shownHandle(handle)} a répondu ${response.status} : réessayez plus tard ou ajoutez YOUTUBE_API_KEY.`,
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }
  if (/(^|\/\/)consent\.(youtube|google)\./.test(response.url)) {
    throw new SourceError(
      "YouTube demande d'accepter les cookies avant d'afficher la chaîne depuis ce serveur : ajoutez YOUTUBE_API_KEY (gratuite) pour passer par l'API officielle.",
    );
  }
  const html = await response.text();
  const page = parseYoutubeChannelPage(html);
  if (!page) {
    throw new SourceError(
      `Page YouTube de ${shownHandle(handle)} illisible (structure inattendue) : ajoutez YOUTUBE_API_KEY (gratuite) pour passer par l'API officielle.`,
    );
  }
  return { page, long: parseYoutubeTab(html, "videos") };
}

/** Feed budget when the channel tabs can take over (the API path keeps its own 3 s). */
export const KEYLESS_FEED_BUDGET_MS = 10_000;

/** The channel's "Shorts" tab (empty for a channel without Shorts). */
async function loadShorts(page: YoutubeChannelPage, signal: AbortSignal): Promise<YoutubeTabVideo[]> {
  const url = `${creatorProfileUrl("youtube", page.handle ?? page.channelId)}/shorts`;
  const response = await fetchWithTimeout(url, { signal, timeoutMs: 20_000, headers: YOUTUBE_PAGE_HEADERS });
  if (response.status === 404) return [];
  if (!response.ok) throw new SourceError(`onglet « Shorts » : erreur ${response.status}`, response.status);
  return parseYoutubeTab(await response.text(), "shorts");
}

async function fetchWithApi(handle: string, apiKey: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const { signal } = options;
  const channels = await googleGet<YoutubeChannelsResponse>(buildYoutubeChannelUrl(handle, apiKey), "YouTube (chaîne)", signal);
  const channel = channels.items?.find((item) => item.id);
  if (!channel?.id) throw notFound(handle);
  const playlistId = uploadsPlaylistId(channel);
  const account = youtubeChannelToAccount(channel, handle);

  const [playlist, feed] = await Promise.all([
    playlistId
      ? googleGet<YoutubePlaylistItemsResponse>(
          buildYoutubePlaylistItemsUrl(playlistId, options.maxPosts + 5, apiKey),
          "YouTube (vidéos de la chaîne)",
          signal,
        ).catch((error: unknown) => {
          // A channel without uploads has no uploads playlist (404 playlistNotFound).
          if (error instanceof SourceError && error.status === 404) return { items: [] } as YoutubePlaylistItemsResponse;
          throw error;
        })
      : Promise.resolve({ items: [] } as YoutubePlaylistItemsResponse),
    // Only used for the exact Shorts flag: a short budget, then the duration rule.
    loadFeed(channel.id, signal, 3_000).catch(() => [] as FeedVideo[]),
  ]);

  const ids = playlistVideoIds(playlist).slice(0, 50);
  if (ids.length === 0) throw new SourceError(`Aucune vidéo publique sur la chaîne YouTube ${shownHandle(account.handle)}.`);
  const videos = await googleGet<YoutubeVideosResponse>(buildYoutubeVideosUrl(ids, apiKey), "YouTube (statistiques)", signal);
  const shortFlags = new Map(feed.map((video) => [video.videoId, video.isShort]));
  const { posts, guessedFormat } = youtubeVideosToCreatorPosts(videos.items ?? [], shortFlags);
  if (posts.length === 0) throw new SourceError(`Aucune vidéo publique sur la chaîne YouTube ${shownHandle(account.handle)}.`);

  return buildCreatorData({
    account,
    posts,
    source: YOUTUBE_API_SOURCE,
    now: options.now,
    maxPosts: options.maxPosts,
    ratiosAllowed: youtubeRatiosAllowed(options.env),
    warnings: [
      policyWarning(options.env),
      channel.statistics?.hiddenSubscriberCount
        ? noAudienceWarning("Nombre d'abonnés masqué par la chaîne")
        : account.followers !== undefined && "Nombre d'abonnés arrondi par YouTube à 3 chiffres significatifs.",
      guessedFormat > 0 &&
        `Format Short ou vidéo longue déduit de la durée (≤ 3 min = Short) pour ${plural(guessedFormat, "vidéo")} absente(s) du flux RSS : une vidéo horizontale courte peut être comptée comme Short.`,
    ],
  });
}

async function fetchKeyless(handle: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const { signal } = options;
  const warnings: string[] = [];
  let page: YoutubeChannelPage;
  let long: YoutubeTabVideo[] = [];
  try {
    ({ page, long } = await loadChannelPage(handle, signal));
  } catch (error) {
    // A channel id is enough for the feed: only the account details are lost.
    if (!YOUTUBE_CHANNEL_ID.test(handle) || (error instanceof SourceError && error.status === 404) || signal.aborted) throw error;
    page = { channelId: handle };
    warnings.push(`Page de la chaîne indisponible (${errorMessage(error)}) : nom, bio et abonnés manquants.`);
  }

  let posts: CreatorPost[];
  let fromTabs = false;
  try {
    posts = feedVideosToCreatorPosts(await loadFeed(page.channelId, signal, options.youtubeFeedBudgetMs ?? KEYLESS_FEED_BUDGET_MS));
  } catch (feedError) {
    if (signal.aborted) throw feedError;
    const status = feedError instanceof SourceError ? feedError.status : undefined;
    const failure = status ? `erreur ${status}` : errorMessage(feedError);
    // The feed has bursts of 404/500 for whole channels: read the channel's own tabs instead.
    const shorts = await loadShorts(page, signal).catch((error: unknown) => {
      if (signal.aborted) throw error;
      return [] as YoutubeTabVideo[];
    });
    if (long.length + shorts.length === 0) {
      throw new SourceError(
        `Le flux RSS de la chaîne YouTube ne répond pas (${failure}) et ses onglets « Vidéos » et « Shorts » sont illisibles : réessayez dans quelques minutes, ou ajoutez YOUTUBE_API_KEY (gratuite) pour passer par l'API officielle.`,
        undefined,
        true,
      );
    }
    posts = tabVideosToCreatorPosts(long, shorts, options.maxPosts);
    fromTabs = true;
    warnings.push(
      `Flux RSS de YouTube indisponible (${failure}) : vidéos lues sur les onglets « Vidéos » et « Shorts » de la chaîne, avec les vues arrondies telles qu'affichées (« 16 M ») et la durée des vidéos longues, mais sans date exacte de publication, likes ni commentaires.`,
    );
  }
  const account = pageToAccount(page, handle);
  if (posts.length === 0) throw new SourceError(`Aucune vidéo publique sur la chaîne YouTube ${shownHandle(account.handle)}.`);

  const policy = policyWarning(options.env);
  if (policy) warnings.unshift(policy);
  if (account.followers === undefined) {
    warnings.push(noAudienceWarning(page.title ? "Nombre d'abonnés masqué par la chaîne" : "Nombre d'abonnés indisponible"));
  } else if (page.subscribersLabel) {
    warnings.push(`Nombre d'abonnés arrondi tel qu'affiché par YouTube (« ${page.subscribersLabel} »).`);
  }
  if (!fromTabs) {
    warnings.push(
      `Sans clé YouTube, seules les ${RSS_MAX_VIDEOS} dernières vidéos sont lisibles (flux RSS public), avec vues et likes mais sans commentaires ni durées : ajoutez YOUTUBE_API_KEY (gratuite) pour en analyser jusqu'à 50 avec toutes leurs statistiques.`,
    );
  }
  return buildCreatorData({
    account,
    posts,
    source: YOUTUBE_KEYLESS_SOURCE,
    now: options.now,
    maxPosts: options.maxPosts,
    warnings,
    ratiosAllowed: youtubeRatiosAllowed(options.env),
  });
}

/** Throws SourceError (French) when the channel does not exist or nothing can be read. */
export async function fetchYoutubeCreator(handle: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const apiKey = options.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return fetchKeyless(handle, options);
  try {
    return await fetchWithApi(handle, apiKey, options);
  } catch (error) {
    if ((error instanceof SourceError && error.status === 404) || options.signal.aborted) throw error;
    const data = await fetchKeyless(handle, options);
    return {
      ...data,
      warnings: [`API YouTube indisponible (${errorMessage(error)}) : données publiques utilisées à la place.`, ...data.warnings],
    };
  }
}
