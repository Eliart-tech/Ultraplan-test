/**
 * Helpers shared by the creator fetchers (pure): caption → title/text,
 * newest-first ordering, warnings wording.
 */

import type { CreatorAccount, CreatorData, CreatorPost } from "../../types";
import { truncate } from "../../analysis/text";
import { captionTitle } from "../sources/social-utils";
import type { Env } from "../sources/types";

/** What every creator fetcher receives (re-exported as `FetchCreatorOptions`). */
export interface FetchCreatorOptions {
  /** Read-only environment (process.env in production, a plain object in tests). */
  env: Env;
  /** Cancellation / timeout. */
  signal: AbortSignal;
  /** Epoch ms of the run (fetchedAt, relative dates). */
  now: number;
  /** ISO 3166-1 alpha-2 of the market. */
  geo: string;
  /** ISO 639-1. */
  language: string;
  /** Posts wanted (1–50). */
  maxPosts: number;
  /**
   * Retry budget of the YouTube RSS feed without a key (default 10 s). The
   * HTML edition pays one Firecrawl credit per attempt and passes 0 (one try).
   */
  youtubeFeedBudgetMs?: number;
}

/** Captions are kept up to this length (whitespace collapsed). */
export const CAPTION_MAX = 1500;
export const BIO_MAX = 500;
/** Upper bound accepted by every fetcher (the UI offers 10–50). */
export const MAX_CREATOR_POSTS = 50;
/** Results are cached this long per platform + handle + post count. */
export const CREATOR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const fr = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return fr.format(value);
}

/** Title (first meaningful line) and plain text of a caption. */
export function captionParts(caption: string | undefined, fallback: string, titleMax = 120): { title: string; text?: string } {
  return { title: captionTitle(caption, fallback, titleMax), text: truncate(caption, CAPTION_MAX) };
}

/** "Titre – Artiste" for third-party audio. */
export function musicLabel(name: string | undefined, author: string | undefined): string | undefined {
  const title = name?.trim();
  if (!title) return undefined;
  const artist = author?.trim();
  return artist ? `${title} – ${artist}` : title;
}

/** Warning added whenever the follower count is missing (views ÷ followers is then impossible). */
export function noAudienceWarning(reason: string): string {
  return `${reason} : la comparaison vues / abonnés (publications qui font venir des abonnés) ne sera pas disponible.`;
}

function time(post: CreatorPost): number {
  const t = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/** Pure: dedupe by id, newest first (undated last), capped. */
export function newestFirst(posts: CreatorPost[], max: number): CreatorPost[] {
  const seen = new Set<string>();
  const unique: CreatorPost[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    unique.push(post);
  }
  return unique
    .map((post, index) => ({ post, index }))
    .sort((a, b) => time(b.post) - time(a.post) || a.index - b.index)
    .slice(0, Math.max(0, max))
    .map(({ post }) => post);
}

/** Drops undefined keys so fixtures and snapshots stay readable. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function buildCreatorData({
  account,
  posts,
  source,
  now,
  maxPosts,
  warnings,
  ratiosAllowed,
}: {
  account: CreatorAccount;
  posts: CreatorPost[];
  source: string;
  now: number;
  maxPosts: number;
  warnings: (string | undefined | false)[];
  /** See CreatorData.ratiosAllowed — only set by the YouTube fetcher. */
  ratiosAllowed?: boolean;
}): CreatorData {
  return {
    account: compact(account),
    posts: newestFirst(posts, maxPosts).map((post) => ({ ...compact(post), metrics: compact(post.metrics) })),
    source,
    fetchedAt: new Date(now).toISOString(),
    warnings: [...new Set(warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0))],
    ...(ratiosAllowed === undefined ? {} : { ratiosAllowed }),
  };
}

/** "3 reels" / "1 reel". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}
