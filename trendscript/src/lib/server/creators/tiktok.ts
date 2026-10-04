/**
 * TikTok account → latest videos with their public counters, through the
 * Apify actor `clockworks/tiktok-scraper` in profile mode (or the actor set
 * in APIFY_TIKTOK_ACTOR, e.g. the cheaper `clockworks/free-tiktok-scraper`
 * which takes the same input). TikTok has no public API for another
 * account's videos.
 *
 * Every video row carries `authorMeta` (fans, video count, bio, verified),
 * so one run gives both the posts and the account.
 */

import type { CreatorAccount, CreatorData, CreatorPost } from "../../types";
import { truncate } from "../../analysis/text";
import { SourceError } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "../sources/apify";
import { tiktokActors, type ApifyTiktokVideoItem } from "../sources/tiktok-apify";
import { errorMessage, toCount, toIso, uniqueTags } from "../sources/social-utils";
import { BIO_MAX, buildCreatorData, captionParts, musicLabel, noAudienceWarning, type FetchCreatorOptions } from "./common";
import { creatorProfileUrl } from "./handles";

export const TIKTOK_APIFY_SOURCE = "Apify · TikTok Scraper (profil)";

/** Output row of clockworks/tiktok-scraper in profile mode (fields we use). */
export interface ApifyTiktokProfileVideo extends Omit<ApifyTiktokVideoItem, "authorMeta"> {
  repostCount?: number;
  /** "videos" | "reposts" | "stories". */
  fromProfileSection?: string;
  authorMeta?: {
    id?: string;
    name?: string;
    nickName?: string;
    profileUrl?: string;
    verified?: boolean;
    privateAccount?: boolean;
    signature?: string;
    fans?: number;
    video?: number;
    heart?: number;
  };
}

export const TIKTOK_PROFILE_FIELDS = [
  "id",
  "text",
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
  "repostCount",
  "authorMeta",
  "musicMeta",
  "videoMeta",
  "hashtags",
  "fromProfileSection",
  "input",
  "url",
  "error",
  "errorCode",
];

/**
 * Pure: actor input for one profile's latest videos. No date / popularity
 * filter (charged extras), `profileSorting` left at its default ("latest";
 * sorting options are billed when applied), pinned videos excluded (they
 * are usually old hits), no downloads.
 */
export function buildTiktokProfileInput(username: string, maxPosts: number) {
  return {
    profiles: [username],
    profileScrapeSections: ["videos"],
    resultsPerPage: maxPosts,
    excludePinnedPosts: true,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  };
}

/** Pure: actor error rows → French error for the account (undefined when none applies). */
export function tiktokProfileError(username: string, rows: ApifyErrorRow[]): SourceError | undefined {
  const codes = new Set(rows.map((row) => row.code ?? ""));
  const text = rows.map((row) => `${row.error} ${row.errorDescription ?? ""}`).join(" ");
  if (codes.has("PROFILE_PRIVATE") || /private/i.test(text)) {
    return new SourceError(`Le compte TikTok @${username} est privé : ses vidéos ne sont pas accessibles.`);
  }
  if (codes.has("NOT_FOUND") || /not found|does not exist/i.test(text)) {
    return new SourceError(`Compte introuvable sur TikTok : vérifiez le pseudo (@${username}).`, 404);
  }
  if (codes.has("PROFILE_EMPTY")) {
    return new SourceError(`Aucune vidéo publique sur le compte TikTok @${username} (ou profil réservé aux utilisateurs connectés).`);
  }
  return undefined;
}

function isOwnSound(music: ApifyTiktokProfileVideo["musicMeta"], author: ApifyTiktokProfileVideo["authorMeta"]): boolean {
  if (!music) return true;
  if (music.musicOriginal !== false) return true;
  const names = [author?.name, author?.nickName].filter(Boolean).map((n) => n!.toLowerCase());
  const by = music.musicAuthor?.toLowerCase();
  const title = music.musicName?.toLowerCase() ?? "";
  // "original sound - <creator>" reused by the creator themself.
  return Boolean(by && names.includes(by)) || names.some((name) => title.endsWith(`- ${name}`));
}

/** Pure: profile video rows → posts (other authors and non-"videos" sections dropped). */
export function tiktokVideosToCreatorPosts(items: ApifyTiktokProfileVideo[], username: string): CreatorPost[] {
  const posts: CreatorPost[] = [];
  for (const item of items) {
    const url = item.webVideoUrl;
    if (!url?.startsWith("https://www.tiktok.com/")) continue;
    if (item.fromProfileSection && item.fromProfileSection !== "videos") continue;
    if (item.authorMeta?.name && item.authorMeta.name.toLowerCase() !== username) continue;
    const id = item.id ?? url.match(/\/(?:video|photo)\/(\d+)/)?.[1];
    if (!id) continue;
    const duration = toCount(item.videoMeta?.duration);
    const music = item.musicMeta;
    posts.push({
      id,
      url,
      ...captionParts(item.text, item.isSlideshow ? "Carrousel TikTok sans légende" : "Vidéo TikTok sans légende"),
      publishedAt: toIso(item.createTimeISO) ?? toIso(item.createTime),
      kind: item.isSlideshow ? "social_post" : "short_video",
      // Slideshows report 0 s.
      durationSec: duration ? Math.round(duration) : undefined,
      metrics: {
        views: toCount(item.playCount),
        likes: toCount(item.diggCount),
        comments: toCount(item.commentCount),
        shares: toCount(item.shareCount),
        saves: toCount(item.collectCount),
      },
      hashtags: uniqueTags((item.hashtags ?? []).map((tag) => tag?.name)),
      music: isOwnSound(music, item.authorMeta) ? undefined : musicLabel(music?.musicName, music?.musicAuthor),
      pinned: item.isPinned ? true : undefined,
    });
  }
  return posts;
}

/** Pure: account facts from the first row of the profile (every row repeats `authorMeta`). */
export function tiktokAccount(items: ApifyTiktokProfileVideo[], username: string): CreatorAccount {
  const author = items.find((item) => item.authorMeta?.name?.toLowerCase() === username)?.authorMeta ?? items[0]?.authorMeta;
  const handle = author?.name?.toLowerCase() || username;
  return {
    platform: "tiktok",
    handle,
    displayName: author?.nickName?.trim() || undefined,
    url: author?.profileUrl?.startsWith("https://www.tiktok.com/") ? author.profileUrl : creatorProfileUrl("tiktok", handle),
    followers: toCount(author?.fans),
    totalPosts: toCount(author?.video),
    bio: truncate(author?.signature, BIO_MAX),
    verified: author?.verified ?? undefined,
  };
}

/** Pure: dataset → CreatorData; throws the actor's account error when no video came back. */
export function tiktokProfileToCreatorData(
  username: string,
  { items, errorRows }: { items: ApifyTiktokProfileVideo[]; errorRows: ApifyErrorRow[] },
  { now, maxPosts }: { now: number; maxPosts: number },
): CreatorData {
  const posts = tiktokVideosToCreatorPosts(items, username);
  if (posts.length === 0) {
    throw (
      tiktokProfileError(username, errorRows) ??
      new SourceError(`Aucune vidéo publique trouvée sur le compte TikTok @${username}.`)
    );
  }
  const account = tiktokAccount(items, username);
  const slideshows = posts.filter((post) => post.kind === "social_post").length;
  return buildCreatorData({
    account,
    posts,
    source: TIKTOK_APIFY_SOURCE,
    now,
    maxPosts,
    warnings: [
      account.followers === undefined && noAudienceWarning("Nombre d'abonnés TikTok indisponible"),
      slideshows > 0 && `${slideshows} carrousel(s) photo inclus (sans durée).`,
      "Vidéos épinglées exclues : elles sont souvent anciennes et fausseraient le rythme de publication.",
    ],
  });
}

/** Throws SourceError (French) when APIFY_TOKEN is missing or the account cannot be read. */
export async function fetchTiktokCreator(username: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const token = options.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new SourceError(
      "TikTok nécessite APIFY_TOKEN (voir Réglages) : TikTok n'ouvre aucune API publique pour lire les vidéos d'un autre compte.",
    );
  }
  const actor = tiktokActors(options.env).search;
  let result;
  try {
    result = await runApifyActorDetailed<ApifyTiktokProfileVideo>(actor, buildTiktokProfileInput(username, options.maxPosts), {
      token,
      signal: options.signal,
      maxChargeUsd: apifyMaxChargeUsd(options.env),
      fields: TIKTOK_PROFILE_FIELDS,
    });
  } catch (error) {
    throw error instanceof SourceError ? error : new SourceError(errorMessage(error));
  }
  return tiktokProfileToCreatorData(username, result, { now: options.now, maxPosts: options.maxPosts });
}
