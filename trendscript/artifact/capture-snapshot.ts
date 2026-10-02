/**
 * Captures the real-data snapshot of the HTML edition: calls the free server
 * connectors in Node, right now, for France / French, and writes
 * `artifact/snapshot.json`. Nothing is invented or edited: a source that
 * fails is recorded with its error and shown as missing in the edition.
 *
 *   npm run artifact:snapshot     (bundled with esbuild, then run with Node)
 */

import { writeFileSync } from "node:fs";
import { googleNewsConnector } from "@/lib/server/sources/google-news";
import { dedupeTrends, loadGoogleTrends, trendToSignal } from "@/lib/server/sources/google-trends";
import type { SourceConnector, SourceContext } from "@/lib/server/sources/types";
import { wikipediaConnector } from "@/lib/server/sources/wikipedia";
import { youtubeRssConnector } from "@/lib/server/sources/youtube-rss";
import type { Snapshot, SnapshotSource, SnapshotSourceId } from "./src/snapshot-types";

const GEO = "FR";
const LANGUAGE = "fr";
const TIMEOUT_MS = 120_000;

const output = process.argv[2];
if (!output) {
  console.error("Usage : node capture-snapshot.mjs <chemin de snapshot.json>");
  process.exit(2);
}

const now = Date.now();

function context(): SourceContext {
  return {
    geo: GEO,
    language: LANGUAGE,
    niche: "",
    keywords: [],
    signal: AbortSignal.timeout(TIMEOUT_MS),
    now,
    env: {},
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function captureTrends(): Promise<SnapshotSource> {
  const { trends, via, warning } = await loadGoogleTrends(GEO, LANGUAGE, context().signal);
  // Same normalisation as googleTrendsConnector.fetch (no niche keywords at capture time).
  const signals = dedupeTrends(trends)
    .map((trend) => trendToSignal(trend, { source: "google_trends", geo: GEO, now, keywords: [] }))
    .sort((a, b) => (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0));
  return { signals, trends, via, ...(warning ? { warning } : {}) };
}

async function captureConnector(connector: SourceConnector): Promise<SnapshotSource> {
  const { signals, warning } = await connector.fetch(context());
  return { signals, ...(warning ? { warning } : {}) };
}

const jobs: Record<SnapshotSourceId, () => Promise<SnapshotSource>> = {
  google_trends: captureTrends,
  google_news: () => captureConnector(googleNewsConnector),
  wikipedia: () => captureConnector(wikipediaConnector),
  youtube_rss: () => captureConnector(youtubeRssConnector),
};

async function main() {
  const snapshot: Snapshot = {
    version: 1,
    capturedAt: new Date(now).toISOString(),
    geo: GEO,
    language: LANGUAGE,
    sources: {},
  };

  const entries = await Promise.all(
    (Object.keys(jobs) as SnapshotSourceId[]).map(async (id): Promise<[SnapshotSourceId, SnapshotSource]> => {
      const started = Date.now();
      try {
        const result = await jobs[id]();
        return [id, { ...result, durationMs: Date.now() - started }];
      } catch (error) {
        return [id, { signals: [], error: message(error), durationMs: Date.now() - started }];
      }
    }),
  );

  let failed = 0;
  for (const [id, source] of entries) {
    snapshot.sources[id] = source;
    if (source.error) failed++;
    const detail = source.error
      ? `ÉCHEC : ${source.error}`
      : `${source.signals.length} signaux${source.via ? ` (via ${source.via})` : ""}${source.warning ? ` — ${source.warning}` : ""}`;
    console.log(`[snapshot] ${id.padEnd(13)} ${detail} (${source.durationMs} ms)`);
  }

  writeFileSync(output, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`[snapshot] écrit : ${output} (capturé le ${snapshot.capturedAt})`);
  if (failed === entries.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[snapshot]", error);
  process.exit(1);
});
