/**
 * Orchestrates one analysis run: fetch every requested source in parallel
 * (each result cached per source + parameters), merge and score the real
 * signals, then let Claude cluster them into topics — or group them
 * deterministically when no Anthropic key is set or the AI call fails.
 * Streams progress events as it goes.
 */

import { basicTopics } from "../analysis/cluster";
import { scoreSignals } from "../analysis/scoring";
import { stripAccents } from "../analysis/text";
import type {
  Analysis,
  AnalyzeEvent,
  AnalyzeRequest,
  Platform,
  Signal,
  SourceId,
  SourceRunSummary,
  Topic,
} from "../types";
import { aiModel, describeAiError, getAnthropic } from "./ai/client";
import { synthesizeTopics } from "./ai/synthesize";
import { cached } from "./cache";
import { SourceError } from "./http";
import { CONNECTORS } from "./sources";
import { scrubSecrets } from "./sources/social-utils";
import type { Env, SourceConnector, SourceContext, SourceFetchResult } from "./sources/types";

/** Hard cap per source; Apify actors run up to 120 s. */
const SOURCE_TIMEOUT_MS = 150_000;
/** Signals sent to Claude: enough for diversity, small enough for one prompt. */
const MAX_AI_SIGNALS = 160;
const MIN_AI_SIGNALS_PER_PLATFORM = 25;
/** Signals returned to the browser (kept in history, sent back with scripts). */
const MAX_ANALYSIS_SIGNALS = 250;
/** Matches the `signals` / `signalIds` caps of the script request schema. */
const MAX_EVIDENCE_PER_TOPIC = 100;

export const NO_AI_NOTE =
  "Mode sans IA : ajoutez ANTHROPIC_API_KEY pour que Claude regroupe les signaux en sujets, évalue leur pertinence pour votre niche et propose des angles. En attendant, les sujets ci-dessous sont regroupés automatiquement à partir des mêmes données réelles.";

export interface AnalysisDeps {
  /** Connector registry (tests inject fakes). */
  connectors?: Partial<Record<SourceId, SourceConnector>>;
  /** Epoch ms of the run (tests pin it). */
  now?: number;
  sourceTimeoutMs?: number;
}

interface SourceOutcome {
  summary: SourceRunSummary;
  signals: Signal[];
}

export async function runAnalysis(
  request: AnalyzeRequest,
  send: (event: AnalyzeEvent) => void,
  signal: AbortSignal,
  env: Env = process.env,
  deps: AnalysisDeps = {},
): Promise<Analysis> {
  const connectors = deps.connectors ?? CONNECTORS;
  const now = deps.now ?? Date.now();
  const timeoutMs = deps.sourceTimeoutMs ?? SOURCE_TIMEOUT_MS;
  if (signal.aborted) throw cancelled();
  // Late source events after a disconnect go nowhere.
  const emit = (event: AnalyzeEvent) => {
    if (!signal.aborted) send(event);
  };

  const sourceIds = [...new Set(request.sources)];
  const outcomes = await untilAborted(
    Promise.all(
      sourceIds.map((id) => runSource(id, connectors[id], { request, env, now, timeoutMs, emit })),
    ),
    signal,
  );

  const summaries = outcomes.map((outcome) => outcome.summary);
  const signals = scoreSignals(
    dedupeSignals(outcomes.flatMap((outcome) => outcome.signals)),
    now,
  );
  const notes = sourceNotes(summaries, connectors);

  let topics: Topic[] = [];
  let mode: Analysis["mode"] = "basic";
  let model: string | undefined;

  if (signals.length === 0) {
    emit({ type: "synthesis_start", signalCount: 0, mode: "basic" });
    notes.push(
      "Aucun signal n'a pu être récupéré : vérifiez les sources choisies (ou leur configuration dans Réglages) et relancez l'analyse.",
    );
  } else if (getAnthropic(env)) {
    const selected = selectForSynthesis(signals);
    emit({ type: "synthesis_start", signalCount: selected.length, mode: "ai" });
    try {
      const aiTopics = await untilAborted(
        synthesizeTopics({ signals: selected, request, signal, now, env }),
        signal,
      );
      if (aiTopics.length > 0) {
        topics = aiTopics;
        mode = "ai";
        model = aiModel(env);
        if (selected.length < signals.length) {
          notes.push(
            `Claude a analysé les ${selected.length} signaux les plus forts sur ${signals.length} (au moins les ${MIN_AI_SIGNALS_PER_PLATFORM} meilleurs de chaque plateforme).`,
          );
        }
      } else {
        notes.push(
          "Claude n'a retenu aucun sujet suffisamment étayé par les signaux : sujets regroupés automatiquement, sans angles proposés.",
        );
        topics = basicTopics(signals, request, now);
      }
    } catch (error) {
      if (signal.aborted) throw cancelled();
      console.error("[analyze] synthèse IA", error);
      notes.push(
        `Synthèse IA indisponible (${describeAiError(error)}) : sujets regroupés automatiquement à partir des mêmes données, sans angles proposés.`,
      );
      topics = basicTopics(signals, request, now);
    }
  } else {
    emit({ type: "synthesis_start", signalCount: signals.length, mode: "basic" });
    notes.push(NO_AI_NOTE);
    topics = basicTopics(signals, request, now);
  }

  const finalTopics = capEvidence(topics.slice(0, request.maxTopics), signals);
  const analysis: Analysis = {
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    request,
    mode,
    model,
    sources: summaries,
    signals: pickAnalysisSignals(finalTopics, signals),
    topics: finalTopics,
    notes,
  };
  emit({ type: "result", analysis });
  return analysis;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

interface RunContext {
  request: AnalyzeRequest;
  env: Env;
  now: number;
  timeoutMs: number;
  emit: (event: AnalyzeEvent) => void;
}

async function runSource(
  id: SourceId,
  connector: SourceConnector | undefined,
  { request, env, now, timeoutMs, emit }: RunContext,
): Promise<SourceOutcome> {
  emit({ type: "source_start", source: id });
  const started = Date.now();
  const finish = (summary: Omit<SourceRunSummary, "source" | "durationMs">, signals: Signal[] = []) => {
    const full: SourceRunSummary = { source: id, durationMs: Date.now() - started, ...summary };
    emit({ type: "source_done", summary: full });
    return { summary: full, signals };
  };

  if (!connector) return finish({ ok: false, count: 0, cached: false, error: "Source inconnue." });
  const { label, envVars, needsKeywords, ttlMs } = connector.meta;

  if (!connector.isConfigured(env)) {
    return finish({
      ok: true,
      skipped: true,
      count: 0,
      cached: false,
      warning: `${label} : source non configurée, ignorée. ${
        envVars.length ? `Définissez ${envVars.join(", ")} (voir Réglages).` : "Voir Réglages."
      }`,
    });
  }
  if (needsKeywords && request.keywords.length === 0) {
    return finish({
      ok: true,
      count: 0,
      cached: false,
      warning: `${label} a besoin de mots-clés ou hashtags de niche : ajoutez-en dans le Radar pour l'utiliser.`,
    });
  }

  try {
    const { value, cached: hit } = await cached(cacheKey(id, request), ttlMs, () =>
      // Timeout-only signal: the result is shared through the cache, so one
      // user's disconnect must not cancel it for everyone else.
      fetchWithDeadline(connector, {
        geo: request.geo,
        language: request.language,
        niche: request.niche,
        keywords: request.keywords,
        signal: AbortSignal.timeout(timeoutMs),
        now,
        env,
      }, timeoutMs),
    );
    // Cached objects are shared between runs: scoring and merging mutate copies.
    const signals = structuredClone(value.signals).filter((s) => s.source === id && s.id && s.title);
    return finish(
      {
        ok: true,
        count: signals.length,
        cached: hit,
        warning: value.warning ? redact(value.warning, env) : undefined,
      },
      signals,
    );
  } catch (error) {
    if (!(error instanceof SourceError)) console.error(`[analyze] ${id}`, error);
    return finish({ ok: false, count: 0, cached: false, error: sourceErrorMessage(error, env) });
  }
}

export function cacheKey(id: SourceId, request: Pick<AnalyzeRequest, "geo" | "language" | "keywords">): string {
  const keywords = [...new Set(request.keywords)].sort().join(",");
  return `${id}|${request.geo}|${request.language}|${keywords}`;
}

/** Rejects at the deadline even if a connector ignores its abort signal. */
function fetchWithDeadline(
  connector: SourceConnector,
  ctx: SourceContext,
  timeoutMs: number,
): Promise<SourceFetchResult> {
  return new Promise((resolve, reject) => {
    const onTimeout = () =>
      reject(new SourceError(`Délai dépassé (${Math.round(timeoutMs / 1000)} s)`, undefined, true));
    if (ctx.signal.aborted) return onTimeout();
    ctx.signal.addEventListener("abort", onTimeout, { once: true });
    connector
      .fetch(ctx)
      .then(resolve, reject)
      .finally(() => ctx.signal.removeEventListener("abort", onTimeout));
  });
}

/** Values of these env vars must never appear in a message sent to the browser. */
const SECRET_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "SERPAPI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_TOKEN",
  "INSTAGRAM_ACCESS_TOKEN",
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

function sourceErrorMessage(error: unknown, env: Env): string {
  if (error instanceof SourceError) return redact(error.message, env);
  const detail = error instanceof Error ? error.message : String(error);
  return redact(`Erreur inattendue : ${detail}`, env).slice(0, 300);
}

function sourceNotes(
  summaries: SourceRunSummary[],
  connectors: Partial<Record<SourceId, SourceConnector>>,
): string[] {
  const label = (id: SourceId) => connectors[id]?.meta.label ?? id;
  const notes: string[] = [];
  const skipped = summaries.filter((s) => s.skipped).map((s) => label(s.source));
  if (skipped.length) {
    notes.push(`Sources non configurées, ignorées : ${skipped.join(", ")}. Leur mise en place est expliquée dans Réglages.`);
  }
  const failed = summaries.filter((s) => !s.ok).map((s) => label(s.source));
  if (failed.length) {
    notes.push(`Sources en échec : ${failed.join(", ")}. Les sujets sont établis sans leurs données.`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Merge & select
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
  return stripAccents(title.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Canonical form of a URL for duplicate detection: no tracking params,
 * fragment, `www.` or trailing slash; YouTube Shorts and watch URLs unified.
 */
export function canonicalUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    if (host === "youtube.com" || host === "youtu.be") {
      const id =
        host === "youtu.be"
          ? url.pathname.slice(1)
          : (url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] ?? url.searchParams.get("v"));
      if (id) return `youtube.com/watch?v=${id}`;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_\w+|fbclid|gclid|igsh|igshid)$/i.test(key)) url.searchParams.delete(key);
    }
    return `${host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return raw.trim();
  }
}

const VIDEO_KINDS = new Set<Signal["kind"]>(["short_video", "video"]);

function mergeInto(target: Signal, duplicate: Signal): void {
  const metrics = target.metrics as Record<string, number | undefined>;
  for (const [key, value] of Object.entries(duplicate.metrics)) {
    if (metrics[key] === undefined && value !== undefined) metrics[key] = value;
  }
  target.tags = [...new Set([...target.tags, ...duplicate.tags])].slice(0, 30);
  const urls = new Set(target.related.map((r) => r.url));
  for (const link of duplicate.related) {
    if (target.related.length >= 20) break;
    if (!urls.has(link.url)) {
      target.related.push(link);
      urls.add(link.url);
    }
  }
  target.text ??= duplicate.text;
  target.author ??= duplicate.author;
  target.thumbnailUrl ??= duplicate.thumbnailUrl;
  target.publishedAt ??= duplicate.publishedAt;
  target.query ??= duplicate.query;
}

/**
 * Drops duplicates: same id, same canonical URL (across sources), or same
 * source + normalized title. Titles are not used for videos: two uploads
 * can legitimately share a title (daily shows, captionless reels).
 * The first occurrence is kept and enriched with what the duplicate adds.
 */
export function dedupeSignals(signals: Signal[]): Signal[] {
  const kept: Signal[] = [];
  const index = new Map<string, Signal>();
  for (const signal of signals) {
    const keys = [`id:${signal.id}`];
    const url = canonicalUrl(signal.url);
    if (url) keys.push(`url:${url}`);
    const title = normalizeTitle(signal.title);
    if (!VIDEO_KINDS.has(signal.kind) && title.length >= 3) keys.push(`title:${signal.source}:${title}`);

    const existing = keys.map((key) => index.get(key)).find((s): s is Signal => s !== undefined);
    const owner = existing ?? signal;
    if (existing) mergeInto(existing, signal);
    else kept.push(signal);
    for (const key of keys) if (!index.has(key)) index.set(key, owner);
  }
  return kept;
}

/**
 * Strongest signals for Claude while keeping diversity: the best
 * `perPlatform` of every platform first, then niche matches, then the rest
 * by strength.
 */
export function selectForSynthesis(
  signals: Signal[],
  max = MAX_AI_SIGNALS,
  perPlatform = MIN_AI_SIGNALS_PER_PLATFORM,
): Signal[] {
  const byStrength = [...signals].sort((a, b) => b.strength - a.strength);
  if (byStrength.length <= max) return byStrength;

  const perPlatformCount = new Map<Platform, number>();
  const tier1: Signal[] = [];
  for (const signal of byStrength) {
    const count = perPlatformCount.get(signal.platform) ?? 0;
    if (count < perPlatform) {
      tier1.push(signal);
      perPlatformCount.set(signal.platform, count + 1);
    }
  }
  const niche = byStrength.filter((s) => s.query);
  const chosen = new Set<string>();
  for (const signal of [...tier1, ...niche, ...byStrength]) {
    if (chosen.size >= max) break;
    chosen.add(signal.id);
  }
  return byStrength.filter((s) => chosen.has(s.id));
}

/**
 * Keeps evidence ids that exist, and caps them so that every referenced
 * signal fits in the analysis (≤ 250 in total) and in a script request.
 */
function capEvidence(topics: Topic[], signals: Signal[]): Topic[] {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const cap = Math.min(MAX_EVIDENCE_PER_TOPIC, Math.floor(MAX_ANALYSIS_SIGNALS / Math.max(1, topics.length)));
  return topics
    .map((topic) => {
      const ids = [...new Set(topic.signalIds)].filter((id) => byId.has(id));
      if (ids.length <= cap) return { ...topic, signalIds: ids };
      const strongest = new Set(
        [...ids].sort((a, b) => (byId.get(b)?.strength ?? 0) - (byId.get(a)?.strength ?? 0)).slice(0, cap),
      );
      return { ...topic, signalIds: ids.filter((id) => strongest.has(id)) };
    })
    .filter((topic) => topic.signalIds.length > 0);
}

/** Every signal referenced by a topic, then the strongest others, ≤ 250. */
function pickAnalysisSignals(topics: Topic[], signals: Signal[]): Signal[] {
  const referenced = new Set(topics.flatMap((topic) => topic.signalIds));
  const byStrength = [...signals].sort((a, b) => b.strength - a.strength);
  const kept = byStrength.filter((s) => referenced.has(s.id));
  for (const signal of byStrength) {
    if (kept.length >= MAX_ANALYSIS_SIGNALS) break;
    if (!referenced.has(signal.id)) kept.push(signal);
  }
  return kept.sort((a, b) => b.strength - a.strength);
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

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
