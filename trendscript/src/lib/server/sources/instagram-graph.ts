/**
 * Instagram through Meta's official Graph API ("Instagram API with Facebook
 * Login"), free:
 *
 * (a) Business Discovery — for each watched Creator/Business account: its
 *     follower count and last 25 media with `view_count`, so a reel can be
 *     compared to its own audience (outlier = views ≥ 2× followers).
 * (b) Hashtag Search (optional) — `top_media` of ≤ 3 niche hashtags. No
 *     views and no author on these, and Meta only allows it to apps granted
 *     "Instagram Public Content Access": a permission error there is a
 *     warning when (a) worked, not a failure.
 *
 * The token goes in `access_token=` as in every Meta sample; it is scrubbed
 * from any message that could reach the user.
 */

import type { Signal } from "../../types";
import { shortHash, truncate } from "../../analysis/text";
import { cached } from "../cache";
import { SourceError, fetchWithTimeout } from "../http";
import {
  DAY_MS,
  captionTitle,
  errorMessage,
  extractHashtags,
  isRecent,
  keywordsToHashtags,
  mapWithConcurrency,
  scrubSecrets,
  toCount,
  toIso,
} from "./social-utils";
import type { Env, SourceConnector, SourceContext, SourceFetchResult } from "./types";

export const GRAPH_HOST = "https://graph.facebook.com";
/** v25.0 is what Meta's Instagram reference pages use; supported until July 2028. */
export const DEFAULT_GRAPH_VERSION = "v25.0";
export const MAX_WATCH_ACCOUNTS = 10;
const MAX_HASHTAGS = 3;
const MEDIA_LIMIT = 25;
const MAX_AGE_MS = 30 * DAY_MS;

export const DISCOVERY_MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,like_count,comments_count,view_count,permalink,timestamp,thumbnail_url";
/** Complete list of fields Meta allows on hashtag media (no username, no views). */
export const HASHTAG_MEDIA_FIELDS = "id,caption,media_type,comments_count,like_count,permalink,timestamp";

export function graphVersion(env: Env): string {
  const version = env.INSTAGRAM_GRAPH_VERSION?.trim();
  return version && /^v\d{2,}\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION;
}

/** Pure: `INSTAGRAM_WATCH_ACCOUNTS` ("@a, b, https://instagram.com/c/") → usernames. */
export function parseWatchAccounts(raw: string | undefined): { accounts: string[]; invalid: string[] } {
  const accounts: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const username = part
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/[/?#].*$/, "")
      .toLowerCase();
    if (/^[a-z0-9._]{1,30}$/.test(username)) {
      if (!accounts.includes(username)) accounts.push(username);
    } else {
      invalid.push(part);
    }
  }
  return { accounts: accounts.slice(0, MAX_WATCH_ACCOUNTS), invalid };
}

// ---------------------------------------------------------------------------
// Request builders (pure)
// ---------------------------------------------------------------------------

interface GraphAuth {
  version: string;
  igUserId: string;
  token: string;
}

export function buildBusinessDiscoveryUrl({ version, igUserId, token, username }: GraphAuth & { username: string }): string {
  const params = new URLSearchParams({
    fields: `business_discovery.username(${username}){username,name,followers_count,media_count,media.limit(${MEDIA_LIMIT}){${DISCOVERY_MEDIA_FIELDS}}}`,
    access_token: token,
  });
  return `${GRAPH_HOST}/${version}/${encodeURIComponent(igUserId)}?${params}`;
}

export function buildHashtagSearchUrl({ version, igUserId, token, hashtag }: GraphAuth & { hashtag: string }): string {
  const params = new URLSearchParams({ user_id: igUserId, q: hashtag, access_token: token });
  return `${GRAPH_HOST}/${version}/ig_hashtag_search?${params}`;
}

export function buildHashtagTopMediaUrl({ version, igUserId, token, hashtagId }: GraphAuth & { hashtagId: string }): string {
  const params = new URLSearchParams({ user_id: igUserId, fields: HASHTAG_MEDIA_FIELDS, limit: "50", access_token: token });
  return `${GRAPH_HOST}/${version}/${encodeURIComponent(hashtagId)}/top_media?${params}`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GraphErrorKind = "token" | "permission" | "rate_limit" | "transient" | "not_found" | "other";

export class GraphApiError extends SourceError {
  constructor(
    message: string,
    readonly kind: GraphErrorKind,
    readonly code?: number,
    status?: number,
  ) {
    super(message, status, kind === "rate_limit" || kind === "transient");
    this.name = "GraphApiError";
  }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean };
}

/** What the failing call was about — changes the advice given. */
export type GraphCallContext = { part: "discovery"; username: string } | { part: "hashtag"; hashtag: string };

/** Pure: Graph error payload → French, actionable error with the token scrubbed. */
export function graphError(status: number, bodyText: string, context: GraphCallContext): GraphApiError {
  let body: GraphErrorBody = {};
  try {
    body = JSON.parse(bodyText) as GraphErrorBody;
  } catch {
    // non-JSON body
  }
  const error = body.error ?? {};
  const code = typeof error.code === "number" ? error.code : undefined;
  const subcode = error.error_subcode;
  const detail = scrubSecrets((error.message ?? bodyText).replace(/\s+/g, " ").trim()).slice(0, 200);

  if (code === 190) {
    return new GraphApiError(
      "Jeton Instagram expiré ou invalide : régénérez INSTAGRAM_ACCESS_TOKEN (un jeton longue durée expire après environ 60 jours).",
      "token",
      code,
      status,
    );
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return context.part === "hashtag"
      ? new GraphApiError(
          "Recherche par hashtag non autorisée : elle exige la fonctionnalité « Instagram Public Content Access », accordée par Meta après validation de l'app (App Review).",
          "permission",
          code,
          status,
        )
      : new GraphApiError(
          "Permission Instagram manquante : le jeton doit inclure instagram_basic, instagram_manage_insights et pages_read_engagement.",
          "permission",
          code,
          status,
        );
  }
  if (code !== undefined && [4, 17, 32, 341, 613].includes(code)) {
    return new GraphApiError(
      "Limite d'appels de l'API Instagram atteinte (environ 200 appels par heure) : réessayez dans une heure.",
      "rate_limit",
      code,
      status,
    );
  }
  if (code === 1 || code === 2 || error.is_transient) {
    return new GraphApiError("Erreur temporaire de l'API Instagram : réessayez dans quelques minutes.", "transient", code, status);
  }
  if (context.part === "discovery" && (code === 110 || code === 24 || subcode === 2207013 || (code === 100 && /user|username/i.test(detail)))) {
    return new GraphApiError(
      `Compte @${context.username} introuvable ou non professionnel (Business Discovery ne lit que les comptes Créateur ou Entreprise).`,
      "not_found",
      code,
      status,
    );
  }
  const subject = context.part === "discovery" ? `@${context.username}` : `#${context.hashtag}`;
  return new GraphApiError(
    `API Instagram (${subject}) : erreur${code !== undefined ? ` ${code}` : ""}${detail ? ` — ${detail}` : ""}`,
    status >= 500 ? "transient" : "other",
    code,
    status,
  );
}

/** Highest percentage in the `X-App-Usage` header ({"call_count":28,"total_time":25,…}). */
export function appUsagePercent(header: string | null): number | undefined {
  if (!header) return undefined;
  try {
    const usage = JSON.parse(header) as Record<string, unknown>;
    const values = Object.values(usage).map(toCount).filter((v): v is number => v !== undefined);
    return values.length ? Math.max(...values) : undefined;
  } catch {
    return undefined;
  }
}

interface UsageTracker {
  maxPercent: number;
}

async function graphGet<T>(url: string, context: GraphCallContext, signal: AbortSignal, usage: UsageTracker): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal, timeoutMs: 20_000, headers: { Accept: "application/json" } });
  } catch (error) {
    throw new GraphApiError(`API Instagram : ${scrubSecrets(errorMessage(error))}`, "transient");
  }
  const percent = appUsagePercent(response.headers.get("x-app-usage"));
  if (percent !== undefined) usage.maxPercent = Math.max(usage.maxPercent, percent);
  const text = await response.text().catch(() => "");
  if (!response.ok) throw graphError(response.status, text, context);
  try {
    const body = JSON.parse(text) as T & GraphErrorBody;
    if (body.error) throw graphError(response.status, text, context);
    return body;
  } catch (error) {
    if (error instanceof GraphApiError) throw error;
    throw new GraphApiError("L'API Instagram a renvoyé une réponse JSON invalide.", "other");
  }
}

// ---------------------------------------------------------------------------
// Response shapes and mapping (pure)
// ---------------------------------------------------------------------------

export interface GraphMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  /** Business Discovery only; includes paid views (and Facebook crosspost views since April 2026). */
  view_count?: number;
  permalink?: string;
  /** ISO 8601 ("2026-09-30T18:00:00+0000") or unix seconds depending on the edge. */
  timestamp?: string | number;
  thumbnail_url?: string;
}

export interface BusinessDiscoveryResponse {
  business_discovery?: {
    username?: string;
    name?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data?: GraphMedia[] };
    id?: string;
  };
  id?: string;
}

export interface HashtagSearchResponse {
  data?: { id?: string }[];
}

export interface HashtagMediaResponse {
  data?: GraphMedia[];
}

/** Pure: Business Discovery → reel signals of the last 30 days (with the account's followers). */
export function businessDiscoveryToSignals(response: BusinessDiscoveryResponse, username: string, now: number): Signal[] {
  const account = response.business_discovery;
  if (!account) return [];
  const handle = `@${account.username ?? username}`;
  const followers = toCount(account.followers_count);
  const signals: Signal[] = [];
  for (const media of account.media?.data ?? []) {
    if (media.media_product_type !== "REELS" || !media.permalink) continue;
    const publishedAt = toIso(media.timestamp);
    if (!isRecent(publishedAt, now, MAX_AGE_MS)) continue;
    signals.push({
      id: `instagram_graph:${shortHash(media.permalink)}`,
      source: "instagram_graph",
      platform: "instagram",
      kind: "short_video",
      title: captionTitle(media.caption, `Reel de ${handle}`),
      text: truncate(media.caption),
      url: media.permalink,
      thumbnailUrl: media.thumbnail_url,
      author: handle,
      publishedAt,
      metrics: {
        views: toCount(media.view_count),
        likes: toCount(media.like_count),
        comments: toCount(media.comments_count),
        followers,
      },
      tags: extractHashtags(media.caption),
      related: [],
      query: handle,
      strength: 0,
    });
  }
  return signals;
}

/** Pure: hashtag top media → video signals of the last 30 days (no views, no author: Meta withholds them). */
export function hashtagMediaToSignals(response: HashtagMediaResponse, hashtag: string, now: number): Signal[] {
  const signals: Signal[] = [];
  for (const media of response.data ?? []) {
    if (media.media_type !== "VIDEO" || !media.permalink) continue;
    const publishedAt = toIso(media.timestamp);
    if (!isRecent(publishedAt, now, MAX_AGE_MS)) continue;
    signals.push({
      id: `instagram_graph:${shortHash(media.permalink)}`,
      source: "instagram_graph",
      platform: "instagram",
      kind: "short_video",
      title: captionTitle(media.caption, `Vidéo populaire #${hashtag}`),
      text: [truncate(media.caption, 420), `Top publications Instagram pour #${hashtag} (vues et auteur non fournis par Meta)`]
        .filter(Boolean)
        .join(" · "),
      url: media.permalink,
      publishedAt,
      metrics: { likes: toCount(media.like_count), comments: toCount(media.comments_count) },
      tags: extractHashtags(media.caption),
      related: [],
      query: hashtag,
      strength: 0,
    });
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

async function hashtagId(auth: GraphAuth, hashtag: string, signal: AbortSignal, usage: UsageTracker): Promise<string | undefined> {
  // Hashtag ids are static and global (same for every app): cache them for good.
  const { value } = await cached(`instagram_graph:hashtag_id:${hashtag}`, 365 * DAY_MS, async () => {
    const response = await graphGet<HashtagSearchResponse>(
      buildHashtagSearchUrl({ ...auth, hashtag }),
      { part: "hashtag", hashtag },
      signal,
      usage,
    );
    return response.data?.[0]?.id ?? null;
  });
  return value ?? undefined;
}

export async function fetchInstagramGraph(ctx: SourceContext): Promise<SourceFetchResult> {
  const token = ctx.env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? "";
  const igUserId = ctx.env.INSTAGRAM_USER_ID?.trim() ?? "";
  if (!token || !igUserId) {
    throw new SourceError("Instagram (API Meta) non configuré : renseignez INSTAGRAM_ACCESS_TOKEN et INSTAGRAM_USER_ID.");
  }
  const auth: GraphAuth = { version: graphVersion(ctx.env), igUserId, token };
  const { accounts, invalid } = parseWatchAccounts(ctx.env.INSTAGRAM_WATCH_ACCOUNTS);
  const hashtags = keywordsToHashtags(ctx.keywords, MAX_HASHTAGS);
  const warnings: string[] = [];
  if (invalid.length) warnings.push(`Nom(s) de compte ignoré(s) dans INSTAGRAM_WATCH_ACCOUNTS : ${invalid.slice(0, 5).join(", ")}.`);

  if (accounts.length === 0 && hashtags.length === 0) {
    return {
      signals: [],
      warning: [
        ...warnings,
        "Rien à analyser : listez des comptes Créateur/Entreprise dans INSTAGRAM_WATCH_ACCOUNTS ou ajoutez des mots-clés (recherche par hashtag).",
      ].join(" "),
    };
  }

  const usage: UsageTracker = { maxPercent: 0 };
  const [discovery, tags] = await Promise.all([
    mapWithConcurrency(accounts, 3, async (username) =>
      businessDiscoveryToSignals(
        await graphGet<BusinessDiscoveryResponse>(
          buildBusinessDiscoveryUrl({ ...auth, username }),
          { part: "discovery", username },
          ctx.signal,
          usage,
        ),
        username,
        ctx.now,
      ),
    ),
    mapWithConcurrency(hashtags, 3, async (hashtag) => {
      const id = await hashtagId(auth, hashtag, ctx.signal, usage);
      if (!id) return [];
      const media = await graphGet<HashtagMediaResponse>(
        buildHashtagTopMediaUrl({ ...auth, hashtagId: id }),
        { part: "hashtag", hashtag },
        ctx.signal,
        usage,
      );
      return hashtagMediaToSignals(media, hashtag, ctx.now);
    }),
  ]);

  const toError = (result: PromiseRejectedResult) =>
    result.reason instanceof GraphApiError
      ? result.reason
      : new GraphApiError(scrubSecrets(errorMessage(result.reason)), "other");
  const discoveryErrors = discovery.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(toError);
  const tagErrors = tags.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(toError);
  const errors = [...discoveryErrors, ...tagErrors];

  // An invalid token breaks everything: say it plainly instead of a pile of warnings.
  const tokenError = errors.find((e) => e.kind === "token");
  if (tokenError) throw tokenError;
  if (errors.length === accounts.length + hashtags.length) {
    throw errors.find((e) => e.kind !== "not_found") ?? errors[0];
  }

  const signals: Signal[] = [];
  const seen = new Set<string>();
  for (const result of [...discovery, ...tags]) {
    if (result.status !== "fulfilled") continue;
    for (const signal of result.value) {
      if (signal.url && seen.has(signal.url)) continue;
      if (signal.url) seen.add(signal.url);
      signals.push(signal);
    }
  }

  const notFound = discoveryErrors.filter((e) => e.kind === "not_found");
  if (notFound.length) warnings.push(notFound.map((e) => e.message).join(" "));
  const otherDiscoveryError = discoveryErrors.find((e) => e.kind !== "not_found");
  if (otherDiscoveryError) warnings.push(`Comptes surveillés incomplets : ${otherDiscoveryError.message}`);
  if (tagErrors.length) {
    const first = tagErrors[0];
    warnings.push(
      first.kind === "permission"
        ? `${first.message} Seuls les comptes surveillés sont analysés.`
        : `Recherche par hashtag incomplète : ${first.message}`,
    );
  }
  if (usage.maxPercent >= 80) {
    warnings.push(`Quota horaire de l'API Instagram utilisé à ${Math.round(usage.maxPercent)} % : espacez les analyses.`);
  }
  if (signals.length === 0) warnings.push("Aucun reel publié ces 30 derniers jours par les comptes ou hashtags suivis.");
  return { signals, warning: warnings.length ? warnings.join(" ") : undefined };
}

export const instagramGraphConnector: SourceConnector = {
  id: "instagram_graph",
  meta: {
    label: "Instagram (API officielle Meta)",
    platform: "instagram",
    free: true,
    needsKeywords: false,
    description:
      "API officielle de Meta : vues, likes, commentaires et nombre d'abonnés pour les reels récents des comptes Créateur ou Entreprise que vous surveillez (Business Discovery) — idéal pour repérer les reels qui dépassent l'audience de leur auteur. En option, les publications les plus populaires de vos hashtags (sans vues ni auteur : Meta ne les fournit pas).",
    envVars: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "INSTAGRAM_WATCH_ACCOUNTS"],
    setup: [
      "Passez votre compte Instagram en compte professionnel (Créateur ou Entreprise) : application Instagram → Paramètres → Type de compte et outils → Passer à un compte professionnel.",
      "Reliez ce compte à une Page Facebook (créez-en une si besoin) depuis les paramètres de la Page → Comptes liés → Instagram, ou depuis Meta Business Suite.",
      "Sur https://developers.facebook.com, créez un compte développeur, puis « Mes apps » → « Créer une app ». Ajoutez les produits « Facebook Login for Business » et « Instagram » (configuration de l'API avec Facebook Login). Les intitulés exacts de l'assistant Meta changent souvent.",
      "Ouvrez l'Explorateur de l'API Graph (https://developers.facebook.com/tools/explorer), choisissez votre app, cliquez sur « Generate Access Token » et cochez : instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement (et business_management si votre Page est gérée via Business Manager).",
      "Ce jeton ne dure qu'une à deux heures : échangez-le contre un jeton longue durée (environ 60 jours) dans l'outil de débogage des jetons (https://developers.facebook.com/tools/debug/accesstoken, bouton d'extension du jeton) ou via l'appel oauth/access_token?grant_type=fb_exchange_token avec l'identifiant et la clé secrète de l'app.",
      "Dans l'Explorateur, exécutez la requête me/accounts?fields=name,instagram_business_account{id,username} : l'identifiant de votre compte Instagram commence par 1784.",
      "Renseignez INSTAGRAM_ACCESS_TOKEN (le jeton longue durée) et INSTAGRAM_USER_ID (l'identifiant 1784…) dans .env.local ou chez votre hébergeur.",
      "Listez les comptes à surveiller dans INSTAGRAM_WATCH_ACCOUNTS : noms d'utilisateur séparés par des virgules, 10 maximum, comptes Créateur ou Entreprise uniquement (ex. : hugodecrypte,konbini). Redémarrez l'application.",
      "Optionnel : la recherche par hashtag (vos mots-clés) n'est possible que si Meta a accordé à votre app la fonctionnalité « Instagram Public Content Access » (validation de l'app et de l'entreprise). Sans elle, seuls les comptes surveillés sont analysés.",
      "Pensez à renouveler le jeton avant 60 jours : l'application vous préviendra s'il a expiré.",
    ],
    costNote:
      "Gratuit (API officielle Meta). Limites : environ 200 appels par heure, et 30 hashtags différents au maximum par période de 7 jours pour la recherche par hashtag. Les vues renvoyées incluent les vues sponsorisées et, depuis avril 2026, les vues Facebook des reels partagés.",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery",
    ttlMs: 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.INSTAGRAM_ACCESS_TOKEN?.trim() && env.INSTAGRAM_USER_ID?.trim()),
  fetch: fetchInstagramGraph,
};
