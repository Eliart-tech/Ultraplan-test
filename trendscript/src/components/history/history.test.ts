import { describe, expect, it } from "vitest";
import type { SavedScript } from "@/lib/client/storage";
import type { Analysis, Signal, Topic } from "@/lib/types";
import { analysisTitle, analysisToMarkdown, countryName, rankedTopics } from "./analysis-export";
import { filterAnalyses, filterScripts, matchesQuery, normalizeSearch } from "./history-search";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "google_news:abc",
    source: "google_news",
    platform: "news",
    kind: "news",
    title: "La réforme expliquée",
    url: "https://example.org/article",
    author: "Le Journal",
    metrics: { views: 12_300 },
    tags: [],
    related: [],
    strength: 50,
    ...overrides,
  };
}

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "t1",
    title: "Réforme des retraites",
    summary: "Le texte arrive au Sénat.",
    whyNow: "Vote prévu cette semaine.",
    category: "Politique",
    platforms: ["news", "google"],
    signalIds: ["google_news:abc", "missing:id"],
    keywords: ["retraites"],
    lifespan: "court",
    saturation: "moyenne",
    sensitivity: { level: "elevee", reason: "Sujet politique" },
    scores: { momentum: 70, reach: 60, crossPlatform: 55, freshness: 80, nicheFit: 40, total: 61 },
    angles: [
      {
        id: "a1",
        type: "pedagogique",
        title: "Ce qui change pour toi",
        pitch: "Trois points concrets.",
        hook: "Ton départ à la retraite vient de bouger.",
        whyItWorks: "Bénéfice direct.",
      },
    ],
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: "an1",
    createdAt: "2026-10-02T12:05:00.000Z",
    request: {
      geo: "FR",
      language: "fr",
      niche: "finance perso",
      keywords: ["épargne", "impôts"],
      sources: ["google_news"],
      maxTopics: 8,
    },
    mode: "ai",
    model: "claude-opus-5-5",
    sources: [],
    signals: [signal()],
    topics: [topic({ id: "low", title: "Petit sujet", scores: { ...topic().scores, total: 20 }, angles: [] }), topic()],
    notes: ["YouTube non configuré."],
    ...overrides,
  };
}

function saved(title: string, topicTitle: string, hashtags: string[] = []): SavedScript {
  return {
    id: title,
    savedAt: "2026-10-02T12:00:00.000Z",
    script: { title, hashtags } as unknown as SavedScript["script"],
    topic: topic({ title: topicTitle }),
    angle: topic().angles[0],
    settings: {} as SavedScript["settings"],
    signals: [],
  };
}

describe("normalizeSearch / matchesQuery", () => {
  it("ignores case, accents, hashes and extra spaces", () => {
    expect(normalizeSearch("  Réforme   ÉTÉ #IA ")).toBe("reforme ete ia");
  });

  it("requires every word, in any field", () => {
    expect(matchesQuery(["Réforme des retraites", "Politique"], "politique reforme")).toBe(true);
    expect(matchesQuery(["Réforme des retraites"], "reforme chômage")).toBe(false);
    expect(matchesQuery(["anything"], "   ")).toBe(true);
  });
});

describe("filterScripts / filterAnalyses", () => {
  const scripts = [saved("Ton salaire en 2027", "Budget 2027", ["impots"]), saved("Le vrai prix du café", "Inflation")];

  it("matches the script title, the topic and the hashtags", () => {
    expect(filterScripts(scripts, "salaire").map((s) => s.id)).toEqual(["Ton salaire en 2027"]);
    expect(filterScripts(scripts, "inflation").map((s) => s.id)).toEqual(["Le vrai prix du café"]);
    expect(filterScripts(scripts, "#impôts").map((s) => s.id)).toEqual(["Ton salaire en 2027"]);
    expect(filterScripts(scripts, "")).toBe(scripts);
  });

  it("matches the niche, keywords, country and topic titles of analyses", () => {
    const list = [
      analysis(),
      analysis({ id: "an2", request: { ...analysis().request, niche: "", keywords: [], geo: "BE" }, topics: [] }),
    ];
    expect(filterAnalyses(list, "epargne").map((a) => a.id)).toEqual(["an1"]);
    expect(filterAnalyses(list, "retraites").map((a) => a.id)).toEqual(["an1"]);
    expect(filterAnalyses(list, "belgique").map((a) => a.id)).toEqual(["an2"]);
  });

  it("survives malformed entries from storage", () => {
    const broken = { ...saved("x", "y"), script: {} } as unknown as SavedScript;
    expect(filterScripts([broken], "x")).toEqual([]);
  });
});

describe("analysis labels", () => {
  it("names countries in French and falls back to a generic title", () => {
    expect(countryName("FR")).toBe("France");
    expect(analysisTitle(analysis())).toBe("finance perso");
    expect(analysisTitle(analysis({ request: { ...analysis().request, niche: "  " } }))).toBe("Tendances du moment");
  });

  it("ranks topics by total score", () => {
    expect(rankedTopics(analysis()).map((t) => t.title)).toEqual(["Réforme des retraites", "Petit sujet"]);
  });
});

describe("analysisToMarkdown", () => {
  const markdown = analysisToMarkdown(analysis(), { timeZone: "UTC" });

  it("starts with the niche and the request summary", () => {
    expect(markdown.startsWith("# Analyse de tendances — finance perso\n")).toBe(true);
    expect(markdown).toContain("> Pays : France · Langue : français · Mode : IA (claude-opus-5-5)");
    expect(markdown).toContain("> Mots-clés : épargne, impôts");
    expect(markdown).toContain("Réalisée le 2 oct. 2026, 12:05 · 2 sujets");
  });

  it("lists topics by score with angles, sensitivity and the evidence it can resolve", () => {
    expect(markdown.indexOf("## 1. Réforme des retraites — score 61/100")).toBeLessThan(
      markdown.indexOf("## 2. Petit sujet"),
    );
    expect(markdown).toContain("_Politique · Actualités, Google · durée de vie : Court terme · saturation : moyenne_");
    expect(markdown).toContain("**Sensibilité élevée :** Sujet politique");
    expect(markdown).toContain("- **Ce qui change pour toi** (Pédagogique) — Trois points concrets.");
    expect(markdown).toContain("  - Accroche : « Ton départ à la retraite vient de bouger. »");
    // fr-FR number formatting uses (narrow) no-break spaces.
    expect(markdown).toMatch(
      /- \[La réforme expliquée\]\(https:\/\/example\.org\/article\) — Actualités · Le Journal · 12,3\s?k vues/u,
    );
    expect(markdown).not.toContain("missing:id");
  });

  it("ends with the notes and no blank-line runs", () => {
    expect(markdown).toContain("## Notes\n\n- YouTube non configuré.");
    expect(markdown).not.toMatch(/\n{3,}/);
    expect(markdown.endsWith("_Exporté depuis TrendScript._\n")).toBe(true);
  });

  it("handles an analysis without topics", () => {
    expect(analysisToMarkdown(analysis({ topics: [], notes: [] }), { timeZone: "UTC" })).toContain(
      "_Aucun sujet dans cette analyse._",
    );
  });
});
