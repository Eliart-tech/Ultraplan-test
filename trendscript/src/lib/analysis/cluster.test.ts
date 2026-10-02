import { describe, expect, it } from "vitest";
import type { AnalyzeRequest, Signal } from "@/lib/types";
import { basicTopics } from "./cluster";
import { scoreSignals } from "./scoring";

const NOW = Date.parse("2026-10-02T12:00:00Z");

const request: AnalyzeRequest = {
  geo: "FR",
  language: "fr",
  niche: "",
  keywords: ["intelligence artificielle"],
  sources: ["google_trends", "google_news"],
  maxTopics: 10,
};

function signal(partial: Partial<Signal> & Pick<Signal, "id" | "title">): Signal {
  return {
    source: "google_news",
    platform: "news",
    kind: "news",
    metrics: {},
    tags: [],
    related: [],
    strength: 0,
    publishedAt: "2026-10-02T10:00:00Z",
    ...partial,
  };
}

describe("basicTopics", () => {
  it("attaches news and videos to the search trend they mention", () => {
    const signals = scoreSignals(
      [
        signal({
          id: "t1",
          title: "livret a",
          source: "google_trends",
          platform: "google",
          kind: "search_trend",
          metrics: { searchVolume: 50_000 },
        }),
        signal({ id: "n1", title: "Le taux du Livret A baisse au 1er février" }),
        signal({
          id: "v1",
          title: "Livret A : faut-il encore y placer son argent ?",
          source: "youtube_rss",
          platform: "youtube",
          kind: "video",
          metrics: { views: 12_000 },
        }),
      ],
      NOW,
    );
    const [topic] = basicTopics(signals, request, NOW);
    expect(topic.title).toBe("Livret a");
    expect(new Set(topic.signalIds)).toEqual(new Set(["t1", "n1", "v1"]));
    expect(topic.platforms).toEqual(expect.arrayContaining(["google", "news", "youtube"]));
  });

  it("groups every article of a niche keyword search into a single topic", () => {
    const signals = scoreSignals(
      ["Seyssins : l'IA expliquée", "NielsenIQ lance de nouveaux outils", "Pompiers et drones"].map((title, i) =>
        signal({ id: `k${i}`, title, query: "intelligence artificielle" }),
      ),
      NOW,
    );
    const topics = basicTopics(signals, request, NOW);
    expect(topics).toHaveLength(1);
    expect(topics[0].title).toBe("Actualité « intelligence artificielle »");
    expect(topics[0].signalIds).toHaveLength(3);
  });

  it("merges an article and a video about the same story", () => {
    const signals = scoreSignals(
      [
        signal({ id: "n1", title: "Tempête Alex : vigilance rouge en Bretagne" }),
        signal({
          id: "v1",
          title: "Tempête Alex : vigilance rouge en Bretagne",
          source: "youtube_rss",
          platform: "youtube",
          kind: "video",
        }),
      ],
      NOW,
    );
    const topics = basicTopics(signals, request, NOW);
    expect(topics).toHaveLength(1);
    expect(topics[0].platforms).toEqual(expect.arrayContaining(["news", "youtube"]));
  });
});

describe("basicTopics niche fit", () => {
  it("matches accented keywords exactly so 'épargné' is not 'épargne'", () => {
    const signals = scoreSignals(
      [
        signal({
          id: "t1",
          title: "tadej pogacar",
          source: "google_trends",
          platform: "google",
          kind: "search_trend",
          metrics: { searchVolume: 2000 },
          related: [{ title: "Pogacar épargné par les chutes", url: "https://example.org/a" }],
        }),
        signal({
          id: "t2",
          title: "livret a",
          source: "google_trends",
          platform: "google",
          kind: "search_trend",
          metrics: { searchVolume: 2000 },
          related: [{ title: "Le Livret A, placement d'épargne préféré", url: "https://example.org/b" }],
        }),
      ],
      NOW,
    );
    const topics = basicTopics(signals, { ...request, niche: "", keywords: ["épargne"] }, NOW);
    const fit = (title: string) => topics.find((t) => t.title === title)?.scores.nicheFit;
    expect(fit("Tadej pogacar")).toBe(0);
    expect(fit("Livret a")).toBe(70);
  });
});
