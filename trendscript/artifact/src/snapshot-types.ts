/**
 * Shape of `artifact/snapshot.json`: the real signals captured in Node by
 * `capture-snapshot.ts` and inlined in the HTML edition. Nothing in it is
 * edited after capture.
 */

import type { TrendingSearch } from "@/lib/server/sources/google-trends";
import type { Analysis, Signal, SourceId, Topic } from "@/lib/types";

/** Sources captured in the snapshot (the free ones that need no key). */
export const SNAPSHOT_SOURCE_IDS = ["google_trends", "google_news", "wikipedia", "youtube_rss"] as const;
export type SnapshotSourceId = (typeof SNAPSHOT_SOURCE_IDS)[number] & SourceId;

export interface SnapshotSource {
  /** Signals exactly as the server connector returned them (strength 0, no niche keywords). */
  signals: Signal[];
  /** The connector's own French warning, if it returned one. */
  warning?: string;
  /** Google Trends only: the raw trending list, so the edition can merge live RSS trends with it. */
  trends?: TrendingSearch[];
  /** Google Trends only: "rpc" = full list (~100+ trends); "rss" = 10 newest only. */
  via?: "rpc" | "rss";
  /** Set when the capture failed: the source is then reported as missing, never filled in. */
  error?: string;
  /** Capture duration, for the record. */
  durationMs?: number;
}

export interface Snapshot {
  version: 1;
  /** ISO 8601 — when the capture started. */
  capturedAt: string;
  /** ISO 3166-1 alpha-2 of the capture. */
  geo: string;
  /** ISO 639-1 of the capture. */
  language: string;
  sources: Partial<Record<SnapshotSourceId, SnapshotSource>>;
}

// ---------------------------------------------------------------------------
// Provenance carried through an analysis (extra fields, kept in history)
// ---------------------------------------------------------------------------

/** Where an edition signal came from: the inlined snapshot, or read live through Firecrawl. */
export type SignalOrigin = "snapshot" | "live";

export type EditionSignal = Signal & { editionOrigin?: SignalOrigin };

/** Set on each analysis by the in-page server (fake-server.ts). */
export interface EditionAnalysisMeta {
  /** `capturedAt` of the snapshot the analysis used. */
  capturedAt: string;
  /** Sources whose signals came (at least partly) from the snapshot. */
  snapshotSources: SourceId[];
  /** Sources read live through the viewer's Firecrawl connector. */
  liveSources: SourceId[];
}

export type EditionAnalysis = Analysis & { edition?: EditionAnalysisMeta };

/**
 * Set on a topic none of whose signals is live when the snapshot was more
 * than 48 h old at analysis time: its timing describes the snapshot's moment.
 */
export type EditionTopic = Topic & { editionAsOf?: string };
