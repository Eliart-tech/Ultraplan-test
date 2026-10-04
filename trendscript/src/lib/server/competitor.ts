/**
 * Orchestrates one competitor analysis: normalise the handle → fetch the
 * creator's real recent posts → compute the deterministic statistics →
 * Claude's qualitative analysis. Streams progress events as it goes.
 *
 * The collected data is never lost: without an Anthropic key, or when the
 * Claude call fails, the report is returned in "stats" mode with a French
 * note explaining why.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { CREATOR_PLATFORM_LABELS } from "../creators/labels";
import { computeCreatorStats, timeZoneForGeo } from "../creators/stats";
import type { CompetitorEvent, CompetitorReport, CompetitorRequest, CompetitorInsights, CreatorData, CreatorStats } from "../types";
import { describeAiError, getAnthropic } from "./ai/client";
import { analyzeCompetitor } from "./ai/competitor";
import { fetchCreator, normalizeHandle } from "./creators";
import { SourceError } from "./http";
import { scrubSecrets } from "./sources/social-utils";
import type { Env } from "./sources/types";

export const NO_AI_COMPETITOR_NOTE =
  "Mode statistiques : ajoutez ANTHROPIC_API_KEY (voir Réglages) pour que Claude analyse le positionnement, les hooks, ce qui fait venir les vues et les abonnés, les angles morts et vous propose 5 idées de vidéos pour vous démarquer. Les publications et les statistiques ci-dessous sont réelles.";

/** Below this many posts, every tendency is fragile. */
const FEW_POSTS = 8;

export interface CompetitorDeps {
  /** Creator fetcher (tests inject a fake). */
  fetch?: typeof fetchCreator;
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

/** Resolves like `promise` but rejects as soon as `signal` aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Deterministic notes about the limits of the sample. */
export function sampleNotes(data: CreatorData, stats: CreatorStats): string[] {
  const notes: string[] = [];
  if (stats.postCount < FEW_POSTS) {
    notes.push(`Seulement ${stats.postCount} publication(s) analysée(s) : les tendances sont à confirmer.`);
  }
  if (stats.rankingMetric === "engagement") {
    notes.push(
      "Vues non publiques pour la plupart des publications : classement par score d'engagement (likes + 3 × commentaires + 5 × partages).",
    );
  }
  if (data.ratiosAllowed === false) {
    notes.push(
      "Conditions de l'API YouTube : pas de métriques dérivées (taux d'engagement, portée, vues ÷ abonnés) sur la chaîne d'un autre créateur ; seuls les chiffres bruts et les classements sont affichés et analysés.",
    );
  } else if (data.account.followers === undefined) {
    notes.push("Nombre d'abonnés non fourni par la source : portée et multiplicateurs d'audience non calculables.");
  }
  return notes;
}

export async function runCompetitorAnalysis(
  request: CompetitorRequest,
  send: (event: CompetitorEvent) => void,
  signal: AbortSignal,
  env: Env = process.env,
  deps: CompetitorDeps = {},
): Promise<CompetitorReport> {
  const fetch = deps.fetch ?? fetchCreator;
  const now = deps.now ?? Date.now();
  const label = CREATOR_PLATFORM_LABELS[request.platform];
  if (signal.aborted) throw cancelled();
  // Late events after a disconnect go nowhere.
  const emit = (event: CompetitorEvent) => {
    if (!signal.aborted) send(event);
  };

  const handle = normalizeHandle(request.platform, request.handle);
  if (!handle) {
    throw new Error(
      `Compte ${label} non reconnu : « ${request.handle.trim().slice(0, 120)} ». Indiquez le pseudo (@pseudo) ou collez le lien du profil.`,
    );
  }

  emit({ type: "status", step: "fetch", message: `Récupération des publications de @${handle.replace(/^company\//, "")} sur ${label}…` });
  let data: CreatorData;
  try {
    data = await untilAborted(
      fetch(request.platform, handle, {
        env,
        signal,
        now,
        geo: request.geo,
        language: request.language,
        maxPosts: request.maxPosts,
      }),
      signal,
    );
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (!(error instanceof SourceError)) console.error("[competitor] récupération", error);
    const detail = error instanceof Error && error.message ? error.message : String(error);
    const message = error instanceof SourceError ? detail : `Erreur inattendue pendant la récupération des publications : ${detail}`;
    throw new Error(redact(message, env).slice(0, 600));
  }
  if (data.posts.length === 0) {
    throw new Error(
      `Aucune publication récupérée pour @${data.account.handle} sur ${label} : le compte est peut-être privé, vide ou sans vidéo récente.`,
    );
  }

  emit({ type: "status", step: "stats", message: "Calcul des statistiques…" });
  const stats = computeCreatorStats(data, { now, timeZone: timeZoneForGeo(request.geo) });
  emit({ type: "data", data, stats });

  const notes = sampleNotes(data, stats);
  const client = deps.client === undefined ? getAnthropic(env) : deps.client;
  let insights: CompetitorInsights | undefined;
  let model: string | undefined;

  if (!client) {
    notes.push(NO_AI_COMPETITOR_NOTE);
  } else {
    emit({ type: "status", step: "analysis", message: "Analyse par Claude…" });
    try {
      const analysis = await untilAborted(
        analyzeCompetitor({
          data,
          stats,
          request,
          signal,
          env,
          client,
          now,
          onProgress: (chars) => emit({ type: "progress", chars }),
        }),
        signal,
      );
      insights = analysis.insights;
      model = analysis.model;
      notes.push(...analysis.notes);
    } catch (error) {
      if (signal.aborted) throw cancelled();
      console.error("[competitor] analyse IA", error);
      notes.push(
        `Analyse par Claude indisponible (${redact(describeAiError(error), env)}) : publications et statistiques affichées sans l'analyse qualitative. Relancez l'analyse pour réessayer.`,
      );
    }
  }

  const focus = request.focus?.trim();
  const report: CompetitorReport = {
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    mode: insights ? "ai" : "stats",
    ...(model ? { model } : {}),
    ...(focus ? { focus } : {}),
    data,
    stats,
    ...(insights ? { insights } : {}),
    notes,
  };
  emit({ type: "result", report });
  return report;
}
