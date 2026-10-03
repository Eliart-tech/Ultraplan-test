/**
 * Recent public LinkedIn posts on the creator's niche keywords, with their
 * real reactions, comments and reposts, through the Apify actor
 * `harvestapi/linkedin-post-search` (no LinkedIn account or cookie used).
 * Posts that clearly beat the others are flagged by the scoring module.
 */

import { shortHash, truncate } from "../../analysis/text";
import type { Signal } from "../../types";
import { apifyMaxChargeUsd, runApifyActorDetailed, type ApifyErrorRow } from "./apify";
import { activityDate, activityIdFromUrl, LINKEDIN_MAX_AGE_DAYS, LINKEDIN_MAX_KEYWORDS, linkedinPostUrl } from "./linkedin";
import { captionTitle, clearlyNotFrench, DAY_MS, errorMessage, extractHashtags, isRecent, toCount, toIso } from "./social-utils";
import type { SourceConnector, SourceContext } from "./types";

export const LINKEDIN_POST_SEARCH_ACTOR = "harvestapi~linkedin-post-search";
const POSTS_PER_KEYWORD = 20;

/** Output row of harvestapi/linkedin-post-search (fields we use). */
export interface ApifyLinkedinPost {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  author?: {
    name?: string;
    publicIdentifier?: string;
    universalName?: string | null;
    type?: string;
    info?: string;
    linkedinUrl?: string;
  };
  postedAt?: { timestamp?: number; date?: string };
  engagement?: {
    /** Total reactions (all reaction types). */
    likes?: number;
    comments?: number;
    shares?: number;
  };
}

/** Pure: actor input for one keyword (posts of the past week, most relevant first). */
export function buildLinkedinApifyInput(keyword: string) {
  return {
    searchQueries: [keyword],
    maxPosts: POSTS_PER_KEYWORD,
    postedLimit: "week" as const,
    sortBy: "relevance" as const,
  };
}

export interface LinkedinNormalizeOptions {
  now: number;
  query: string;
  language: string;
}

/** Pure: dataset rows → signals (posts of the last 14 days, deduped by activity id). */
export function normalizeLinkedinPosts(items: ApifyLinkedinPost[], { now, query, language }: LinkedinNormalizeOptions): Signal[] {
  const byKey = new Map<string, Signal>();
  for (const item of items) {
    if (item.type && item.type !== "post") continue;
    const url = linkedinPostUrl(item.linkedinUrl);
    if (!url) continue;
    const activityId = item.id && /^\d+$/.test(item.id) ? item.id : activityIdFromUrl(url);
    const publishedAt = toIso(item.postedAt?.date) ?? toIso(item.postedAt?.timestamp) ?? activityDate(activityId, now);
    if (!isRecent(publishedAt, now, LINKEDIN_MAX_AGE_DAYS * DAY_MS)) continue;
    if (language === "fr" && clearlyNotFrench(item.content)) continue;

    const key = activityId ?? url;
    const author = item.author?.name?.trim() || item.author?.publicIdentifier || undefined;
    const signal: Signal = {
      id: `linkedin_apify:${shortHash(key)}`,
      source: "linkedin_apify",
      platform: "linkedin",
      kind: "social_post",
      title: captionTitle(item.content, `Publication de ${author ?? "un membre LinkedIn"}`, 160),
      text: [truncate(item.content, 460), item.author?.info ? `Auteur : ${truncate(item.author.info, 80)}` : undefined]
        .filter(Boolean)
        .join(" · ") || undefined,
      url,
      author,
      publishedAt,
      metrics: {
        likes: toCount(item.engagement?.likes),
        comments: toCount(item.engagement?.comments),
        shares: toCount(item.engagement?.shares),
      },
      tags: extractHashtags(item.content, 10),
      related: [],
      query,
      strength: 0,
    };
    if (!byKey.has(key)) byKey.set(key, signal);
  }
  return [...byKey.values()];
}

/** Pure: French warning for empty keywords, failed runs and error rows. */
export function linkedinApifyWarning(empty: string[], failures: string[], errorRows: ApifyErrorRow[]): string | undefined {
  const parts = [
    empty.length ? `Aucune publication LinkedIn récente pour « ${empty.join(" », « ")} ».` : "",
    failures.length ? `Recherche en échec pour ${failures.join(" ; ")}.` : "",
    errorRows.length ? `Apify a signalé ${errorRows.length} erreur(s).` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

export const linkedinApifyConnector: SourceConnector = {
  id: "linkedin_apify",
  meta: {
    label: "LinkedIn — publications et engagement (Apify)",
    platform: "linkedin",
    free: false,
    needsKeywords: true,
    description:
      "Publications LinkedIn publiques de la semaine sur vos mots-clés, avec leurs vraies réactions, commentaires et republications (acteur Apify « LinkedIn Post Search Scraper », sans compte LinkedIn). Les publications qui suscitent nettement plus d'engagement que les autres sont repérées. LinkedIn ne publie aucun classement « tendance » et n'expose pas le nombre de vues.",
    envVars: ["APIFY_TOKEN"],
    setup: [
      "Créez un compte sur https://apify.com (l'offre gratuite inclut 5 $ de crédit d'utilisation par mois).",
      "Dans la console Apify (https://console.apify.com), ouvrez Settings → API & Integrations et copiez votre « Personal API token ».",
      "Ajoutez APIFY_TOKEN=votre_jeton dans le fichier .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
      "Saisissez vos mots-clés de niche dans le Radar : les 3 premiers sont cherchés sur LinkedIn (20 publications chacun).",
      "Le même jeton active aussi Instagram et TikTok.",
    ],
    costNote:
      "Payant à l'usage : 2 $ pour 1 000 publications sur l'offre gratuite Apify (1,75 $ à 1,50 $ sur les offres supérieures). Une analyse = 3 mots-clés × 20 publications ≈ 0,12 $, plafonnée par APIFY_MAX_CHARGE_USD et mise en cache 6 h. Données publiques collectées par Apify, hors API officielle de LinkedIn : vérifiez que cet usage respecte les conditions de LinkedIn pour votre activité.",
    docsUrl: "https://apify.com/harvestapi/linkedin-post-search",
    ttlMs: 6 * 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.APIFY_TOKEN?.trim()),
  async fetch(ctx: SourceContext) {
    const keywords = [...new Set(ctx.keywords.map((k) => k.replace(/^#/, "").trim()).filter(Boolean))].slice(0, LINKEDIN_MAX_KEYWORDS);
    if (keywords.length === 0) {
      return { signals: [], warning: "LinkedIn (Apify) a besoin de mots-clés de niche pour chercher des publications." };
    }
    const token = ctx.env.APIFY_TOKEN?.trim() ?? "";
    const maxChargeUsd = apifyMaxChargeUsd(ctx.env);
    const outcomes = await Promise.allSettled(
      keywords.map((keyword) =>
        runApifyActorDetailed<ApifyLinkedinPost>(LINKEDIN_POST_SEARCH_ACTOR, buildLinkedinApifyInput(keyword), {
          token,
          signal: ctx.signal,
          maxChargeUsd,
        }),
      ),
    );

    const signals: Signal[] = [];
    const seen = new Set<string>();
    const empty: string[] = [];
    const failures: string[] = [];
    const errorRows: ApifyErrorRow[] = [];
    outcomes.forEach((outcome, index) => {
      const keyword = keywords[index];
      if (outcome.status === "rejected") {
        failures.push(`${keyword} (${errorMessage(outcome.reason)})`);
        return;
      }
      errorRows.push(...outcome.value.errorRows);
      const posts = normalizeLinkedinPosts(outcome.value.items, { now: ctx.now, query: keyword, language: ctx.language });
      if (posts.length === 0) empty.push(keyword);
      for (const post of posts) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        signals.push(post);
      }
    });
    if (failures.length === keywords.length) {
      throw outcomes[0].status === "rejected" ? outcomes[0].reason : new Error("LinkedIn (Apify) indisponible.");
    }
    return { signals, warning: linkedinApifyWarning(empty, failures, errorRows) };
  },
};
