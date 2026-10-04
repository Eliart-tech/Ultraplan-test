/**
 * Script generation pipeline (Prompt B):
 *   guardrails → research (optional web search) + free enrichment (Google
 *   News headlines, SerpApi related searches when configured) → structured
 *   writing call streamed as progress → optional critical review pass
 *   (settings.review: a second call where Claude rereads the draft as a
 *   demanding editor, with the code checks, and returns an improved draft)
 *   → code checks → GeneratedScript.
 *
 * Enrichment failures never block the script: they become warnings. Links
 * Claude cites that were not in the material it was given are removed — the
 * creator must be able to trust every source shown.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { applyGuardrails } from "../../script/guardrails";
import { checkCompetitorOverlap, checkScript } from "../../script/checks";
import { countWords, estimateDuration, wordBudget } from "../../script/metrics";
import { buildReviewUser, buildScriptPrompt, type Headline, knownUrls, REVIEW_INSTRUCTIONS } from "../../script/prompt";
import type {
  GeneratedScript,
  RelatedLink,
  ResearchBrief,
  ScriptDraft,
  ScriptEvent,
  ScriptRequest,
  Signal,
} from "../../types";
import { searchGoogleNews } from "../sources/google-news";
import { serpapiRelatedQueries } from "../sources/serpapi-trends";
import type { Env } from "../sources/types";
import { aiModel, AiError, callStructured, describeAiError, getAnthropic } from "./client";
import { PLAYBOOK, RUBRIC_CRITERIA } from "./playbook";
import { researchTopic } from "./research";

// ---------------------------------------------------------------------------
// Output contract (field order = writing order: script first, audit last)
// ---------------------------------------------------------------------------

export const scriptOutputSchema = z.object({
  title: z.string().describe("Titre de travail / titre YouTube, mot-clé au début, 100 caractères maximum"),
  hooks: z
    .array(
      z.object({
        style: z.string(),
        spoken: z.string().describe("Phrase dite, 15 mots maximum"),
        onScreenText: z.string().describe("7 mots maximum"),
        visual: z.string(),
        rationale: z.string(),
      }),
    )
    .describe("Exactement 3 variantes ; la première est utilisée dans beats et fullScript"),
  beats: z.array(
    z.object({
      startSec: z.number(),
      endSec: z.number(),
      label: z.string(),
      voiceover: z.string(),
      onScreenText: z.string(),
      visual: z.string(),
      editing: z.string(),
    }),
  ),
  fullScript: z.string().describe("Concaténation exacte des voiceover, un paragraphe par temps, sans indication scénique"),
  cta: z.string(),
  caption: z.string().describe("Légende sans hashtags"),
  hashtags: z.array(z.string()),
  factsToVerify: z.array(
    z.object({
      claim: z.string(),
      sourceUrl: z.string().nullable().describe("URL fournie dans le message, recopiée à l'identique, ou null"),
      confidence: z.enum(["haute", "moyenne", "faible"]),
    }),
  ),
  sources: z.array(z.object({ title: z.string(), url: z.string(), source: z.string() })),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  checklist: z
    .array(z.object({ criterion: z.string(), passed: z.boolean(), comment: z.string() }))
    .describe(`Les ${RUBRIC_CRITERIA.length} critères de la grille qualité, dans l'ordre (plus le critère de différenciation s'il est demandé)`),
});
export type ScriptOutput = z.infer<typeof scriptOutputSchema>;

/** Review pass: what changed first (the editor's plan), then the full final draft. */
export const reviewOutputSchema = z.object({
  changes: z
    .array(z.string())
    .describe("2 à 6 changements « quoi → pourquoi », du plus important au moins important"),
  ...scriptOutputSchema.shape,
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

// ---------------------------------------------------------------------------
// Post-processing (pure)
// ---------------------------------------------------------------------------

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value).trim();

export function urlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const body = raw.replace(/^#+/, "").replace(/[\s#]+/g, "");
    if (!body) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(`#${clip(body, 99)}`);
  }
  return result;
}

/**
 * Claude's answer → ScriptDraft: trims to the request-schema limits (so the
 * draft can be sent back for refinement), normalizes hashtags, and removes
 * any link that was not in the material given to Claude. Returns how many
 * links were removed.
 */
export function sanitizeDraft(output: ScriptOutput, known: Set<string>): { draft: ScriptDraft; removedLinks: number } {
  const knownKeys = new Set([...known].map(urlKey));
  const isKnown = (url: string) => isHttpUrl(url) && knownKeys.has(urlKey(url));
  let removedLinks = 0;

  const sources: RelatedLink[] = [];
  const seenSources = new Set<string>();
  for (const source of output.sources) {
    if (!isKnown(source.url)) {
      removedLinks++;
      continue;
    }
    const key = urlKey(source.url);
    if (seenSources.has(key)) continue;
    seenSources.add(key);
    sources.push({
      title: clip(source.title || source.url, 400),
      url: source.url.trim(),
      ...(source.source.trim() ? { source: clip(source.source, 200) } : {}),
    });
  }

  const factsToVerify = output.factsToVerify.map((fact) => {
    const url = fact.sourceUrl?.trim() || null;
    if (url && !isKnown(url)) {
      removedLinks++;
      return { claim: clip(fact.claim, 1000), sourceUrl: null, confidence: "faible" as const };
    }
    return { claim: clip(fact.claim, 1000), sourceUrl: url, confidence: fact.confidence };
  });

  const draft: ScriptDraft = {
    title: clip(output.title, 300),
    hooks: output.hooks.slice(0, 3).map((hook) => ({
      style: clip(hook.style, 100),
      spoken: clip(hook.spoken, 1000),
      onScreenText: clip(hook.onScreenText, 300),
      visual: clip(hook.visual, 1000),
      rationale: clip(hook.rationale, 1000),
    })),
    beats: output.beats.map((beat) => ({
      startSec: beat.startSec,
      endSec: beat.endSec,
      label: clip(beat.label, 100),
      voiceover: clip(beat.voiceover, 3000),
      onScreenText: clip(beat.onScreenText, 500),
      visual: clip(beat.visual, 1000),
      editing: clip(beat.editing, 1000),
    })),
    fullScript: clip(output.fullScript, 20000),
    caption: clip(output.caption, 5000),
    hashtags: normalizeHashtags(output.hashtags),
    cta: clip(output.cta, 1000),
    strengths: output.strengths.map((s) => clip(s, 1000)).filter(Boolean),
    risks: output.risks.map((s) => clip(s, 1000)).filter(Boolean),
    checklist: output.checklist.map((item) => ({
      criterion: clip(item.criterion, 300),
      passed: item.passed,
      comment: clip(item.comment, 1000),
    })),
    factsToVerify,
    sources,
  };
  return { draft, removedLinks };
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

const GEO_BY_LANGUAGE: Record<string, string> = { fr: "FR", en: "US", es: "ES", de: "DE", it: "IT", pt: "PT", nl: "NL" };

export function resolveGeo(request: ScriptRequest): string {
  return (request.geo ?? GEO_BY_LANGUAGE[request.settings.language] ?? "FR").toUpperCase();
}

/** The real search query when the topic comes from Google Trends, else its main keyword. */
export function enrichmentQuery(request: ScriptRequest): string {
  const trend = request.signals.find((s) => s.kind === "search_trend");
  return (trend?.title ?? request.topic.keywords[0] ?? request.topic.title).trim();
}

function toHeadline(signal: Signal): Headline {
  return { title: signal.title, url: signal.url, source: signal.author, publishedAt: signal.publishedAt };
}

type RelatedQueriesResult = Awaited<ReturnType<typeof serpapiRelatedQueries>>;

function relatedList(result: RelatedQueriesResult): { query: string; value: string }[] {
  const rising = result.rising.map((q) => ({ query: q.query, value: q.breakout ? "Record (> +5 000 %)" : q.value }));
  const top = result.top.map((q) => ({ query: q.query, value: `intérêt ${q.value}` }));
  const seen = new Set<string>();
  return [...rising.slice(0, 6), ...top.slice(0, 4)].filter((q) => {
    const key = q.query.toLowerCase();
    if (!q.query.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const MAX_TOKENS = 32_000;
const HEADLINES = 8;

export interface ScriptDeps {
  client?: Anthropic;
  searchNews?: typeof searchGoogleNews;
  relatedQueries?: typeof serpapiRelatedQueries;
  research?: typeof researchTopic;
  now?: () => number;
}

interface Enrichment {
  brief?: ResearchBrief;
  headlines: Headline[];
  related: { query: string; value: string }[];
  warnings: string[];
}

async function enrich(
  request: ScriptRequest,
  send: (event: ScriptEvent) => void,
  signal: AbortSignal,
  env: Env,
  deps: Required<Pick<ScriptDeps, "searchNews" | "relatedQueries" | "research">> & { client: Anthropic; now: number },
): Promise<Enrichment> {
  const { settings } = request;
  const geo = resolveGeo(request);
  const query = enrichmentQuery(request);
  const serpapiKey = env.SERPAPI_API_KEY?.trim();
  const warnings: string[] = [];

  send({
    type: "status",
    step: "research",
    message: settings.research
      ? "Recherche web et vérification des faits (jusqu'à 5 recherches)…"
      : "Collecte des titres de presse récents…",
  });

  const [research, news, related] = await Promise.allSettled([
    settings.research
      ? deps.research({
          topic: request.topic,
          signals: request.signals,
          settings,
          geo,
          signal,
          env,
          angle: request.angle,
          client: deps.client,
          now: deps.now,
        })
      : Promise.resolve(undefined),
    deps.searchNews(query, { geo, language: settings.language, signal, limit: HEADLINES }),
    serpapiKey
      ? deps.relatedQueries(query, { geo, language: settings.language, signal, apiKey: serpapiKey })
      : Promise.resolve({ rising: [], top: [] } as RelatedQueriesResult),
  ]);
  if (signal.aborted) throw new AiError("Génération annulée.");

  let brief: ResearchBrief | undefined;
  if (research.status === "fulfilled") {
    brief = research.value;
    if (brief) send({ type: "research", brief });
  } else {
    warnings.push(
      `Recherche web indisponible (${describeAiError(research.reason)}) : script écrit à partir des seules données de l'analyse.`,
    );
  }
  const headlines = news.status === "fulfilled" ? news.value.map(toHeadline) : [];
  if (news.status === "rejected") {
    console.warn("[script] Google News", news.reason);
  }
  const relatedQueries = related.status === "fulfilled" ? relatedList(related.value) : [];
  if (related.status === "rejected") {
    warnings.push("Recherches associées SerpApi indisponibles : mots-clés de référencement non enrichis.");
  }
  return { brief, headlines, related: relatedQueries, warnings };
}

async function run(
  request: ScriptRequest,
  send: (event: ScriptEvent) => void,
  signal: AbortSignal,
  env: Env,
  deps: ScriptDeps,
): Promise<GeneratedScript> {
  const client = deps.client ?? getAnthropic(env);
  if (!client) {
    throw new AiError(
      "Génération de script indisponible : ajoutez ANTHROPIC_API_KEY dans les variables d'environnement (voir Réglages), puis redémarrez.",
    );
  }
  const now = deps.now?.() ?? Date.now();
  const model = aiModel(env);

  const { settings, notices } = applyGuardrails(request.topic, request.settings);
  const guarded: ScriptRequest = { ...request, settings, geo: resolveGeo(request) };

  // Refinement keeps the facts of the previous draft: no new research.
  const enrichment: Enrichment = request.refine
    ? { headlines: [], related: [], warnings: [] }
    : await enrich(guarded, send, signal, env, {
        client,
        now,
        searchNews: deps.searchNews ?? searchGoogleNews,
        relatedQueries: deps.relatedQueries ?? serpapiRelatedQueries,
        research: deps.research ?? researchTopic,
      });

  const budget = wordBudget(settings.durationSec, settings.pace);
  const prompt = buildScriptPrompt(guarded, {
    playbook: PLAYBOOK,
    budget,
    brief: enrichment.brief,
    headlines: enrichment.headlines,
    relatedQueries: enrichment.related,
    now,
  });

  send({
    type: "status",
    step: "writing",
    message: request.refine ? "Affinage du script…" : "Écriture du script…",
  });
  const result = await callStructured({
    client,
    model,
    system: [prompt.systemStable, prompt.systemSettings],
    user: prompt.user,
    schema: scriptOutputSchema,
    effort: "high",
    maxTokens: MAX_TOKENS,
    signal,
    task: "l'écriture du script",
    tooLongHint: "choisissez une durée plus courte ou simplifiez les consignes, puis relancez.",
    onProgress: (chars) => send({ type: "progress", chars }),
  });

  const known = knownUrls(guarded, { brief: enrichment.brief, headlines: enrichment.headlines });
  let { draft, removedLinks } = sanitizeDraft(result.data, known);
  let writtenBy = result.model;
  const modelWarnings = result.fellBack
    ? [`Le modèle principal a décliné la demande : script rédigé par ${result.model} (repli automatique).`]
    : [];
  let reviewNotes: string[] | undefined;

  // Refinement is a targeted edit asked by the creator: no second opinion.
  if (settings.review && !request.refine) {
    const review = await reviewDraft({ client, model, prompt, draft, known, request: guarded, budget, signal, send });
    if (review.ok) {
      ({ draft, removedLinks } = review);
      writtenBy = review.model;
      reviewNotes = review.notes;
      if (review.fellBack) {
        modelWarnings.push(`Le modèle principal a décliné la relecture : relecture faite par ${review.model} (repli automatique).`);
      }
    } else {
      modelWarnings.push(review.warning);
    }
  }

  send({ type: "status", step: "finalizing", message: "Vérification du script…" });
  const wordCount = countWords(draft.fullScript);
  const warnings = [
    ...notices,
    ...enrichment.warnings,
    ...modelWarnings,
    ...(removedLinks > 0
      ? [
          `${removedLinks} lien(s) cité(s) par Claude ne figurai(en)t pas dans les sources fournies : retiré(s), affirmations concernées passées en confiance faible.`,
        ]
      : []),
    ...checkScript(draft, settings, budget),
    ...checkCompetitorOverlap(draft, guarded.competitors),
  ];

  const script: GeneratedScript = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    model: writtenBy,
    wordCount,
    wordBudget: budget,
    estimatedDurationSec: estimateDuration(wordCount, settings.pace),
    warnings: [...new Set(warnings)],
    ...(enrichment.brief ? { research: enrichment.brief } : {}),
    ...(reviewNotes ? { reviewNotes } : {}),
  };
  send({ type: "result", script });
  return script;
}

// ---------------------------------------------------------------------------
// Critical review pass
// ---------------------------------------------------------------------------

const MAX_REVIEW_NOTES = 8;

/** Shown when the editor kept the draft as it was. */
export const REVIEW_NO_CHANGE = "Relecture critique : aucune modification nécessaire, le premier jet tenait déjà la grille.";

type ReviewResult =
  | { ok: true; draft: ScriptDraft; removedLinks: number; model: string; fellBack: boolean; notes: string[] }
  | { ok: false; warning: string };

/**
 * Second structured call: Claude rereads the draft as a demanding editor,
 * with the same brief and evidence plus the code checks of the draft, and
 * returns the full improved draft and what it changed. Any failure (other
 * than a cancellation) keeps the first draft, with a warning.
 */
async function reviewDraft({
  client,
  model,
  prompt,
  draft,
  known,
  request,
  budget,
  signal,
  send,
}: {
  client: Anthropic;
  model: string;
  prompt: ReturnType<typeof buildScriptPrompt>;
  draft: ScriptDraft;
  known: Set<string>;
  request: ScriptRequest;
  budget: number;
  signal: AbortSignal;
  send: (event: ScriptEvent) => void;
}): Promise<ReviewResult> {
  send({ type: "status", step: "review", message: "Relecture critique…" });
  const controls = [...checkScript(draft, request.settings, budget), ...checkCompetitorOverlap(draft, request.competitors)];
  try {
    const result = await callStructured({
      client,
      model,
      // The writing call's blocks first, unchanged: the cached prefix is reused.
      system: [prompt.systemStable, prompt.systemSettings, REVIEW_INSTRUCTIONS],
      user: buildReviewUser(prompt.user, draft, controls),
      schema: reviewOutputSchema,
      effort: "high",
      maxTokens: MAX_TOKENS,
      signal,
      task: "la relecture critique du script",
      tooLongHint: "désactivez la relecture critique ou choisissez une durée plus courte, puis relancez.",
      onProgress: (chars) => send({ type: "progress", chars }),
    });
    const { changes, ...output } = result.data;
    const { draft: reviewed, removedLinks } = sanitizeDraft(output, known);
    const notes = changes
      .map((change) => clip(change.replace(/\s+/g, " "), 500))
      .filter(Boolean)
      .slice(0, MAX_REVIEW_NOTES);
    return {
      ok: true,
      draft: reviewed,
      removedLinks,
      model: result.model,
      fellBack: result.fellBack,
      notes: notes.length ? notes : [REVIEW_NO_CHANGE],
    };
  } catch (error) {
    if (signal.aborted) throw new AiError("Génération annulée.");
    console.warn("[script] relecture critique", error);
    return { ok: false, warning: `Relecture critique indisponible (${describeAiError(error)}) : première version conservée.` };
  }
}

export async function generateScript(
  request: ScriptRequest,
  send: (e: ScriptEvent) => void,
  signal: AbortSignal,
  env: Env = process.env,
  deps: ScriptDeps = {},
): Promise<GeneratedScript> {
  try {
    return await run(request, send, signal, env, deps);
  } catch (error) {
    if (error instanceof AiError) throw error;
    console.error("[script]", error);
    throw new AiError(describeAiError(error));
  }
}
