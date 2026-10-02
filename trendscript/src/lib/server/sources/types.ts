import type { Platform, Signal, SourceId } from "../../types";

/** Read-only view of the environment (process.env in production, a plain object in tests). */
export type Env = Readonly<Record<string, string | undefined>>;

export interface SourceContext {
  /** ISO 3166-1 alpha-2, upper-case. */
  geo: string;
  /** ISO 639-1. */
  language: string;
  niche: string;
  /** Niche keywords / hashtags, without '#'. May be empty. */
  keywords: string[];
  /**
   * Timeout-only signal owned by the orchestrator. Results are shared through
   * the cache, so one user's disconnect must not cancel a shared fetch.
   */
  signal: AbortSignal;
  /** Epoch ms of the run — use instead of Date.now() for reproducible tests. */
  now: number;
  env: Env;
}

/** Client-safe description shown on the Réglages page and in the source picker. */
export interface SourceMeta {
  label: string;
  platform: Platform;
  /** No paid account needed. */
  free: boolean;
  /** Returns nothing without niche keywords. */
  needsKeywords: boolean;
  /** One sentence, French: what the signal measures and its limits. */
  description: string;
  envVars: string[];
  /** French setup steps, one action per line. */
  setup: string[];
  /** French cost / quota note. */
  costNote: string;
  docsUrl: string;
  /** Cache TTL for one fetch (ms). */
  ttlMs: number;
}

export interface SourceFetchResult {
  signals: Signal[];
  /** Non-fatal French notice (fallback used, partial results, quota close…). */
  warning?: string;
}

export interface SourceConnector {
  id: SourceId;
  meta: SourceMeta;
  isConfigured(env: Env): boolean;
  /**
   * Fetch real data. Throws SourceError on failure. Returns `{ signals: [] }`
   * (optionally with a warning) when there is legitimately nothing to return,
   * e.g. a keyword-driven source called without keywords. Leaves
   * `strength: 0`: scoring fills it.
   */
  fetch(ctx: SourceContext): Promise<SourceFetchResult>;
}
