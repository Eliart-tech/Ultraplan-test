/**
 * Browser client for the TrendScript API. Streaming endpoints answer with
 * Server-Sent Events (parsed by `readSse`), or with a JSON `{ error }` and a
 * 4xx/5xx status before the stream opens. A 401 means the session expired:
 * we send the user to /login?next=<current page>.
 */

import { readSse } from "../sse";
import type {
  Analysis,
  AnalyzeEvent,
  AnalyzeRequest,
  GeneratedScript,
  ScriptEvent,
  ScriptRequest,
  SourceStatus,
} from "../types";

/**
 * API failure with a French, user-facing message.
 * `status`: the HTTP status (400, 401, 413, 429, 503…), `200` for an `error`
 * event received inside the stream, `0` for a network failure or a stream
 * cut before its result.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** True for the rejection caused by `AbortController.abort()` (user cancel). */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** French message for any error thrown by this module (or anything else). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isAbortError(error)) return "Opération annulée.";
  if (error instanceof Error && error.message) return error.message;
  return "Erreur inattendue. Réessayez.";
}

/** `/login?next=…` for the given path (current page by default). */
export function loginUrl(next?: string): string {
  const path = next ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/");
  return !path || path === "/" || path.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(path)}`;
}

/** Full-page navigation to the login page (no-op when already there). */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  window.location.assign(loginUrl());
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Requête invalide.",
  401: "Session expirée : reconnectez-vous.",
  403: "Accès refusé.",
  404: "Service introuvable.",
  413: "Requête trop volumineuse.",
  429: "Trop de requêtes : réessayez dans un instant.",
  503: "Service indisponible pour le moment.",
};

async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = "";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
  } catch {
    // Not JSON (proxy error page, HTML 502…).
  }
  if (response.status === 401) redirectToLogin();
  return new ApiError(
    response.status,
    message || FALLBACK_MESSAGES[response.status] || `Erreur du serveur (${response.status}). Réessayez.`,
  );
}

async function request(input: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Reads an SSE stream, forwarding every event; resolves with the `result`
 * payload, rejects with ApiError on an `error` event or a truncated stream.
 */
async function consumeStream<E extends { type: string }, R>(
  response: Response,
  onEvent: (event: E) => void,
  pick: (event: E) => R | undefined,
  what: string,
  signal?: AbortSignal,
): Promise<R> {
  let result: R | undefined;
  let failure: string | undefined;
  try {
    await readSse<E>(response, (event) => {
      onEvent(event);
      if (event.type === "error" && "message" in event && typeof event.message === "string") failure = event.message;
      const value = pick(event);
      if (value !== undefined) result = value;
    });
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    throw new ApiError(0, `La connexion a été interrompue pendant ${what}. Réessayez.`);
  }
  if (failure) throw new ApiError(200, failure);
  if (result === undefined) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new ApiError(0, `La connexion a été interrompue avant la fin de ${what}. Réessayez.`);
  }
  return result;
}

/**
 * POST /api/analyze — streams progress (`source_start`, `source_done`,
 * `synthesis_start`…) to `onEvent` and resolves with the Analysis.
 * Rejects with ApiError (or an AbortError when `signal` aborts — check with
 * `isAbortError`).
 *
 * @example
 * const analysis = await streamAnalyze(request, (event) => dispatch({ type: "event", event }), controller.signal);
 */
export async function streamAnalyze(
  body: AnalyzeRequest,
  onEvent: (event: AnalyzeEvent) => void,
  signal?: AbortSignal,
): Promise<Analysis> {
  const response = await postJson("/api/analyze", body, signal);
  return consumeStream<AnalyzeEvent, Analysis>(
    response,
    onEvent,
    (event) => (event.type === "result" ? event.analysis : undefined),
    "l'analyse",
    signal,
  );
}

/**
 * POST /api/script — streams `status` / `research` / `progress` events to
 * `onEvent` and resolves with the GeneratedScript. A missing Anthropic key
 * is a 503 ApiError whose message names ANTHROPIC_API_KEY.
 */
export async function streamScript(
  body: ScriptRequest,
  onEvent: (event: ScriptEvent) => void,
  signal?: AbortSignal,
): Promise<GeneratedScript> {
  const response = await postJson("/api/script", body, signal);
  return consumeStream<ScriptEvent, GeneratedScript>(
    response,
    onEvent,
    (event) => (event.type === "result" ? event.script : undefined),
    "la génération",
    signal,
  );
}

/** GET /api/sources payload. */
export interface ServerStatus {
  sources: SourceStatus[];
  ai: { configured: boolean; model: string };
  auth: { enabled: boolean };
}

/** GET /api/sources — configured sources, Claude status, auth gate. */
export async function fetchServerStatus(signal?: AbortSignal): Promise<ServerStatus> {
  const response = await request("/api/sources", { method: "GET", headers: { Accept: "application/json" }, signal });
  try {
    return (await response.json()) as ServerStatus;
  } catch {
    throw new ApiError(response.status, "Réponse illisible du serveur.");
  }
}

/**
 * POST /api/auth/login. Resolves on success; rejects with ApiError
 * (401 wrong password, 429 too many attempts). Does not redirect.
 */
export async function login(password: string, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
  }
  if (response.ok) return;
  let message = "";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
  } catch {
    // ignore
  }
  throw new ApiError(
    response.status,
    message || (response.status === 401 ? "Mot de passe incorrect." : FALLBACK_MESSAGES[response.status] ?? "Connexion impossible."),
  );
}

/**
 * POST /api/auth/logout, then a full navigation to /login — deliberately not
 * router.push, so no client-side cache of the session survives.
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
  } finally {
    if (typeof window !== "undefined") window.location.assign(loginUrl("/"));
  }
}
