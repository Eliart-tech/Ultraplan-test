import { useCallback, useEffect, useSyncExternalStore } from "react";
import { errorMessage, fetchServerStatus, isAbortError, type ServerStatus } from "./api";

/**
 * Server status (GET /api/sources) shared by every component that needs it
 * (header pill, Radar source picker, Réglages): one request in flight at a
 * time, refreshed on mount when older than 30 s, and on demand via
 * `reload()`. State changes only happen in the async callback — never
 * synchronously inside an effect.
 */

export interface ServerStatusState {
  status: ServerStatus | null;
  /** French message when the last request failed. */
  error: string | null;
  /** True while a request is in flight (including the very first one). */
  loading: boolean;
}

const STALE_MS = 30_000;
const INITIAL: ServerStatusState = { status: null, error: null, loading: true };

let state: ServerStatusState = INITIAL;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: ServerStatusState) {
  state = next;
  for (const listener of listeners) listener();
}

function load(force: boolean): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.status && Date.now() - fetchedAt < STALE_MS) return Promise.resolve();
  if (!state.loading) setState({ ...state, loading: true });
  inflight = fetchServerStatus()
    .then((status) => {
      fetchedAt = Date.now();
      setState({ status, error: null, loading: false });
    })
    .catch((error: unknown) => {
      if (isAbortError(error)) return setState({ ...state, loading: false });
      // Keep the last known status: a transient failure shouldn't blank the UI.
      setState({ status: state.status, error: errorMessage(error), loading: false });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => INITIAL;

/**
 * `{ status, error, loading, reload }` for GET /api/sources.
 * `status` is null until the first response (and on the server).
 *
 * @example
 * const { status, loading, error, reload } = useServerStatus();
 * const configured = status?.sources.filter((s) => s.configured) ?? [];
 */
export function useServerStatus(): ServerStatusState & { reload: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Starts (or reuses) the shared request; its result reaches every
    // subscriber through the store, not through a local setState.
    void load(false);
  }, []);

  const reload = useCallback(() => {
    void load(true);
  }, []);

  return { ...snapshot, reload };
}
