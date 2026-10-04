/**
 * Orchestrates one "Ce qui cartonne" analysis: collect the niche's recent
 * videos on each requested platform → read the authors' followers → score
 * every video against its creator's audience (code) → Claude's analysis of
 * what wins views and followers. Streams progress events as it goes.
 *
 * Nothing is invented: an unconfigured platform comes back as a summary with
 * its French setup note, a failing one with its error. The collected data is
 * never lost: without an Anthropic key, or when the Claude call fails, the
 * report is returned in "stats" mode with a French note explaining why.
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  VIRAL_PLATFORMS,
  type ViralEvent,
  type ViralPatterns,
  type ViralPlatform,
  type ViralPlatformSummary,
  type ViralPost,
  type ViralReport,
  type ViralRequest,
} from "../../types";
import { VIRAL_PLATFORM_LABELS, VIRAL_THRESHOLDS_NOTE } from "../../viral/labels";
import { platformStats, scoreViralPosts, type ViralPostInput } from "../../viral/score";
import { describeAiError, getAnthropic } from "../ai/client";
import { youtubeRatiosAllowed } from "../creators/youtube";
import { analyzeViral } from "../ai/viral";
import { SourceError } from "../http";
import { scrubSecrets } from "../sources/social-utils";
import type { Env } from "../sources/types";
import { viralCapabilities } from "./capabilities";
import { collectPlatform, type CollectContext, type PlatformCollection } from "./collect";
import { enrichFollowers, type EnrichContext, type EnrichResult } from "./enrich";

export const NO_AI_VIRAL_NOTE =
  "Mode statistiques : ajoutez ANTHROPIC_API_KEY (voir Réglages) pour que Claude extraie les recettes gagnantes, les accroches, ce qui fait s'abonner et 5 idées de vidéos pour toi. Les vidéos et les mesures ci-dessous sont réelles.";

/** Apify runs are capped at 120 s (+30 s for the HTTP answer). */
const COLLECT_TIMEOUT_MS = 170_000;
const ENRICH_TIMEOUT_MS = 150_000;
/** Videos kept in the report (stored in the browser), plus every video Claude cited. */
export const MAX_REPORT_POSTS = 100;
/** Below this many videos, Claude is not asked (nothing to compare). */
const MIN_POSTS_FOR_AI = 5;
/** Below this many measured videos, the tiers are fragile. */
const FEW_MEASURED = 10;

export interface ViralDeps {
  /** Platform collector (tests inject a fake). */
  collect?: (platform: ViralPlatform, ctx: CollectContext) => Promise<PlatformCollection>;
  /** Follower enrichment (tests inject a fake). */
  enrich?: (posts: ViralPostInput[], ctx: EnrichContext) => Promise<EnrichResult>;
  /** Claude client; `null` forces the stats-only mode. Defaults to one built from ANTHROPIC_API_KEY. */
  client?: Anthropic | null;
  /** Epoch ms of the run (tests pin it). */
  now?: number;
}

/** Values of these env vars must never appear in a message sent to the browser. */
const SECRET_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "APIFY_TOKEN",
  "YOUTUBE_API_KEY",
  "INSTAGRAM_ACCESS_TOKEN",
  "FIRECRAWL_API_KEY",
  "SERPAPI_API_KEY",
  "APP_PASSWORD",
  "AUTH_SECRET",
];

function redact(message: string, env: Env): string {
  let clean = scrubSecrets(message);
  for (const name of SECRET_ENV_VARS) {
    const value = env[name]?.trim();
    if (value && value.length >= 8) clean = clean.split(value).join("***");
  }
  return clean;
}

function cancelled(): Error {
  const error = new Error("Analyse annulée.");
  error.name = "AbortError";
  return error;
}

/** Resolves like `promise` but rejects as soon as `signal` aborts (shared fetches keep running for the cache). */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function joinWarnings(parts: (string | undefined)[]): string | undefined {
  const unique = [...new Set(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)))];
  return unique.length ? unique.join(" ") : undefined;
}

/** Pure: the first `max` videos (best first) plus any video Claude cited beyond them. */
export function selectReportPosts(posts: readonly ViralPost[], keepIds: readonly string[], max = MAX_REPORT_POSTS): ViralPost[] {
  const keep = new Set(keepIds);
  return posts.filter((post, index) => index < max || keep.has(post.id));
}

/** Deterministic notes about the sample. */
export function sampleNotes(posts: readonly ViralPost[]): string[] {
  const measured = posts.filter((post) => post.multiplier !== undefined).length;
  const notes = [VIRAL_THRESHOLDS_NOTE];
  if (posts.some((post) => post.platform !== "youtube" || post.multiplier !== undefined)) {
    notes.push(
      measured < FEW_MEASURED
        ? `Multiplicateur d'audience calculable pour seulement ${measured} vidéo(s) sur ${posts.length} (abonnés de l'auteur inconnus pour les autres) : tendances à confirmer.`
        : `Multiplicateur d'audience calculable pour ${measured} vidéos sur ${posts.length} (abonnés de l'auteur connus).`,
    );
  }
  return notes;
}

interface PlatformOutcome {
  platform: ViralPlatform;
  collection?: PlatformCollection;
  /** Summary sent with platform_done (no collection: unavailable or failed). */
  summary: ViralPlatformSummary;
}

export async function runViralAnalysis(
  request: ViralRequest,
  send: (event: ViralEvent) => void,
  signal: AbortSignal,
  env: Env = process.env,
  deps: ViralDeps = {},
): Promise<ViralReport> {
  const collect = deps.collect ?? collectPlatform;
  const enrich = deps.enrich ?? enrichFollowers;
  const now = deps.now ?? Date.now();
  if (signal.aborted) throw cancelled();
  // Late events after a disconnect go nowhere.
  const emit = (event: ViralEvent) => {
    if (!signal.aborted) send(event);
  };

  const platforms = VIRAL_PLATFORMS.filter((platform) => request.platforms.includes(platform));
  const capabilities = new Map(viralCapabilities(env).map((status) => [status.platform, status]));
  emit({
    type: "status",
    step: "collect",
    message: `Recherche des vidéos de ta niche sur ${platforms.map((platform) => VIRAL_PLATFORM_LABELS[platform]).join(", ")}…`,
  });

  // --- Collection (parallel; each platform reports as soon as it is done) ---
  const collectContext: CollectContext = {
    keywords: request.keywords,
    periodDays: request.periodDays,
    geo: request.geo,
    language: request.language,
    env,
    // Shared through the cache: one user's disconnect must not cancel it for everyone.
    signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS),
    now,
  };
  const runPlatform = async (platform: ViralPlatform): Promise<PlatformOutcome> => {
    emit({ type: "platform_start", platform });
    const capability = capabilities.get(platform);
    const finish = (outcome: PlatformOutcome) => {
      emit({ type: "platform_done", summary: outcome.summary });
      return outcome;
    };
    if (!capability?.available) {
      return finish({
        platform,
        summary: {
          platform,
          count: 0,
          withFollowers: 0,
          ratiosAllowed: platform !== "youtube" || youtubeRatiosAllowed(env),
          source: capability?.via ?? "Non configuré",
          warning: capability?.note ?? "Plateforme non configurée.",
        },
      });
    }
    try {
      const collection = await collect(platform, collectContext);
      const scored = scoreViralPosts(collection.posts, { now, ratiosAllowed: { [platform]: collection.ratiosAllowed } });
      return finish({
        platform,
        collection,
        summary: {
          platform,
          ...platformStats(scored, platform),
          ratiosAllowed: collection.ratiosAllowed,
          source: collection.source,
          ...(joinWarnings(collection.warnings) ? { warning: joinWarnings(collection.warnings) } : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof SourceError)) console.error(`[viral] collecte ${platform}`, error);
      const detail = error instanceof Error && error.message ? error.message : String(error);
      const message = error instanceof SourceError ? detail : `Erreur inattendue pendant la collecte : ${detail}`;
      return finish({
        platform,
        summary: {
          platform,
          count: 0,
          withFollowers: 0,
          ratiosAllowed: platform !== "youtube" || youtubeRatiosAllowed(env),
          source: capability.via,
          error: redact(message, env).slice(0, 600),
        },
      });
    }
  };
  const outcomes = await untilAborted(Promise.all(platforms.map(runPlatform)), signal);

  const collected = outcomes.flatMap((outcome) => outcome.collection?.posts ?? []);
  if (collected.length === 0) {
    const reasons = outcomes
      .map((outcome) => `${VIRAL_PLATFORM_LABELS[outcome.platform]} : ${outcome.summary.error ?? outcome.summary.warning ?? "aucune vidéo trouvée"}`)
      .join(" ; ");
    throw new Error(`Aucune vidéo récupérée pour ces mots-clés. ${reasons}`.slice(0, 1200));
  }

  // --- Followers of the authors ---
  let posts = collected;
  const enrichNotes: EnrichResult["notes"] = {};
  if (collected.some((post) => post.platform === "instagram" || post.platform === "youtube")) {
    emit({ type: "status", step: "enrich", message: "Récupération des abonnés des auteurs…" });
    try {
      const enriched = await untilAborted(enrich(collected, { env, signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS) }), signal);
      posts = enriched.posts;
      Object.assign(enrichNotes, enriched.notes);
    } catch (error) {
      if (signal.aborted) throw cancelled();
      console.error("[viral] abonnés", error);
      const message = redact(error instanceof Error ? error.message : String(error), env);
      for (const platform of ["instagram", "youtube"] as const) enrichNotes[platform] = [`Abonnés des auteurs indisponibles (${message}).`];
    }
  }

  // --- Scores (code) ---
  const ratiosAllowed = Object.fromEntries(
    outcomes.map((outcome) => [outcome.platform, outcome.collection?.ratiosAllowed ?? outcome.summary.ratiosAllowed]),
  ) as Partial<Record<ViralPlatform, boolean>>;
  const scored = scoreViralPosts(posts, { now, ratiosAllowed });
  const summaries: ViralPlatformSummary[] = outcomes.map(({ platform, collection, summary }) => {
    if (!collection) return summary;
    const warning = joinWarnings([...collection.warnings, ...(enrichNotes[platform] ?? [])]);
    return {
      platform,
      ...platformStats(scored, platform),
      ratiosAllowed: collection.ratiosAllowed,
      source: collection.source,
      ...(warning ? { warning } : {}),
    };
  });
  const notes = sampleNotes(scored);

  // --- Claude ---
  const client = deps.client === undefined ? getAnthropic(env) : deps.client;
  let patterns: ViralPatterns | undefined;
  let model: string | undefined;
  let cited: string[] = [];
  if (!client) {
    notes.push(NO_AI_VIRAL_NOTE);
  } else if (scored.length < MIN_POSTS_FOR_AI) {
    notes.push(
      `Seulement ${scored.length} vidéo(s) récupérée(s) : trop peu pour que Claude compare ce qui marche à ce qui ne marche pas. Ajoutez des mots-clés, une plateforme ou passez à 30 jours.`,
    );
  } else {
    emit({ type: "status", step: "analysis", message: "Analyse par Claude…" });
    try {
      const analysis = await untilAborted(
        analyzeViral({
          posts: scored,
          platforms: summaries,
          request,
          signal,
          env,
          client,
          now,
          onProgress: (chars) => emit({ type: "progress", chars }),
        }),
        signal,
      );
      patterns = analysis.patterns;
      model = analysis.model;
      cited = analysis.postIds;
      notes.push(...analysis.notes);
    } catch (error) {
      if (signal.aborted) throw cancelled();
      console.error("[viral] analyse IA", error);
      notes.push(
        `Analyse par Claude indisponible (${redact(describeAiError(error), env)}) : vidéos et mesures affichées sans les recettes. Relancez l'analyse pour réessayer.`,
      );
    }
  }

  const report: ViralReport = {
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    request,
    mode: patterns ? "ai" : "stats",
    ...(model ? { model } : {}),
    posts: selectReportPosts(scored, cited),
    platforms: summaries,
    ...(patterns ? { patterns } : {}),
    notes,
  };
  emit({ type: "result", report });
  return report;
}
