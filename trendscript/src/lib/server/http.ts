/**
 * Small fetch helpers shared by every connector: timeouts, cancellation,
 * readable errors. Server-only (used from route handlers).
 */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True for 429 / 5xx / network errors — worth retrying later. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export interface FetchOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal;
  /** Per-request timeout, default 20 s. */
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  { signal, timeoutMs = 20_000, ...init }: FetchOptions = {},
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await fetch(url, { ...init, signal: combined, cache: "no-store" });
  } catch (error) {
    if (timeout.aborted) {
      throw new SourceError(`Délai dépassé (${Math.round(timeoutMs / 1000)} s)`, undefined, true);
    }
    if (signal?.aborted) throw new SourceError("Requête annulée");
    const reason = error instanceof Error ? error.message : String(error);
    throw new SourceError(`Erreur réseau : ${reason}`, undefined, true);
  }
}

async function ensureOk(response: Response, label: string): Promise<Response> {
  if (response.ok) return response;
  let detail = "";
  try {
    detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
  } catch {
    // body unreadable — keep the status only
  }
  const retryable = response.status === 429 || response.status >= 500;
  throw new SourceError(
    `${label} a répondu ${response.status}${detail ? ` : ${detail}` : ""}`,
    response.status,
    retryable,
  );
}

export async function fetchText(url: string, label: string, options?: FetchOptions): Promise<string> {
  const response = await ensureOk(await fetchWithTimeout(url, options), label);
  return response.text();
}

export async function fetchJson<T>(url: string, label: string, options?: FetchOptions): Promise<T> {
  const response = await ensureOk(await fetchWithTimeout(url, options), label);
  try {
    return (await response.json()) as T;
  } catch {
    throw new SourceError(`${label} a renvoyé une réponse JSON invalide`);
  }
}
