/**
 * The viewer's own Firecrawl connector, reached through the `mcp`
 * capability. Two uses, both bounded and cached 10 minutes in memory:
 * - `firecrawlFetchXml`: fetch a public RSS feed (Google Trends, Google
 *   Actualités) with `firecrawl_scrape` → `rawHtml` (1 credit per feed);
 * - `firecrawlSearch`: web search for the fact-checking step (`firecrawl_search`).
 *
 * The first call of the view runs alone (it may open the consent prompt);
 * refusals that cannot change during this view are remembered so the page
 * never asks in a loop.
 */

import { getMcp, getEditionState, updateEditionState, type McpCallResult, type McpError } from "./capabilities";

export const FIRECRAWL_SERVER = "Firecrawl";
const CACHE_MS = 10 * 60_000;
const SCRAPE_MAX_AGE_MS = 10 * 60_000;
const MAX_RETRY_WAIT_MS = 5_000;

/** French, user-facing failure of a Firecrawl call. */
export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

const NOT_CONNECTED =
  "Firecrawl n'est pas connecté à votre compte claude.ai : ajoutez-le dans Réglages → Connecteurs, puis rechargez la page";

/** French message per error code, a short label for the banner, and whether it holds for the rest of the view. */
function describe(error: McpError): { message: string; short: string; permanent: boolean } {
  switch (error.code) {
    case "server_not_connected":
    case "server_not_found":
      return { message: NOT_CONNECTED, short: "Firecrawl non connecté à votre compte claude.ai", permanent: true };
    case "needs_reauth":
      return {
        message: "la connexion à Firecrawl a expiré : reconnectez-le dans claude.ai (Réglages → Connecteurs), puis rechargez la page",
        short: "connexion Firecrawl expirée",
        permanent: true,
      };
    case "not_in_manifest":
    case "not_granted":
      return {
        message: "vous n'avez pas autorisé cette page à utiliser Firecrawl (rechargez la page pour qu'elle vous le redemande)",
        short: "Firecrawl non autorisé pour cette page",
        permanent: true,
      };
    case "consent_required":
      return { message: "autorisez cette page à utiliser Firecrawl lorsque claude.ai vous le demande", short: "autorisation Firecrawl en attente", permanent: false };
    case "selection_required":
      return {
        message: "plusieurs connecteurs Firecrawl sont installés : choisissez celui à utiliser dans claude.ai",
        short: "connecteur Firecrawl à choisir",
        permanent: false,
      };
    case "blocked_by_policy":
    case "approval_required":
      return { message: "Firecrawl est bloqué par la politique de votre organisation", short: "Firecrawl bloqué par votre organisation", permanent: true };
    case "capability_disabled":
    case "capability_removed":
      return { message: "les connecteurs ne sont pas disponibles dans cette vue de claude.ai", short: "connecteurs indisponibles ici", permanent: true };
    case "tool_error":
      return { message: `Firecrawl a signalé une erreur (${error.message.slice(0, 200)})`, short: "erreur Firecrawl", permanent: false };
    case "cancelled":
      return { message: "requête annulée", short: "requête annulée", permanent: false };
    case "rate_limited":
      return { message: "trop de requêtes Firecrawl : réessayez dans un instant", short: "trop de requêtes Firecrawl", permanent: false };
    default:
      return { message: "Firecrawl est momentanément indisponible", short: "Firecrawl momentanément indisponible", permanent: false };
  }
}

function isMcpError(value: unknown): value is McpError {
  return Boolean(value) && typeof value === "object" && typeof (value as McpError).code === "string";
}

function abortError(): DOMException {
  return new DOMException("La requête a été annulée.", "AbortError");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

// ---------------------------------------------------------------------------
// Gate (first call alone), cache, retries
// ---------------------------------------------------------------------------

let confirmed = false;
let gate: Promise<unknown> | null = null;
let blockedMessage: string | null = null;

async function rawCall(tool: string, input: unknown, signal?: AbortSignal): Promise<McpCallResult> {
  const mcp = await getMcp();
  if (!mcp) {
    throw new FirecrawlError(
      "les connecteurs claude.ai (dont Firecrawl) ne sont pas disponibles ici : ouvrez cette page dans claude.ai",
      "absent",
    );
  }
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await mcp.callTool(FIRECRAWL_SERVER, tool, input, { signal, cache: false });
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (!isMcpError(error)) throw new FirecrawlError("Firecrawl est momentanément indisponible", "unknown");
      // Only reads are made here: one retry when the platform says it is safe.
      if (error.retryable && attempt === 0) {
        await wait(Math.min(MAX_RETRY_WAIT_MS, Math.max(500, error.retryAfterMs ?? 1_500)), signal);
        continue;
      }
      const { message, short, permanent } = describe(error);
      if (permanent) {
        blockedMessage = message;
        updateEditionState({ firecrawl: "blocked", firecrawlNote: short });
      }
      throw new FirecrawlError(message, error.code);
    }
  }
}

async function gatedCall(tool: string, input: unknown, signal?: AbortSignal): Promise<McpCallResult> {
  // Until Firecrawl has answered once, calls run one at a time: the first one
  // may be waiting on the viewer's consent.
  while (!confirmed && gate) {
    await gate.catch(() => undefined);
  }
  if (blockedMessage) throw new FirecrawlError(blockedMessage, "blocked");
  if (confirmed) return rawCall(tool, input, signal);
  const call = rawCall(tool, input, signal);
  gate = call;
  try {
    const result = await call;
    confirmed = true;
    if (!getEditionState().firecrawlConfirmed) updateEditionState({ firecrawl: "available", firecrawlConfirmed: true });
    return result;
  } finally {
    if (gate === call) gate = null;
  }
}

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Cached call: identical inputs within 10 minutes reuse the same result (or in-flight call). */
async function cachedCall<T>(tool: string, input: unknown, signal: AbortSignal | undefined, read: (result: McpCallResult) => T): Promise<T> {
  const key = `${tool} ${JSON.stringify(input)}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  // The shared call is not tied to one caller's signal; each caller can still stop waiting.
  const value = gatedCall(tool, input).then(read);
  cache.set(key, { expires: now + CACHE_MS, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return untilAborted(value, signal);
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

// ---------------------------------------------------------------------------
// Payload parsing (object, JSON string, or MCP text blocks)
// ---------------------------------------------------------------------------

export function payloadOf(result: McpCallResult): unknown {
  let payload: unknown = result.payload ?? result.structuredContent;
  if (payload === undefined) {
    payload = result.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        // not JSON: keep the text
      }
    }
  }
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export interface FetchedDocument {
  status: number;
  contentType: string;
  body: string;
}

/** `firecrawl_scrape` answer → raw document (accepts `{rawHtml}`, `{data: {rawHtml}}` or the raw text). */
export function readScrape(result: McpCallResult): FetchedDocument {
  const payload = payloadOf(result);
  if (typeof payload === "string") {
    if (/^\s*</.test(payload)) return { status: 200, contentType: "application/xml", body: payload };
    throw new FirecrawlError("réponse de Firecrawl inattendue", "format");
  }
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const body = typeof data?.rawHtml === "string" ? data.rawHtml : typeof data?.html === "string" ? data.html : undefined;
  if (body === undefined) throw new FirecrawlError("réponse de Firecrawl sans contenu brut", "format");
  const metadata = asRecord(data?.metadata) ?? asRecord(root?.metadata);
  const status = typeof metadata?.statusCode === "number" ? metadata.statusCode : 200;
  const contentType = typeof metadata?.contentType === "string" ? metadata.contentType : "application/xml";
  return { status: status >= 200 && status <= 599 ? status : 200, contentType, body };
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

const clip = (value: string, max: number) => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** `firecrawl_search` answer → compact web results (http(s) URLs only). */
export function readSearch(result: McpCallResult): SearchResult[] {
  const payload = payloadOf(result);
  const root = asRecord(payload);
  const data = root?.data;
  const candidates = [asRecord(data)?.web, asRecord(data)?.news, Array.isArray(data) ? data : undefined, root?.web, root?.results];
  const items = candidates.filter(Array.isArray).flat() as unknown[];
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const item of items) {
    const record = asRecord(item);
    const url = typeof record?.url === "string" ? record.url.trim() : "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = typeof record?.title === "string" && record.title.trim() ? record.title : url;
    const description =
      typeof record?.description === "string" ? record.description : typeof record?.snippet === "string" ? record.snippet : "";
    results.push({ title: clip(title, 200), url, description: clip(description, 320) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetches a public feed through `firecrawl_scrape` (raw XML, Firecrawl cache ≤ 10 min). */
export function firecrawlFetchXml(url: string, signal?: AbortSignal): Promise<FetchedDocument> {
  return cachedCall("firecrawl_scrape", { url, formats: ["rawHtml"], maxAge: SCRAPE_MAX_AGE_MS }, signal, readScrape);
}

/** Web search through `firecrawl_search`. */
export function firecrawlSearch(
  query: string,
  { limit = 5, location, tbs, signal }: { limit?: number; location?: string; tbs?: string; signal?: AbortSignal } = {},
): Promise<SearchResult[]> {
  const input: Record<string, unknown> = { query, limit, sources: ["web"] };
  if (location) input.location = location;
  if (tbs) input.tbs = tbs;
  return cachedCall("firecrawl_search", input, signal, readSearch);
}

/** False when Firecrawl cannot be used in this view (no runtime, or refused for good). */
export async function firecrawlUsable(): Promise<boolean> {
  if (blockedMessage) return false;
  return (await getMcp()) !== null;
}

/** Why Firecrawl cannot be used, in French (for warnings). */
export async function firecrawlUnavailableReason(): Promise<string> {
  if (blockedMessage) return blockedMessage;
  if (!(await getMcp())) {
    return "connecteur Firecrawl indisponible ici (ouvrez cette page dans claude.ai avec Firecrawl connecté)";
  }
  return "Firecrawl indisponible";
}
