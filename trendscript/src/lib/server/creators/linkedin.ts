/**
 * LinkedIn member or company page → recent posts.
 *
 * 1. APIFY_TOKEN: `harvestapi/linkedin-profile-posts` with
 *    `{ targetUrls: [profile URL], maxPosts, postedLimit: "3months",
 *    includeReposts: false }` — the publisher's dedicated actor for "all
 *    posts of a profile or company" (its `linkedin-post-search` actor's
 *    README says search queries are required). Same post shape as the
 *    post-search actor: reactions, comments and reposts; no views and no
 *    follower count.
 * 2. Else FIRECRAWL_API_KEY: a web search for the account's public posts
 *    (`site:linkedin.com/posts "<id>"`), kept only when the permalink is
 *    `/posts/<id>_…`. Exact dates come from the activity id; no counters.
 *    `linkedinHitsToCreatorPosts` is pure so the HTML edition can run its
 *    own search and reuse it.
 */

import type { CreatorAccount, CreatorData, CreatorPost } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { SourceError } from "../http";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "../sources/apify";
import {
  activityDate,
  activityIdFromUrl,
  linkedinPostUrl,
  readTitle,
  searchLocation,
  splitAge,
  type WebSearchHit,
} from "../sources/linkedin";
import type { ApifyLinkedinPost } from "../sources/linkedin-apify";
import { firecrawlRestSearch, type LinkedinSearch } from "../sources/linkedin-web";
import { captionTitle, errorMessage, extractHashtags, toCount, toIso } from "../sources/social-utils";
import { BIO_MAX, CAPTION_MAX, buildCreatorData, captionParts, plural, type FetchCreatorOptions } from "./common";
import { creatorProfileUrl, linkedinIdentity } from "./handles";

export const LINKEDIN_PROFILE_POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
export const LINKEDIN_APIFY_SOURCE = "Apify · LinkedIn Profile Posts (HarvestAPI)";
export const LINKEDIN_WEB_SOURCE = "Recherche web (Firecrawl) · publications LinkedIn indexées";
/** Publication window asked to the actor. */
export const LINKEDIN_POSTED_LIMIT = "3months";

export const LINKEDIN_NO_AUDIENCE =
  "LinkedIn ne fournit ni vues ni nombre d'abonnés : la comparaison vues / abonnés n'est pas disponible, les publications sont comparées sur leurs réactions, commentaires et republications.";

function shown(handle: string): string {
  const { id, company } = linkedinIdentity(handle);
  return company ? `la page ${id}` : `@${id}`;
}

// ---------------------------------------------------------------------------
// Apify (pure)
// ---------------------------------------------------------------------------

/** Pure: actor input — the account's own posts and quote posts of the last 3 months. */
export function buildLinkedinProfilePostsInput(handle: string, maxPosts: number) {
  return {
    targetUrls: [creatorProfileUrl("linkedin", handle)],
    maxPosts,
    postedLimit: LINKEDIN_POSTED_LIMIT,
    includeReposts: false,
    includeQuotePosts: true,
  };
}

/** Author identifier of a post row (member public id, or company universal name). */
function authorId(post: ApifyLinkedinPost): string | undefined {
  const raw = post.author?.publicIdentifier || post.author?.universalName || undefined;
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export interface LinkedinPostMapping {
  posts: CreatorPost[];
  /** Rows by another author (reposts that slipped through). */
  otherAuthors: number;
  author?: ApifyLinkedinPost["author"];
}

/** Pure: actor rows → posts (reactions → likes, reposts → shares). */
export function linkedinPostsToCreatorPosts(items: ApifyLinkedinPost[], handle: string, now: number): LinkedinPostMapping {
  const { id: wanted } = linkedinIdentity(handle);
  const posts: CreatorPost[] = [];
  let otherAuthors = 0;
  let author: ApifyLinkedinPost["author"];
  for (const item of items) {
    if (item.type && item.type !== "post") continue;
    const url = linkedinPostUrl(item.linkedinUrl);
    if (!url) continue;
    const by = authorId(item);
    if (by && by !== wanted) {
      otherAuthors++;
      continue;
    }
    author ??= item.author;
    const activityId = item.id && /^\d+$/.test(item.id) ? item.id : activityIdFromUrl(url);
    posts.push({
      id: activityId ?? shortHash(url),
      url,
      ...captionParts(item.content, "Publication LinkedIn sans texte", 160),
      publishedAt: toIso(item.postedAt?.date) ?? toIso(item.postedAt?.timestamp) ?? activityDate(activityId, now),
      kind: "social_post",
      metrics: {
        likes: toCount(item.engagement?.likes),
        comments: toCount(item.engagement?.comments),
        shares: toCount(item.engagement?.shares),
      },
      hashtags: extractHashtags(item.content),
    });
  }
  return { posts, otherAuthors, author };
}

export function linkedinAccount(handle: string, author?: ApifyLinkedinPost["author"]): CreatorAccount {
  return {
    platform: "linkedin",
    handle,
    displayName: author?.name?.trim() || undefined,
    url: creatorProfileUrl("linkedin", handle),
    bio: truncate(author?.info, BIO_MAX),
  };
}

/** Pure: dataset → CreatorData; throws when no post of the account came back. */
export function linkedinApifyToCreatorData(
  handle: string,
  { items, errorRows }: { items: ApifyLinkedinPost[]; errorRows: ApifyErrorRow[] },
  { now, maxPosts }: { now: number; maxPosts: number },
): CreatorData {
  const { posts, otherAuthors, author } = linkedinPostsToCreatorPosts(items, handle, now);
  if (posts.length === 0) {
    const detail = errorRows[0] ? ` (${errorRows[0].errorDescription ?? errorRows[0].error})` : "";
    throw new SourceError(
      `Aucune publication LinkedIn trouvée pour ${shown(handle)} sur les 3 derniers mois${detail} : vérifiez l'adresse du profil (linkedin.com/in/… ou linkedin.com/company/…).`,
      errorRows.length ? 404 : undefined,
    );
  }
  return buildCreatorData({
    account: linkedinAccount(handle, author),
    posts,
    source: LINKEDIN_APIFY_SOURCE,
    now,
    maxPosts,
    warnings: [
      LINKEDIN_NO_AUDIENCE,
      posts.length < maxPosts && `${plural(posts.length, "publication")} sur les 3 derniers mois.`,
      otherAuthors > 0 && `${plural(otherAuthors, "republication")} d'autres auteurs écartée(s).`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Web search fallback (pure mapper shared with the HTML edition)
// ---------------------------------------------------------------------------

/** Web search query for an account's public posts (Firecrawl/Google syntax). */
export function linkedinCreatorSearchQuery(handle: string): string {
  return `site:linkedin.com/posts "${linkedinIdentity(handle).id}"`;
}

/** Author segment of a `/posts/<id>_<slug>-activity-…` permalink, lower-cased. */
export function linkedinPostAuthor(url: string): string | undefined {
  const segment = new URL(url).pathname.match(/^\/posts\/([^/_]+)_/)?.[1];
  if (!segment) return undefined;
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
}

/** Slug words of a permalink ("jai-analys%C3%A9-100-parcours" → "jai analysé 100 parcours"). */
function slugText(url: string): string | undefined {
  const slug = new URL(url).pathname.match(/^\/posts\/[^/_]+_(.+?)-(?:activity|ugcPost|share)-\d+/)?.[1];
  if (!slug) return undefined;
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  const words = decoded.replace(/-/g, " ").trim();
  return words.length >= 8 ? words : undefined;
}

const BOILERPLATE = [
  /\b(?:Post|Publication) de [^.·…]{2,60}?(?=\s*(?:\.\.\.|…|·|\.|$))/gi,
  /\bVoir le profil de [^.·…]{2,60}?(?=\s*(?:\.\.\.|…|·|\.|$))/gi,
  /\bSignaler ce post;?\s*Fermer le menu\.?/gi,
  /\bReport this post;?\s*Close menu\.?/gi,
  /\b\d+\s*(?:h|j|sem\.?|mois|an|ans|w|d|mo|yr)\.?(?=\s*(?:\.\.\.|…|·|$))/gi,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fragments(description: string, author?: string): string[] {
  let text = description;
  for (const pattern of BOILERPLATE) text = text.replace(pattern, " ");
  const leadingAuthor = author ? new RegExp(`^(?:${escapeRegExp(author)}\\s*[.·]\\s*)+`) : undefined;
  return text
    .split(/\s*(?:\.\.\.|…|·)\s*/)
    .map((part) => part.trim().replace(/^[.,;:\s]+|[,;:\s]+$/g, ""))
    .map((part) => (leadingAuthor ? part.replace(leadingAuthor, "") : part).trim())
    .filter((part) => part.length > 0 && (!author || part.replace(/\.$/, "") !== author));
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Pure: web search hits → the account's posts (deduped by activity id,
 * newest first). With `handle`, only permalinks of that account are kept.
 * Dates come from the activity id (exact) or the "4 days ago" prefix; the
 * text is the search excerpt minus LinkedIn boilerplate and the author's
 * headline (fragments repeated across hits). No counters: search engines
 * do not see them.
 */
export function linkedinHitsToCreatorPosts(hits: WebSearchHit[], now: number, handle?: string): CreatorPost[] {
  const wanted = handle ? linkedinIdentity(handle).id.toLowerCase() : undefined;
  const seen = new Set<string>();
  const own: { hit: WebSearchHit; url: string; activityId?: string; publishedAt?: string }[] = [];
  for (const hit of hits) {
    const url = linkedinPostUrl(hit.url);
    if (!url) continue;
    if (wanted && linkedinPostAuthor(url) !== wanted) continue;
    const activityId = activityIdFromUrl(url);
    const key = activityId ?? url;
    if (seen.has(key)) continue;
    seen.add(key);
    own.push({ hit, url, activityId, publishedAt: activityDate(activityId, now) });
  }
  // The account's name, as search engines title its posts ("Post de Romain Fargeot - LinkedIn").
  const accountName = own.map(({ hit }) => readTitle(hit.title ?? "").author).find(Boolean);
  const kept = own.map((entry) => {
    const { text, publishedAt } = splitAge(entry.hit.description ?? "", now);
    const author = (wanted ? accountName : readTitle(entry.hit.title ?? "").author) ?? accountName;
    return { ...entry, publishedAt: entry.publishedAt ?? publishedAt, parts: fragments(text, author) };
  });

  // A fragment sharing its first 30+ characters with a fragment of another hit is the author's headline.
  const repeated = (part: string, index: number) =>
    part.length >= 30 &&
    kept.some((other, j) => j !== index && other.parts.some((candidate) => sharedPrefix(part, candidate) >= 30));

  return kept
    .map(({ hit, url, activityId, publishedAt, parts }, index) => {
      // Fragments under 15 characters ("3 mois sur") carry nothing usable.
      const body = parts.filter((part) => part.length >= 15 && !repeated(part, index)).join(" … ");
      const { headline } = readTitle(hit.title ?? "");
      const realHeadline = headline && !/^(post|publication)\b/i.test(headline) ? headline.replace(/\s*(?:\.\.\.|…)$/, "") : undefined;
      const title =
        realHeadline || (body.length >= 25 ? captionTitle(body, "", 160) : "") || slugText(url) || body || "Publication LinkedIn";
      return {
        id: activityId ?? shortHash(url),
        url,
        title,
        text: truncate(body, CAPTION_MAX),
        publishedAt,
        kind: "social_post" as const,
        metrics: {},
        hashtags: extractHashtags(`${hit.title ?? ""} ${body}`),
      };
    })
    .sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : -Infinity) - (a.publishedAt ? Date.parse(a.publishedAt) : -Infinity));
}

/**
 * Runs the account search with any web search function (server: Firecrawl
 * REST; HTML edition: its own) and builds the CreatorData.
 */
export async function fetchLinkedinCreatorWeb(
  handle: string,
  options: Pick<FetchCreatorOptions, "geo" | "signal" | "now" | "maxPosts">,
  search: LinkedinSearch,
): Promise<CreatorData> {
  const hits = await search(linkedinCreatorSearchQuery(handle), {
    limit: Math.min(100, options.maxPosts + 10),
    tbs: "qdr:y",
    location: searchLocation(options.geo),
    signal: options.signal,
  });
  const posts = linkedinHitsToCreatorPosts(hits, options.now, handle);
  if (posts.length === 0) {
    throw new SourceError(
      `Aucune publication LinkedIn de ${shown(handle)} trouvée par la recherche web : vérifiez l'adresse du profil, ou renseignez APIFY_TOKEN pour lire ses publications directement.`,
    );
  }
  const { id } = linkedinIdentity(handle);
  const author = hits
    .filter((hit) => {
      const url = linkedinPostUrl(hit.url);
      return url !== undefined && linkedinPostAuthor(url) === id;
    })
    .map((hit) => readTitle(hit.title ?? "").author)
    .find(Boolean);
  return buildCreatorData({
    account: { platform: "linkedin", handle, displayName: author, url: creatorProfileUrl("linkedin", handle) },
    posts,
    source: LINKEDIN_WEB_SOURCE,
    now: options.now,
    maxPosts: options.maxPosts,
    warnings: [
      `Publications trouvées par recherche web : seules celles indexées par le moteur sont visibles (${plural(posts.length, "publication")}), sans réactions, commentaires ni vues — les statistiques de performance ne sont pas calculables. Renseignez APIFY_TOKEN pour obtenir l'engagement réel.`,
      LINKEDIN_NO_AUDIENCE,
      "Textes issus des extraits du moteur de recherche (souvent tronqués).",
    ],
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function fetchLinkedinApify(handle: string, options: FetchCreatorOptions, token: string): Promise<CreatorData> {
  const result = await runApifyActorDetailed<ApifyLinkedinPost>(
    LINKEDIN_PROFILE_POSTS_ACTOR,
    buildLinkedinProfilePostsInput(handle, options.maxPosts),
    { token, signal: options.signal, maxChargeUsd: apifyMaxChargeUsd(options.env) },
  );
  return linkedinApifyToCreatorData(handle, result, { now: options.now, maxPosts: options.maxPosts });
}

/** Throws SourceError (French) when nothing is configured or no post is found. */
export async function fetchLinkedinCreator(handle: string, options: FetchCreatorOptions): Promise<CreatorData> {
  const token = options.env.APIFY_TOKEN?.trim();
  const firecrawlKey = options.env.FIRECRAWL_API_KEY?.trim();
  if (!token && !firecrawlKey) {
    throw new SourceError(
      "LinkedIn nécessite APIFY_TOKEN (publications avec réactions et commentaires) ou FIRECRAWL_API_KEY (publications sans compteurs) : voir Réglages.",
    );
  }
  if (!token) return fetchLinkedinCreatorWeb(handle, options, firecrawlRestSearch(firecrawlKey!));
  try {
    return await fetchLinkedinApify(handle, options, token);
  } catch (error) {
    if (!firecrawlKey || options.signal.aborted || (error instanceof SourceError && error.status === 404)) throw error;
    const data = await fetchLinkedinCreatorWeb(handle, options, firecrawlRestSearch(firecrawlKey));
    return { ...data, warnings: [`Apify indisponible (${errorMessage(error)}) : recherche web utilisée à la place.`, ...data.warnings] };
  }
}
