/**
 * Source connectors of the HTML edition. Same `SourceConnector` contract
 * and same parsing / normalisation code as the server; only the transport
 * changes:
 * - google_trends: the real snapshot list (~100+ trends, RPC) merged with the
 *   live official RSS feed fetched through the viewer's Firecrawl connector
 *   (live wins on duplicates);
 * - google_news: the real server connector, live through Firecrawl (top
 *   stories + one search feed per niche keyword), falling back to the
 *   snapshot's top stories;
 * - wikipedia, youtube_rss: snapshot only;
 * - every other source: the server connector itself, "non configurée" here
 *   because the edition has no API key — exactly like a server without keys.
 *
 * Every warning says where the data comes from and when the snapshot was taken,
 * and every signal says it too (`editionOrigin`: "snapshot" or "live"), so the
 * Sujets step can date what it shows. Thumbnails are dropped: claude.ai blocks
 * every image host they come from, so rows use the compact platform-icon
 * layout instead of an empty frame (and no blocked request is made).
 */

import { SourceError } from "@/lib/server/http";
import { CONNECTORS } from "@/lib/server/sources";
import { googleNewsConnector } from "@/lib/server/sources/google-news";
import {
  dedupeTrends,
  fetchTrendsRss,
  matchKeyword,
  trendToSignal,
  type TrendingSearch,
} from "@/lib/server/sources/google-trends";
import type { SourceConnector, SourceContext, SourceFetchResult } from "@/lib/server/sources/types";
import { resolveRssChannels } from "@/lib/server/sources/youtube-rss";
import type { Signal, SourceId } from "@/lib/types";
import { capitalize, frenchDateTime, snapshotLabel } from "./edition";
import { firecrawlUnavailableReason, firecrawlUsable } from "./firecrawl";
import type { EditionSignal, SignalOrigin, Snapshot, SnapshotSource } from "./snapshot-types";

const MAX_NEWS_KEYWORDS = 8;

/** Failure reason for warnings; a Firecrawl failure surfaces as "Erreur réseau : via Firecrawl — …". */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Erreur réseau : via Firecrawl — /, "").slice(0, 240);
}

const withoutDot = (text: string) => text.replace(/[\s.]+$/, "");

function joinWarnings(...parts: (string | undefined)[]): string | undefined {
  const text = parts
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => (/[.!?)»]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`))
    .join(" ");
  return text || undefined;
}

/** Signals as shown in this edition: origin recorded, thumbnail dropped (images are blocked here). */
function tagSignals(signals: Signal[], origin: SignalOrigin): EditionSignal[] {
  return signals.map((signal) => {
    const tagged: EditionSignal = { ...signal, editionOrigin: origin };
    delete tagged.thumbnailUrl;
    return tagged;
  });
}

function cloneSignals(signals: Signal[], origin: SignalOrigin): EditionSignal[] {
  return tagSignals(structuredClone(signals), origin);
}

export function createEditionConnectors(snapshot: Snapshot): Record<SourceId, SourceConnector> {
  const label = snapshotLabel(snapshot);
  const capturedOn = `capturé le ${frenchDateTime(snapshot.capturedAt)} (heure de Paris)`;
  const capturedAt = Date.parse(snapshot.capturedAt);
  const marketOnly = `Instantané disponible pour la France (fr) uniquement — ${capturedOn}`;

  const sameMarket = (ctx: SourceContext) =>
    ctx.geo.trim().toUpperCase() === snapshot.geo && ctx.language.trim().toLowerCase() === snapshot.language;

  /** Usable snapshot entry, or the French reason it is missing. */
  function snapshotSource(id: keyof Snapshot["sources"]): { source: SnapshotSource } | { missing: string } {
    const source = snapshot.sources[id];
    if (!source) return { missing: `instantané manquant pour cette source (capture du ${frenchDateTime(snapshot.capturedAt)})` };
    if (source.error) {
      return { missing: `la capture du ${frenchDateTime(snapshot.capturedAt)} a échoué pour cette source (${withoutDot(source.error)})` };
    }
    return { source };
  }

  // -------------------------------------------------------------------------
  // Google Trends: snapshot (full list) + live RSS through Firecrawl
  // -------------------------------------------------------------------------

  const googleTrends: SourceConnector = {
    id: "google_trends",
    meta: CONNECTORS.google_trends.meta,
    isConfigured: () => true,
    async fetch(ctx): Promise<SourceFetchResult> {
      const geo = ctx.geo.trim().toUpperCase();

      let live: TrendingSearch[] = [];
      let liveProblem: string | undefined;
      if (await firecrawlUsable()) {
        try {
          live = await fetchTrendsRss(geo, ctx.signal);
          if (live.length === 0) liveProblem = "flux RSS vide";
        } catch (error) {
          liveProblem = reason(error);
        }
      } else {
        liveProblem = await firecrawlUnavailableReason();
      }

      const entry = sameMarket(ctx) ? snapshotSource("google_trends") : { missing: marketOnly };
      const snapTrends = "source" in entry ? (entry.source.trends ?? []) : [];
      const liveKeys = new Set(live.map((trend) => trend.normalized));
      const merged = dedupeTrends([...live, ...snapTrends.filter((trend) => !liveKeys.has(trend.normalized))]);
      const signals = merged
        .map((trend) => {
          const isLive = liveKeys.has(trend.normalized);
          const signal = trendToSignal(trend, {
            source: "google_trends",
            geo,
            // Snapshot trends are described as of their capture ("en cours depuis…").
            now: isLive ? ctx.now : capturedAt,
            keywords: ctx.keywords,
          });
          return tagSignals([signal], isLive ? "live" : "snapshot")[0];
        })
        .sort((a, b) => (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0));

      const liveNote = live.length
        ? `${live.length} tendances les plus récentes lues en direct (flux RSS officiel, via votre connecteur Firecrawl)`
        : undefined;

      if ("source" in entry) {
        const listNote = `Liste complète des tendances : ${label}, ${entry.source.signals.length} tendances${entry.source.via === "rss" ? " (flux RSS de repli au moment de la capture)" : ""}`;
        return {
          signals,
          warning: joinWarnings(
            listNote,
            liveNote ? `Mise à jour avec les ${liveNote}` : `Pas de mise à jour en direct (${withoutDot(liveProblem ?? "indisponible")})`,
            entry.source.warning,
          ),
        };
      }
      if (live.length) {
        return {
          signals,
          warning: joinWarnings(
            `Tendances en direct uniquement : les ${liveNote}, sans % de hausse ni catégories`,
            capitalize(entry.missing),
          ),
        };
      }
      if (sameMarket(ctx)) {
        throw new SourceError(
          `Google Trends indisponible : ${entry.missing}, et tendances en direct indisponibles (${withoutDot(liveProblem ?? "inconnu")}).`,
        );
      }
      return {
        signals: [],
        warning: joinWarnings(capitalize(entry.missing), `Tendances en direct indisponibles (${withoutDot(liveProblem ?? "inconnu")})`),
      };
    },
  };

  // -------------------------------------------------------------------------
  // Google Actualités: live server connector through Firecrawl, else snapshot
  // -------------------------------------------------------------------------

  const googleNews: SourceConnector = {
    id: "google_news",
    meta: CONNECTORS.google_news.meta,
    isConfigured: () => true,
    async fetch(ctx): Promise<SourceFetchResult> {
      let liveProblem: string;
      if (await firecrawlUsable()) {
        try {
          // The server connector itself: its RSS requests are routed through Firecrawl by the fake server.
          const result = await googleNewsConnector.fetch(ctx);
          return {
            signals: tagSignals(result.signals, "live"),
            warning: result.warning
              ? joinWarnings(result.warning, `Autres flux lus en direct via votre connecteur Firecrawl (${label} non utilisé)`)
              : undefined,
          };
        } catch (error) {
          liveProblem = reason(error);
        }
      } else {
        liveProblem = await firecrawlUnavailableReason();
      }

      const keywords = [...new Set(ctx.keywords.map((keyword) => keyword.replace(/^#/, "").trim()).filter(Boolean))].slice(
        0,
        MAX_NEWS_KEYWORDS,
      );
      const keywordNote = keywords.length
        ? `Recherche d'articles par mots-clés (${keywords.join(", ")}) impossible : elle interroge Google Actualités en direct et nécessite votre connecteur Firecrawl`
        : undefined;

      if (!sameMarket(ctx)) {
        return {
          signals: [],
          warning: joinWarnings(`Google Actualités en direct indisponible (${withoutDot(liveProblem)})`, marketOnly, keywordNote),
        };
      }
      const entry = snapshotSource("google_news");
      if ("missing" in entry) {
        throw new SourceError(`Google Actualités indisponible : en direct (${withoutDot(liveProblem)}), et ${entry.missing}.`);
      }
      // Same niche matching as the server connector does for top stories.
      const signals = cloneSignals(entry.source.signals, "snapshot").map((signal) => ({
        ...signal,
        query: matchKeyword(keywords, [signal.title, ...signal.related.map((related) => related.title)]),
      }));
      return {
        signals,
        warning: joinWarnings(
          `Articles à la une : ${label} (${signals.length} articles) — lecture en direct indisponible (${withoutDot(liveProblem)})`,
          keywordNote,
          entry.source.warning,
        ),
      };
    },
  };

  // -------------------------------------------------------------------------
  // Wikipédia & YouTube RSS: snapshot only
  // -------------------------------------------------------------------------

  const wikipedia: SourceConnector = {
    id: "wikipedia",
    meta: CONNECTORS.wikipedia.meta,
    isConfigured: () => true,
    async fetch(ctx): Promise<SourceFetchResult> {
      // Like the server: the ranking is per language (every country), not per country.
      if (ctx.language.trim().toLowerCase() !== snapshot.language) {
        return {
          signals: [],
          warning: `Instantané Wikipédia disponible en français (fr) uniquement — ${capturedOn} ; pas de lecture en direct dans l'édition HTML.`,
        };
      }
      const entry = snapshotSource("wikipedia");
      if ("missing" in entry) throw new SourceError(`Wikipédia indisponible : ${entry.missing}.`);
      const signals = cloneSignals(entry.source.signals, "snapshot").map((signal) => ({
        ...signal,
        query: matchKeyword(ctx.keywords, [signal.title]),
      }));
      return {
        signals,
        warning: joinWarnings(
          `${capitalize(label)} : articles les plus lus de Wikipédia en français (tous pays), sans mise à jour en direct dans l'édition HTML`,
          entry.source.warning,
        ),
      };
    },
  };

  const youtubeRss: SourceConnector = {
    id: "youtube_rss",
    meta: CONNECTORS.youtube_rss.meta,
    isConfigured: () => true,
    async fetch(ctx): Promise<SourceFetchResult> {
      // Same channel rules as the server (no YOUTUBE_RSS_CHANNELS in this edition).
      const { channels, warning } = resolveRssChannels({}, ctx.language, ctx.geo);
      if (channels.length === 0) {
        return {
          signals: [],
          warning: `Instantané YouTube disponible pour les chaînes d'actualité françaises (langue fr) uniquement — ${capturedOn}.`,
        };
      }
      const entry = snapshotSource("youtube_rss");
      if ("missing" in entry) throw new SourceError(`YouTube (RSS) indisponible : ${entry.missing}.`);
      return {
        signals: cloneSignals(entry.source.signals, "snapshot"),
        warning: joinWarnings(
          `${capitalize(label)} : vidéos publiées dans les 72 h précédant la capture, vues et likes relevés à ce moment-là`,
          warning,
          entry.source.warning,
        ),
      };
    },
  };

  return {
    ...CONNECTORS,
    google_trends: googleTrends,
    google_news: googleNews,
    wikipedia,
    youtube_rss: youtubeRss,
  };
}
