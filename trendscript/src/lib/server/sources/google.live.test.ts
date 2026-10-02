/**
 * Live smoke test of the free Google-side connectors (network required):
 *   npx vitest run --config vitest.live.config.mts src/lib/server/sources/google.live.test.ts
 * Prints a short summary of what came back so a human can eyeball it.
 */

import { describe, expect, it } from "vitest";
import type { Signal } from "../../types";
import { SourceError } from "../http";
import { googleNewsConnector, searchGoogleNews } from "./google-news";
import { fetchTrendsRss, googleTrendsConnector } from "./google-trends";
import type { SourceConnector, SourceContext } from "./types";
import { wikipediaConnector } from "./wikipedia";

function ctx(keywords: string[] = []): SourceContext {
  return {
    geo: "FR",
    language: "fr",
    niche: "",
    keywords,
    signal: AbortSignal.timeout(90_000),
    now: Date.now(),
    env: process.env,
  };
}

function expectWellFormed(signals: Signal[], connector: SourceConnector) {
  expect(signals.length).toBeGreaterThan(0);
  expect(new Set(signals.map((signal) => signal.id)).size).toBe(signals.length);
  for (const signal of signals) {
    expect(signal.id.startsWith(`${connector.id}:`)).toBe(true);
    expect(signal.source).toBe(connector.id);
    expect(signal.platform).toBe(connector.meta.platform);
    expect(signal.title.trim()).not.toBe("");
    expect(signal.strength).toBe(0);
    expect(signal.url).toMatch(/^https:\/\//);
    if (signal.publishedAt) expect(Number.isNaN(Date.parse(signal.publishedAt))).toBe(false);
    for (const value of Object.values(signal.metrics)) expect(Number.isFinite(value)).toBe(true);
    for (const tag of signal.tags) expect(tag).toBe(tag.toLowerCase());
    for (const link of signal.related) expect(link.url).toMatch(/^https?:\/\//);
  }
}

const summary = (signals: Signal[], n = 3) =>
  signals
    .slice(0, n)
    .map((signal) => `    - ${signal.title} | ${JSON.stringify(signal.metrics)} | ${signal.text ?? ""}`)
    .join("\n");

describe("live: free Google-side connectors (FR / fr)", () => {
  it("google_trends returns the trending list", async () => {
    const result = await googleTrendsConnector.fetch(ctx(["retraite"]));
    expectWellFormed(result.signals, googleTrendsConnector);
    const viaRpc = result.signals.some((signal) => signal.metrics.increasePct !== undefined);
    const ended = result.signals.filter((signal) => signal.text?.includes("terminée")).length;
    console.log(
      `[google_trends] ${result.signals.length} signaux via ${viaRpc ? "RPC i0OFE" : "RSS (repli)"}, ` +
        `${ended} terminées, ${result.signals.filter((s) => s.related.length).length} avec articles` +
        `${result.warning ? `\n  avertissement : ${result.warning}` : ""}\n${summary(result.signals)}`,
    );
    if (viaRpc) expect(result.signals.length).toBeGreaterThan(20);
  });

  it("google_trends RSS fallback still parses the official feed", async () => {
    const trends = await fetchTrendsRss("FR", AbortSignal.timeout(30_000));
    console.log(
      `[google_trends RSS] ${trends.length} tendances : ${trends
        .slice(0, 5)
        .map((trend) => `${trend.query} (${trend.searchVolume}+)`)
        .join(", ")}`,
    );
    expect(trends.length).toBeGreaterThan(0);
    expect(trends.length).toBeLessThanOrEqual(10);
    for (const trend of trends) {
      expect(trend.query).not.toBe("");
      expect(trend.searchVolume).toBeGreaterThan(0);
      expect(Number.isNaN(trend.startedAt)).toBe(false);
    }
  });

  it("google_news returns top stories and keyword articles", async () => {
    const result = await googleNewsConnector.fetch(ctx(["intelligence artificielle"]));
    expectWellFormed(result.signals, googleNewsConnector);
    const keyword = result.signals.filter((signal) => signal.query === "intelligence artificielle");
    const clusters = result.signals.filter((signal) => signal.related.length > 0);
    console.log(
      `[google_news] ${result.signals.length} signaux (${clusters.length} sujets à la une avec regroupement, ` +
        `${keyword.length} pour « intelligence artificielle »)${result.warning ? `\n  avertissement : ${result.warning}` : ""}\n` +
        summary(result.signals),
    );
    expect(keyword.length).toBeGreaterThan(0);
    expect(keyword.length).toBeLessThanOrEqual(25);

    const headlines = await searchGoogleNews("budget 2027", { geo: "FR", language: "fr", signal: AbortSignal.timeout(30_000), limit: 8 });
    console.log(`[searchGoogleNews] « budget 2027 » → ${headlines.length} titres\n${summary(headlines, 2)}`);
    expect(headlines.length).toBeGreaterThan(0);
    expect(headlines.length).toBeLessThanOrEqual(8);
  });

  it("wikipedia returns the most read articles with growth", async (context) => {
    let result;
    try {
      result = await wikipediaConnector.fetch(ctx());
    } catch (error) {
      // The sandbox shares its IP: Wikimedia may rate-limit it regardless of our behaviour.
      if (error instanceof SourceError && (error.status === 429 || error.status === 503)) {
        console.warn(`[wikipedia] limité par Wikimedia : ${error.message}`);
        context.skip();
      }
      throw error;
    }
    expectWellFormed(result.signals, wikipediaConnector);
    const withGrowth = result.signals.filter((signal) => signal.metrics.increasePct !== undefined);
    console.log(
      `[wikipedia] ${result.signals.length} articles, ${withGrowth.length} avec évolution sur un jour` +
        `${result.warning ? `\n  avertissement : ${result.warning}` : ""}\n${summary(result.signals)}`,
    );
    expect(result.signals.length).toBeLessThanOrEqual(40);
  });
});
