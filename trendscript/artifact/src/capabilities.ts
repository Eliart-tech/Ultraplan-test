/**
 * claude.ai runtime capabilities used by the HTML edition — `sample` (Claude
 * on the viewer's account), `mcp` (the viewer's Firecrawl connector) and
 * `downloads` — with local typings of the parts we call (contract 0.2.66).
 *
 * `claude.use()` is free and never prompts: it is resolved once, lazily, and
 * memoized. Consent prompts only happen on the first real call, which the
 * edition only makes from a click (Analyser, Générer, Exporter).
 * `window.claude` is absent when the file is opened outside claude.ai: every
 * capability then resolves `null` and the page degrades.
 */

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Local typings (subset of the platform contract)
// ---------------------------------------------------------------------------

export type ModelTier = "default" | "complex" | "quick";

export interface SampleTextUpdate {
  text: string;
  delta: string;
}

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: { [name: string]: unknown }, context: { signal: AbortSignal }): unknown;
}

export interface SampleOptions {
  onText?: (update: SampleTextUpdate) => void;
  signal?: AbortSignal;
  modelTier?: ModelTier;
  cache?: boolean;
  tools?: SampleTool[];
}

export interface SampleResult {
  text: string;
  truncated: boolean;
  modelTierApplied: ModelTier;
}

export interface SampleLimits {
  maxPromptBytes: number;
  tools?: { maxCount: number };
}

export interface SampleFn {
  (input: string, options?: SampleOptions): Promise<SampleResult>;
  limits(): Promise<SampleLimits>;
}

/** What `sample()` rejects with (a plain object, not an Error). */
export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

export interface McpContentBlock {
  type: string;
  text?: string;
}

export interface McpCallResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  payload?: unknown;
}

/** What `mcp.callTool()` rejects with. */
export interface McpError {
  code: string;
  message: string;
  server?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  result?: unknown;
}

export interface McpNamespace {
  callTool(
    server: string,
    tool: string,
    input?: unknown,
    options?: { signal?: AbortSignal; cache?: false | { staleTime?: number; gcTime?: number } },
  ): Promise<McpCallResult>;
}

export interface DownloadsNamespace {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: "saved" | "delivered" }>;
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Lazy, memoized `use()`
// ---------------------------------------------------------------------------

function runtime(): ClaudeRuntime | null {
  if (typeof window === "undefined") return null;
  const claude = (window as unknown as { claude?: Partial<ClaudeRuntime> }).claude;
  return claude && typeof claude.use === "function" ? (claude as ClaudeRuntime) : null;
}

const resolved = new Map<string, Promise<unknown>>();

function resolveCapability<T>(name: "sample" | "mcp" | "downloads"): Promise<T | null> {
  let promise = resolved.get(name);
  if (!promise) {
    const claude = runtime();
    promise = claude
      ? Promise.resolve()
          .then(() => claude.use(name))
          .then((value) => value ?? null, () => null)
      : Promise.resolve(null);
    resolved.set(name, promise);
  }
  return promise as Promise<T | null>;
}

export const getSample = () => resolveCapability<SampleFn>("sample");
export const getMcp = () => resolveCapability<McpNamespace>("mcp");
export const getDownloads = () => resolveCapability<DownloadsNamespace>("downloads");

/** True when the page runs inside a claude.ai viewer (or top-level on its artifact host). */
export const hasClaudeRuntime = () => runtime() !== null;

// ---------------------------------------------------------------------------
// Observable state (edition banner, /api/sources)
// ---------------------------------------------------------------------------

/**
 * - pending: `use()` not answered yet;
 * - available: the capability exists (calls may still ask for consent);
 * - absent: not served in this view (or no claude.ai runtime at all);
 * - blocked: a call was refused for the rest of this view (declined,
 *   connector not connected…) — `note` says why, in French.
 */
export type CapabilityStatus = "pending" | "available" | "absent" | "blocked";

export interface EditionState {
  claude: CapabilityStatus;
  claudeNote?: string;
  firecrawl: CapabilityStatus;
  firecrawlNote?: string;
  /** Firecrawl answered at least once in this view. */
  firecrawlConfirmed: boolean;
  downloads: CapabilityStatus;
}

let state: EditionState = {
  claude: "pending",
  firecrawl: "pending",
  firecrawlConfirmed: false,
  downloads: "pending",
};
const listeners = new Set<() => void>();

export function getEditionState(): EditionState {
  return state;
}

export function updateEditionState(patch: Partial<EditionState>): void {
  const next = { ...state, ...patch };
  if (Object.entries(patch).every(([key, value]) => state[key as keyof EditionState] === value)) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeEditionState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEditionState(): EditionState {
  return useSyncExternalStore(subscribeEditionState, getEditionState, getEditionState);
}

let ready: Promise<void> | null = null;

/** Resolves every `use()` once (free, no prompt) and records availability. */
export function resolveCapabilities(): Promise<void> {
  ready ??= Promise.all([getSample(), getMcp(), getDownloads()]).then(([sample, mcp, downloads]) => {
    const current = getEditionState();
    updateEditionState({
      claude: current.claude === "blocked" ? "blocked" : sample ? "available" : "absent",
      firecrawl: current.firecrawl === "blocked" ? "blocked" : mcp ? "available" : "absent",
      downloads: downloads ? "available" : "absent",
    });
  });
  return ready;
}

/** Waits for `resolveCapabilities()` at most `ms` milliseconds. */
export function capabilitiesWithin(ms: number): Promise<void> {
  return Promise.race([resolveCapabilities(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}
