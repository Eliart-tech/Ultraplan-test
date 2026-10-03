/**
 * The in-page "server" of the HTML edition. `window.fetch` is wrapped so
 * that the app's own API calls are answered here by the real server code:
 *
 *   GET  /api/sources      getSourceStatuses() + edition availability
 *   POST /api/analyze      runAnalysis() streamed as SSE (sseResponse)
 *   POST /api/script       generateScript() streamed as SSE (sseResponse)
 *   POST /api/auth/logout  { ok: true } (no password gate in this edition)
 *
 * Bodies are validated with the real zod schemas (same JSON 400 errors as the
 * server). Google RSS feeds requested by the connectors
 * (trends.google.com/trending/rss, news.google.com/rss…) are fetched through
 * the viewer's Firecrawl connector; every other URL goes to the real fetch.
 */

import { generateScript } from "@/lib/server/ai/script";
import { NO_AI_NOTE, runAnalysis } from "@/lib/server/analyze";
import { jsonError, parseJsonBody } from "@/lib/server/request";
import { getSourceStatuses } from "@/lib/server/sources";
import { analyzeRequestSchema, scriptRequestSchema } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import type { Analysis, AnalyzeEvent, ScriptEvent, ScriptRequest, SourceId, SourceStatus } from "@/lib/types";
import { capabilitiesWithin, getEditionState, resolveCapabilities } from "./capabilities";
import { createEditionConnectors } from "./connectors";
import { AI_MODEL_LABEL, EDITION_ENV, frenchDate, frenchDateTime, SERVER_ONLY_SENTENCE, STALE_AFTER_MS } from "./edition";
import { claudeProblem, firecrawlMode } from "./edition-text";
import { firecrawlFetchXml } from "./firecrawl";
import { researchWithClaudeAi } from "./research";
import { getClaudeClient } from "./sample-client";
import type { EditionAnalysis, EditionSignal, EditionTopic, Snapshot } from "./snapshot-types";

const API_ORIGIN = "https://trendscript.edition";

/** What Google Actualités costs in Firecrawl credits, everywhere it is described. */
const NEWS_FEEDS =
  "articles à la une + 1 flux par mot-clé de niche (8 au maximum) à chaque analyse, et 1 flux de titres récents sur le sujet à chaque script (même sans recherche web) ; 1 crédit Firecrawl par flux, résultats gardés 10 min";

/** Feeds the server connectors fetch directly, routed through Firecrawl here. */
const FIRECRAWL_FEEDS = [
  /^https:\/\/trends\.google\.com\/trending\/rss(?:\?|$)/,
  /^https:\/\/news\.google\.com\/rss(?:\/search)?(?:\?|$)/,
];

/** Replaces the server's "add ANTHROPIC_API_KEY" note: what applies in this view. */
function noClaudeNote(): string {
  return `Mode sans IA : ${claudeProblem()}. En attendant, les sujets ci-dessous sont regroupés automatiquement à partir des mêmes données réelles, sans angles proposés.`;
}

function scriptUnavailableMessage(): string {
  return `Génération de script indisponible : ${claudeProblem()}. Le script est écrit par Claude avec votre compte claude.ai.`;
}

/**
 * Records where the analysis data came from (`analysis.edition`), and dates
 * the topics built only from an old snapshot: past 48 h, a topic none of
 * whose signals was read live gets its "Pourquoi maintenant" prefixed with
 * the snapshot date and `editionAsOf` (its timing badge then says so too).
 */
export function withProvenance(analysis: Analysis, capturedAt: string): EditionAnalysis {
  const signals = analysis.signals as EditionSignal[];
  const sourcesOf = (origin: EditionSignal["editionOrigin"]) =>
    [...new Set(signals.filter((signal) => signal.editionOrigin === origin).map((signal) => signal.source))] as SourceId[];
  const snapshotSources = sourcesOf("snapshot");
  const liveIds = new Set(signals.filter((signal) => signal.editionOrigin === "live").map((signal) => signal.id));
  const age = Date.parse(analysis.createdAt) - Date.parse(capturedAt);
  const stale = snapshotSources.length > 0 && age > STALE_AFTER_MS;
  const topics = stale
    ? analysis.topics.map((topic): EditionTopic => {
        if (topic.signalIds.some((id) => liveIds.has(id))) return topic;
        const whyNow = topic.whyNow.trim();
        return {
          ...topic,
          whyNow: `Au moment de l'instantané du ${frenchDate(capturedAt)}${whyNow ? ` : ${whyNow}` : ""}`,
          editionAsOf: capturedAt,
        };
      })
    : analysis.topics;
  return {
    ...analysis,
    topics,
    edition: { capturedAt, snapshotSources, liveSources: sourcesOf("live") },
  };
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** A body that errors with an AbortError when `signal` aborts — what a real fetch body does. */
function abortableBody(body: ReadableStream<Uint8Array> | null, signal: AbortSignal | undefined): ReadableStream<Uint8Array> | null {
  if (!body || !signal) return body;
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        try {
          controller.error(abortError());
        } catch {
          // already closed
        }
        reader.cancel().catch(() => undefined);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    },
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        try {
          controller.error(error);
        } catch {
          // already errored by the abort
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function withAbortableBody(response: Response, signal: AbortSignal | undefined): Response {
  return new Response(abortableBody(response.body, signal), { status: response.status, headers: response.headers });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** "/api/…" path when `url` targets this page's own API, else null. */
function apiPath(url: string): string | null {
  if (url.startsWith("/api/")) return url.split(/[?#]/)[0];
  try {
    const parsed = new URL(url);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/")) return parsed.pathname;
  } catch {
    // relative URL in an opaque-origin frame: not ours
  }
  return null;
}

export function installFakeServer(snapshot: Snapshot): void {
  const originalFetch = window.fetch.bind(window);
  const connectors = createEditionConnectors(snapshot);
  const capturedOn = frenchDateTime(snapshot.capturedAt);
  void resolveCapabilities();

  // -------------------------------------------------------------------------
  // GET /api/sources
  // -------------------------------------------------------------------------

  function editionStatus(source: SourceStatus): SourceStatus {
    // "maybe" until Firecrawl has answered once: say "if connected", never "en direct" as a fact.
    const { mode, why } = firecrawlMode();
    const firecrawlWhy = `pas de données en direct (${why})`;
    const snap = snapshot.sources[source.id as keyof Snapshot["sources"]];
    const count = snap && !snap.error ? snap.signals.length : 0;
    const snapNote = snap?.error
      ? `Instantané du ${capturedOn} manquant (capture en échec).`
      : `Instantané réel du ${capturedOn} (heure de Paris).`;

    switch (source.id) {
      case "google_trends":
        return {
          ...source,
          costNote:
            mode === "live"
              ? `${snapNote.replace(/\.$/, "")}, ${count} tendances (liste complète), + les 10 dernières tendances en direct via votre connecteur Firecrawl (1 crédit Firecrawl par analyse, résultat gardé 10 min).`
              : mode === "maybe"
                ? `${snapNote.replace(/\.$/, "")}, ${count} tendances (liste complète), + les 10 dernières tendances en direct si votre connecteur Firecrawl est connecté à votre compte claude.ai (vérifié à la première analyse ; 1 crédit Firecrawl par analyse, résultat gardé 10 min).`
                : `${snapNote.replace(/\.$/, "")}, ${count} tendances (liste complète). Tendances en direct : ${firecrawlWhy}.`,
          setup: [
            `Rien à configurer : l'instantané réel du ${capturedOn} (heure de Paris) est inclus dans cette page (France, fr).`,
            "Pour ajouter les tendances du moment en direct : connectez Firecrawl à votre compte claude.ai (Réglages → Connecteurs), puis autorisez cette page à l'utiliser lors de votre première analyse.",
            "Chaque analyse lit alors le flux RSS officiel de Google Trends (10 tendances les plus récentes) : 1 crédit Firecrawl, résultat gardé 10 minutes. Autres pays : tendances en direct uniquement.",
          ],
        };
      case "google_news":
        return {
          ...source,
          costNote:
            mode === "live"
              ? `En direct via votre connecteur Firecrawl : ${NEWS_FEEDS}. Licence Google des flux RSS : usage personnel et non commercial.`
              : mode === "maybe"
                ? `En direct si votre connecteur Firecrawl est connecté à votre compte claude.ai (vérifié à la première analyse) : ${NEWS_FEEDS}. Sinon : articles à la une de l'instantané du ${capturedOn} (${count} articles).`
                : `${firecrawlWhy.charAt(0).toUpperCase()}${firecrawlWhy.slice(1)} : articles à la une de l'instantané du ${capturedOn} (${count} articles), sans recherche par mots-clés.`,
          setup: [
            "Rien à configurer pour les articles à la une : l'instantané réel est inclus dans cette page.",
            "Pour lire Google Actualités en direct (et chercher les articles de vos mots-clés de niche) : connectez Firecrawl à votre compte claude.ai (Réglages → Connecteurs), puis autorisez cette page à l'utiliser.",
          ],
        };
      case "wikipedia":
        return {
          ...source,
          costNote: `${snapNote.replace(/\.$/, "")} : ${count} articles les plus lus de Wikipédia en français. Pas de lecture en direct dans l'édition HTML (version serveur : en direct, gratuit).`,
          setup: [`Rien à configurer : l'instantané réel du ${capturedOn} est inclus dans cette page.`],
        };
      case "youtube_rss":
        return {
          ...source,
          costNote: `${snapNote.replace(/\.$/, "")} : ${count} vidéos des chaînes d'actualité suivies (72 h précédant la capture). Pas de lecture en direct dans l'édition HTML (version serveur : en direct, gratuit).`,
          setup: [`Rien à configurer : l'instantané réel du ${capturedOn} est inclus dans cette page.`],
        };
      case "linkedin_web":
        return {
          ...source,
          configured: mode !== "off",
          costNote:
            mode === "off"
              ? `Indisponible ici : ${why}. Cette source cherche en direct les publications LinkedIn de la semaine sur vos mots-clés ; elle n'est pas dans l'instantané.`
              : `En direct${mode === "maybe" ? " si votre connecteur Firecrawl est connecté à votre compte claude.ai (vérifié à la première analyse)" : " via votre connecteur Firecrawl"} : une recherche par mot-clé (3 maximum), environ 2 crédits Firecrawl chacune, résultat gardé 10 min. Publications déjà indexées par le moteur de recherche, sans réactions ni commentaires.`,
          setup: [
            "Connectez Firecrawl à votre compte claude.ai (Réglages → Connecteurs), puis autorisez cette page à l'utiliser lors de votre première analyse.",
            "Saisissez vos mots-clés de niche dans le Radar : les 3 premiers sont cherchés parmi les publications LinkedIn de la semaine.",
          ],
        };
      default:
        return source.configured ? source : { ...source, description: `${source.description} ${SERVER_ONLY_SENTENCE}` };
    }
  }

  async function sources(): Promise<Response> {
    // Never block on a host that does not answer: ~3 s at most.
    await capabilitiesWithin(3_000);
    const state = getEditionState();
    return Response.json(
      {
        sources: getSourceStatuses(EDITION_ENV).map(editionStatus),
        ai: { configured: state.claude === "available", model: AI_MODEL_LABEL },
        auth: { enabled: false },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // -------------------------------------------------------------------------
  // POST /api/analyze & /api/script
  // -------------------------------------------------------------------------

  /**
   * Claude for a run started by a click. Unlike the first paint (3 s cap),
   * the progress UI is showing: wait for `use()` to settle (the platform
   * answers within ~10 s, `null` at worst), so a slow host does not silently
   * run the analysis without AI.
   */
  async function usableClient() {
    await capabilitiesWithin(15_000);
    if (getEditionState().claude !== "available") return null;
    return getClaudeClient();
  }

  /** Streams `task` like the server; a cancelled run ends quietly (no error log). */
  function stream<E extends { type: string }>(
    request: Request,
    task: (send: (event: E) => void, signal: AbortSignal) => Promise<void>,
  ): Response {
    const response = sseResponse<E>(
      request,
      async (send, signal) => {
        try {
          await task(send, signal);
        } catch (error) {
          if (signal.aborted) return;
          throw error;
        }
      },
      (message) => ({ type: "error", message }) as unknown as E,
    );
    return withAbortableBody(response, request.signal);
  }

  async function analyze(request: Request): Promise<Response> {
    const body = await parseJsonBody(request, analyzeRequestSchema, 50_000);
    if (!body.ok) return body.response;
    const client = await usableClient();
    return stream<AnalyzeEvent>(request, async (send, signal) => {
      const relay = (event: AnalyzeEvent) => {
        if (event.type === "result") {
          let { analysis } = event;
          if (!client) {
            // The server's note names ANTHROPIC_API_KEY: say what applies here instead.
            const note = noClaudeNote();
            analysis = { ...analysis, notes: analysis.notes.map((line) => (line === NO_AI_NOTE ? note : line)) };
          }
          event = { ...event, analysis: withProvenance(analysis, snapshot.capturedAt) };
        }
        send(event);
      };
      await runAnalysis(body.data, relay, signal, EDITION_ENV, { connectors, ...(client ? { client } : {}) });
    });
  }

  async function script(request: Request): Promise<Response> {
    const client = await usableClient();
    if (!client) return jsonError(scriptUnavailableMessage(), 503);
    const body = await parseJsonBody(request, scriptRequestSchema, 2_000_000);
    if (!body.ok) return body.response;
    const scriptRequest = body.data as ScriptRequest;
    return stream<ScriptEvent>(request, async (send, signal) => {
      let resultSent = false;
      const result = await generateScript(
        scriptRequest,
        (event) => {
          if (event.type === "result") resultSent = true;
          send(event);
        },
        signal,
        EDITION_ENV,
        {
          client,
          research: researchWithClaudeAi,
          // No SerpApi key in this edition (never called without SERPAPI_API_KEY).
          relatedQueries: () => Promise.reject(new Error("SerpApi nécessite la version serveur.")),
        },
      );
      if (!resultSent && !signal.aborted) send({ type: "result", script: result });
    });
  }

  async function handleApi(path: string, input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> {
    const source = input instanceof Request ? input : undefined;
    const method = (init?.method ?? source?.method ?? "GET").toUpperCase();
    const signal = init?.signal ?? source?.signal ?? undefined;
    if (signal?.aborted) throw abortError();
    const request = new Request(`${API_ORIGIN}${path}`, {
      method,
      headers: init?.headers ?? source?.headers,
      body: method === "GET" || method === "HEAD" ? undefined : (init?.body ?? (source ? await source.text() : undefined)),
      signal: signal ?? undefined,
    });

    switch (path) {
      case "/api/sources":
        return method === "GET" ? sources() : jsonError("Méthode non autorisée.", 405);
      case "/api/analyze":
        return method === "POST" ? analyze(request) : jsonError("Méthode non autorisée.", 405);
      case "/api/script":
        return method === "POST" ? script(request) : jsonError("Méthode non autorisée.", 405);
      case "/api/auth/logout":
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      case "/api/auth/login":
        return jsonError("Pas de mot de passe dans l'édition HTML : l'application est déjà ouverte.", 404);
      default:
        return jsonError("Service introuvable.", 404);
    }
  }

  // -------------------------------------------------------------------------
  // Google RSS through Firecrawl
  // -------------------------------------------------------------------------

  async function firecrawlFeed(url: string, signal: AbortSignal | undefined): Promise<Response> {
    if (signal?.aborted) throw abortError();
    try {
      const document = await firecrawlFetchXml(url, signal);
      return new Response(document.body, {
        status: document.status,
        headers: { "Content-Type": document.contentType },
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw abortError();
      // Same failure shape as a network error: the connectors report it in French.
      const message = error instanceof Error ? error.message : String(error);
      throw new TypeError(`via Firecrawl — ${message}`);
    }
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    const path = apiPath(url);
    if (path) return handleApi(path, input, init);
    if (FIRECRAWL_FEEDS.some((pattern) => pattern.test(url))) {
      return firecrawlFeed(url, init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined);
    }
    return originalFetch(input, init);
  };
}
