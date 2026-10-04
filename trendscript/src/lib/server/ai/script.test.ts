import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scriptRequestSchema } from "../../schemas";
import { fixtureCompetitors, fixtureDraft, fixtureRequest, fixtureSignals, NOW } from "../../script/__fixtures__/script";
import { checkScript } from "../../script/checks";
import { REVIEW_INSTRUCTIONS } from "../../script/prompt";
import { countWords, estimateDuration } from "../../script/metrics";
import type { ResearchBrief, ScriptEvent, ScriptRequest, Signal, Topic, ViralBrief } from "../../types";
import type { RelatedQueries } from "../sources/serpapi-trends";
import { fakeClient, fallbackBlock, jsonMessage, message, refusalMessage, textBlock, textMessage } from "./__fixtures__/anthropic";
import { AiError, cachedSystem } from "./client";
import {
  enrichmentQuery,
  generateScript,
  resolveGeo,
  REVIEW_NO_CHANGE,
  reviewOutputSchema,
  sanitizeDraft,
  type ScriptDeps,
  type ScriptOutput,
  scriptOutputSchema,
  urlKey,
} from "./script";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Claude's answer for the fixture draft (same content, output-contract shape). */
function output(overrides: Partial<ScriptOutput> = {}): ScriptOutput {
  const draft = fixtureDraft();
  return {
    title: draft.title,
    hooks: draft.hooks,
    beats: draft.beats,
    fullScript: draft.fullScript,
    cta: draft.cta,
    caption: draft.caption,
    hashtags: draft.hashtags,
    factsToVerify: draft.factsToVerify,
    sources: draft.sources.map((s) => ({ title: s.title, url: s.url, source: s.source ?? "" })),
    strengths: draft.strengths,
    risks: draft.risks,
    checklist: draft.checklist,
    ...overrides,
  };
}

const KNOWN = new Set(["https://www.example-daily.fr/heure-hiver-25-octobre", "https://trends.google.com/trends/explore?q=changement+d%27heure&geo=FR"]);

const NEWS: Signal[] = [
  {
    ...fixtureSignals[1],
    id: "google_news:n1",
    title: "Heure d'hiver 2026 : la nuit la plus longue de l'année",
    url: "https://presse.example/heure-hiver",
    author: "Presse Exemple",
    publishedAt: "2026-10-02T13:00:00Z",
  },
];

const RELATED: RelatedQueries = {
  rising: [
    { query: "changement d'heure 2026 date", value: "Breakout", breakout: true },
    { query: "heure d'hiver sommeil", value: "+450%", extractedValue: 450, breakout: false },
  ],
  top: [{ query: "changement d'heure", value: "100", extractedValue: 100, breakout: false }],
};

const BRIEF: ResearchBrief = {
  facts: "FAITS VÉRIFIÉS\n- Passage à l'heure d'hiver dans la nuit du 24 au 25 octobre 2026 — Service-public.fr, 1 oct. 2026",
  sources: [{ title: "Changement d'heure", url: "https://www.service-public.fr/heure", source: "service-public.fr" }],
};

function makeDeps(answer: Parameters<typeof fakeClient>[0], overrides: Partial<ScriptDeps> = {}) {
  const fake = fakeClient(answer);
  const deps = {
    client: fake.client,
    searchNews: vi.fn<NonNullable<ScriptDeps["searchNews"]>>(async () => NEWS),
    relatedQueries: vi.fn<NonNullable<ScriptDeps["relatedQueries"]>>(async () => RELATED),
    research: vi.fn<NonNullable<ScriptDeps["research"]>>(async () => BRIEF),
    now: () => NOW,
    ...overrides,
  };
  return { deps, calls: fake.calls };
}

async function generate(
  request: ScriptRequest,
  answer: Parameters<typeof fakeClient>[0] = [jsonMessage(output())],
  { env = {}, overrides = {}, signal = new AbortController().signal }: { env?: Record<string, string>; overrides?: Partial<ScriptDeps>; signal?: AbortSignal } = {},
) {
  const { deps, calls } = makeDeps(answer, overrides);
  const events: ScriptEvent[] = [];
  const script = await generateScript(request, (event) => events.push(event), signal, env, deps);
  return { script, events, calls, deps };
}

function withSettings(settings: Partial<ScriptRequest["settings"]>, extra: Partial<ScriptRequest> = {}): ScriptRequest {
  return { ...fixtureRequest, ...extra, settings: { ...fixtureRequest.settings, ...settings } };
}

const statusSteps = (events: ScriptEvent[]) => events.filter((e) => e.type === "status").map((e) => e.step);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("urlKey", () => {
  it("ignores the fragment, a trailing slash and surrounding spaces", () => {
    expect(urlKey(" https://a.example/page/#top ")).toBe("https://a.example/page");
    expect(urlKey("https://A.EXAMPLE")).toBe("https://a.example");
  });

  it("normalizes encoding like a browser would", () => {
    expect(urlKey("https://trends.google.com/trends/explore?q=changement+d'heure&geo=FR")).toBe(
      urlKey("https://trends.google.com/trends/explore?q=changement+d%27heure&geo=FR"),
    );
  });

  it("returns invalid URLs as they are", () => {
    expect(urlKey(" pas une url ")).toBe("pas une url");
  });
});

describe("resolveGeo / enrichmentQuery", () => {
  it("uses the analysis country, else the language's main country, else FR", () => {
    expect(resolveGeo({ ...fixtureRequest, geo: "be" })).toBe("BE");
    expect(resolveGeo(withSettings({ language: "en" }, { geo: undefined }))).toBe("US");
    expect(resolveGeo(withSettings({ language: "sv" }, { geo: undefined }))).toBe("FR");
  });

  it("searches the real Google Trends query, else the first keyword, else the title", () => {
    expect(enrichmentQuery(fixtureRequest)).toBe("changement d'heure");
    const noTrend = { ...fixtureRequest, signals: fixtureSignals.filter((s) => s.kind !== "search_trend") };
    expect(enrichmentQuery(noTrend)).toBe("changement d'heure");
    const noKeyword = { ...noTrend, topic: { ...fixtureRequest.topic, keywords: [], title: " Titre du sujet " } };
    expect(enrichmentQuery(noKeyword)).toBe("Titre du sujet");
  });
});

describe("sanitizeDraft", () => {
  it("keeps a clean answer as it is", () => {
    const { draft, removedLinks } = sanitizeDraft(output(), KNOWN);
    expect(removedLinks).toBe(0);
    expect(draft).toEqual(fixtureDraft());
  });

  it("removes sources that were not given to Claude, non-http links and duplicates", () => {
    const { draft, removedLinks } = sanitizeDraft(
      output({
        sources: [
          { title: "Connue", url: "https://www.example-daily.fr/heure-hiver-25-octobre", source: "Example Daily" },
          { title: "Doublon", url: "https://www.example-daily.fr/heure-hiver-25-octobre/#maj", source: "Example Daily" },
          { title: "Inventée", url: "https://invente.example/article", source: "Invente" },
          { title: "Script", url: "javascript:alert(1)", source: "" },
          { title: "", url: "https://trends.google.com/trends/explore?q=changement+d'heure&geo=FR", source: " " },
        ],
      }),
      KNOWN,
    );
    expect(removedLinks).toBe(2);
    expect(draft.sources).toEqual([
      { title: "Connue", url: "https://www.example-daily.fr/heure-hiver-25-octobre", source: "Example Daily" },
      {
        title: "https://trends.google.com/trends/explore?q=changement+d'heure&geo=FR",
        url: "https://trends.google.com/trends/explore?q=changement+d'heure&geo=FR",
      },
    ]);
  });

  it("downgrades facts citing an unknown URL to 'faible' without a source", () => {
    const { draft, removedLinks } = sanitizeDraft(
      output({
        factsToVerify: [
          { claim: "Connue", sourceUrl: " https://www.example-daily.fr/heure-hiver-25-octobre ", confidence: "haute" },
          { claim: "Inventée", sourceUrl: "https://invente.example/chiffre", confidence: "haute" },
          { claim: "Sans source", sourceUrl: null, confidence: "moyenne" },
          { claim: "Vide", sourceUrl: "  ", confidence: "moyenne" },
        ],
      }),
      KNOWN,
    );
    expect(removedLinks).toBe(1);
    expect(draft.factsToVerify).toEqual([
      { claim: "Connue", sourceUrl: "https://www.example-daily.fr/heure-hiver-25-octobre", confidence: "haute" },
      { claim: "Inventée", sourceUrl: null, confidence: "faible" },
      { claim: "Sans source", sourceUrl: null, confidence: "moyenne" },
      { claim: "Vide", sourceUrl: null, confidence: "moyenne" },
    ]);
  });

  it("normalizes hashtags: one leading #, no spaces, no case-insensitive duplicates", () => {
    const { draft } = sanitizeDraft(output({ hashtags: ["sommeil", "##Heure", "#heure d'hiver", "#Sommeil", "#", "  ", "#a#b"] }), KNOWN);
    expect(draft.hashtags).toEqual(["#sommeil", "#Heure", "#heured'hiver", "#ab"]);
  });

  it("keeps 3 hooks at most and drops empty strengths and risks", () => {
    const hooks = [...fixtureDraft().hooks, { ...fixtureDraft().hooks[0], style: "Quatrième" }];
    const { draft } = sanitizeDraft(output({ hooks, strengths: ["Fort", "  "], risks: [""] }), KNOWN);
    expect(draft.hooks).toHaveLength(3);
    expect(draft.strengths).toEqual(["Fort"]);
    expect(draft.risks).toEqual([]);
  });

  it("trims every field to the request-schema limits, so the draft can be sent back for refinement", () => {
    const long = (n: number) => "x".repeat(n);
    const { draft } = sanitizeDraft(
      output({
        title: long(400),
        fullScript: long(25_000),
        caption: long(6000),
        cta: long(2000),
        hashtags: [long(150)],
        beats: fixtureDraft().beats.map((b) => ({ ...b, label: long(200), voiceover: long(4000), onScreenText: long(600) })),
        hooks: fixtureDraft().hooks.map((h) => ({ ...h, style: long(200), spoken: long(2000) })),
        checklist: [{ criterion: long(400), passed: true, comment: long(2000) }],
        factsToVerify: [{ claim: long(2000), sourceUrl: null, confidence: "faible" }],
      }),
      KNOWN,
    );
    expect(draft.title).toHaveLength(300);
    expect(draft.title.endsWith("…")).toBe(true);
    expect(draft.hashtags[0]).toHaveLength(100);
    const parsed = scriptRequestSchema.shape.refine.safeParse({ previous: draft, instruction: "Plus court" });
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  });
});

describe("scriptOutputSchema", () => {
  it("accepts the fixture answer and asks for the audit fields last", () => {
    expect(scriptOutputSchema.safeParse(output()).success).toBe(true);
    const keys = Object.keys(scriptOutputSchema.shape);
    expect(keys.slice(0, 3)).toEqual(["title", "hooks", "beats"]);
    expect(keys.at(-1)).toBe("checklist");
  });
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

describe("generateScript", () => {
  it("writes a script from the analysis data and Google News headlines", async () => {
    const { script, events, calls, deps } = await generate(fixtureRequest);

    expect(statusSteps(events)).toEqual(["research", "writing", "finalizing"]);
    expect(events[0]).toEqual({ type: "status", step: "research", message: "Collecte des titres de presse récents…" });
    expect(events.some((e) => e.type === "progress")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "result", script });
    expect(events.some((e) => e.type === "research")).toBe(false);

    expect(deps.searchNews).toHaveBeenCalledWith("changement d'heure", expect.objectContaining({ geo: "FR", language: "fr", limit: 8 }));
    expect(deps.relatedQueries).not.toHaveBeenCalled();
    expect(deps.research).not.toHaveBeenCalled();

    expect(calls).toHaveLength(1);
    const { params } = calls[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 32_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    const system = params.system as ReturnType<typeof cachedSystem>;
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toContain("Tu es le scénariste principal de TrendScript");
    expect(system[1].text).toMatch(/^<reglages_actifs>/);
    const user = params.messages[0].content as string;
    expect(user).toContain("[T1] « Heure d'hiver 2026 : la nuit la plus longue de l'année » · Presse Exemple");
    expect(user).not.toContain("<recherche_web>");
    expect(user).not.toContain("<recherches_associees>");

    expect(script).toMatchObject({
      ...fixtureDraft(),
      model: "claude-opus-5-5",
      createdAt: new Date(NOW).toISOString(),
      wordCount: countWords(fixtureDraft().fullScript),
      wordBudget: 101,
      estimatedDurationSec: estimateDuration(countWords(fixtureDraft().fullScript), "normal"),
      warnings: [],
    });
    expect(script.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(script).not.toHaveProperty("research");
  });

  it("derives the news locale from the language when the request has no country", async () => {
    const { deps } = await generate(withSettings({ language: "en" }, { geo: undefined }));
    expect(deps.searchNews).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ geo: "US", language: "en" }));
  });

  it("runs the web research when asked and grounds the script on it", async () => {
    const answer = output({
      factsToVerify: [{ claim: "Nuit du 24 au 25 octobre", sourceUrl: "https://www.service-public.fr/heure", confidence: "haute" }],
      sources: [{ title: "Changement d'heure", url: "https://www.service-public.fr/heure", source: "service-public.fr" }],
    });
    const request = withSettings({ research: true });
    const signal = new AbortController().signal;
    const { script, events, calls, deps } = await generate(request, [jsonMessage(answer)], { signal });

    expect(events[0]).toEqual({
      type: "status",
      step: "research",
      message: "Recherche web et vérification des faits (jusqu'à 5 recherches)…",
    });
    expect(events[1]).toEqual({ type: "research", brief: BRIEF });
    expect(deps.research).toHaveBeenCalledWith({
      topic: request.topic,
      signals: request.signals,
      settings: request.settings,
      geo: "FR",
      signal,
      env: {},
      angle: request.angle,
      client: deps.client,
      now: NOW,
    });
    const user = calls[0].params.messages[0].content as string;
    expect(user).toContain("[R1] Changement d'heure (service-public.fr) — https://www.service-public.fr/heure");
    // The research sources are known: the fact keeps its source and confidence.
    expect(script.factsToVerify[0]).toEqual(answer.factsToVerify[0]);
    expect(script.sources).toHaveLength(1);
    expect(script.research).toEqual(BRIEF);
    expect(script.warnings).toEqual([]);
  });

  it("adds SerpApi related searches when a key is configured", async () => {
    const { calls, deps } = await generate(fixtureRequest, undefined, { env: { SERPAPI_API_KEY: " serp-key " } });
    expect(deps.relatedQueries).toHaveBeenCalledWith("changement d'heure", expect.objectContaining({ apiKey: "serp-key", geo: "FR", language: "fr" }));
    const user = calls[0].params.messages[0].content as string;
    expect(user).toContain("- changement d'heure 2026 date (Record (> +5 000 %))");
    expect(user).toContain("- heure d'hiver sommeil (+450%)");
    expect(user).toContain("- changement d'heure (intérêt 100)");
  });

  it("never fails because of an enrichment failure", async () => {
    const { script, events, calls } = await generate(withSettings({ research: true }), undefined, {
      env: { SERPAPI_API_KEY: "serp-key" },
      overrides: {
        research: vi.fn(async () => {
          throw new AiError("La recherche web n'a rien renvoyé d'exploitable.");
        }),
        searchNews: vi.fn(async () => {
          throw new Error("HTTP 503");
        }),
        relatedQueries: vi.fn(async () => {
          throw new Error("quota");
        }),
      },
    });
    expect(events.some((e) => e.type === "research")).toBe(false);
    expect(script.research).toBeUndefined();
    expect(script.warnings).toEqual([
      "Recherche web indisponible (La recherche web n'a rien renvoyé d'exploitable.) : script écrit à partir des seules données de l'analyse.",
      "Recherches associées SerpApi indisponibles : mots-clés de référencement non enrichis.",
    ]);
    const user = calls[0].params.messages[0].content as string;
    expect(user).not.toContain("<titres_presse>");
    expect(user).toContain("<preuves>");
    expect(events.at(-1)?.type).toBe("result");
  });

  it("describes SDK errors of the research step in French", async () => {
    const { script } = await generate(withSettings({ research: true }), undefined, {
      overrides: {
        research: vi.fn(async () => {
          throw new Anthropic.PermissionDeniedError(403, { type: "error" }, undefined, new Headers());
        }),
      },
    });
    expect(script.warnings[0]).toMatch(/^Recherche web indisponible \(Accès refusé par l'API Claude \(403\)/);
  });

  it("applies the sensitivity guardrails before research and writing, and reports them first", async () => {
    const drama: Topic = { ...fixtureRequest.topic, sensitivity: { level: "elevee", reason: "Sujet sensible : drame / catastrophe." } };
    const request = withSettings({ virality: 90, tone: "humoristique", hookStyle: "pov", cta: "comment_keyword", research: true }, { topic: drama });
    const { script, calls, deps } = await generate(request);

    const guarded = vi.mocked(deps.research).mock.calls[0][0].settings;
    expect(guarded).toMatchObject({ virality: 39, tone: "journalistique", hookStyle: "auto", cta: "none" });
    const system = calls[0].params.system as ReturnType<typeof cachedSystem>;
    expect(system[1].text).toContain("Viralité 39/100 — bande V2");
    expect((calls[0].params.messages[0].content as string)).toContain("Drame : aucun chiffre choc");
    expect(script.warnings.slice(0, 5).map((w) => w.slice(0, 15))).toEqual([
      "Sujet sensible ",
      "Ton « Humoristi",
      "Accroche « POV ",
      "CTA « commentai",
      "Le script inclu",
    ]);
  });

  it("adds the code checks to the warnings", async () => {
    const { script } = await generate(fixtureRequest, [jsonMessage(output({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"] }))]);
    expect(script.warnings).toEqual(checkScript({ ...fixtureDraft(), hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"] }, fixtureRequest.settings, 101));
    expect(script.warnings).toEqual(["Instagram limite à 5 hashtags (7 proposés) : gardez les 5 plus précis."]);
  });

  it("removes invented links and says so", async () => {
    const answer = output({
      factsToVerify: [{ claim: "Chiffre inventé", sourceUrl: "https://invente.example/x", confidence: "haute" }],
    });
    const { script } = await generate(fixtureRequest, [jsonMessage(answer)]);
    expect(script.factsToVerify).toEqual([{ claim: "Chiffre inventé", sourceUrl: null, confidence: "faible" }]);
    expect(script.warnings).toEqual([
      "1 lien(s) cité(s) par Claude ne figurai(en)t pas dans les sources fournies : retiré(s), affirmations concernées passées en confiance faible.",
      "1 affirmation sans source : vérifiez-les avant de publier.",
    ]);
  });

  it("accepts links from the Google News headlines it was given", async () => {
    const answer = output({
      sources: [{ title: "Heure d'hiver 2026", url: "https://presse.example/heure-hiver", source: "Presse Exemple" }],
    });
    const { script } = await generate(fixtureRequest, [jsonMessage(answer)]);
    expect(script.sources.map((s) => s.url)).toEqual(["https://presse.example/heure-hiver"]);
    expect(script.warnings).toEqual([]);
  });

  it("reports a server-side fallback and the model that actually wrote the script", async () => {
    const answer = message(
      [textBlock('{"title": "par'), fallbackBlock("claude-opus-5-5", "claude-opus-5"), textBlock(JSON.stringify(output()))],
      "end_turn",
      { model: "claude-opus-5" },
    );
    const { script } = await generate(fixtureRequest, [answer]);
    expect(script.model).toBe("claude-opus-5");
    expect(script.warnings).toEqual([
      "Le modèle principal a décliné la demande : script rédigé par claude-opus-5 (repli automatique).",
    ]);
  });

  it("uses ANTHROPIC_MODEL when set", async () => {
    const { calls } = await generate(fixtureRequest, undefined, { env: { ANTHROPIC_MODEL: "claude-sonnet-5-5" } });
    expect(calls[0].params.model).toBe("claude-sonnet-5-5");
  });

  describe("refine mode", () => {
    const previous = fixtureDraft({
      sources: [{ title: "Ancienne source", url: "https://old.example/source", source: "Old" }],
    });
    const request: ScriptRequest = { ...fixtureRequest, settings: { ...fixtureRequest.settings, research: true }, refine: { previous, instruction: "Hook plus percutant" } };

    it("skips research and enrichment, and sends the previous draft with the instruction", async () => {
      const answer = output({ sources: [{ title: "Ancienne source", url: "https://old.example/source", source: "Old" }] });
      const { script, events, calls, deps } = await generate(request, [jsonMessage(answer)]);
      expect(deps.research).not.toHaveBeenCalled();
      expect(deps.searchNews).not.toHaveBeenCalled();
      expect(deps.relatedQueries).not.toHaveBeenCalled();
      expect(statusSteps(events)).toEqual(["writing", "finalizing"]);
      expect(events.find((e) => e.type === "status")).toEqual({ type: "status", step: "writing", message: "Affinage du script…" });
      const user = calls[0].params.messages[0].content as string;
      expect(user).toContain("<version_precedente>");
      expect(user).toContain("« Hook plus percutant »");
      // Links of the previous version stay valid.
      expect(script.sources.map((s) => s.url)).toEqual(["https://old.example/source"]);
      expect(script.warnings).toEqual([]);
    });
  });

  describe("critical review pass", () => {
    const reviewed = (overrides: Partial<ScriptOutput> = {}, changes = ["Hook : formule vague remplacée par la date sourcée [P1] → sujet clair en 1 s", "CTA déplacé après le payoff"]) => ({
      changes,
      ...output({ title: "Changement d'heure : le réglage que tout le monde oublie", ...overrides }),
    });

    it("rereads the draft as a demanding editor and returns the improved version with what changed", async () => {
      const longDraft = output({ hashtags: ["#a", "#b", "#c", "#d", "#e", "#f"] });
      const { script, events, calls } = await generate(withSettings({ review: true }), [jsonMessage(longDraft), jsonMessage(reviewed())]);

      expect(statusSteps(events)).toEqual(["research", "writing", "review", "finalizing"]);
      expect(events.find((e) => e.type === "status" && e.step === "review")).toEqual({ type: "status", step: "review", message: "Relecture critique…" });
      expect(calls).toHaveLength(2);

      const [writing, review] = calls.map((c) => c.params);
      const writingSystem = writing.system as ReturnType<typeof cachedSystem>;
      const reviewSystem = review.system as ReturnType<typeof cachedSystem>;
      // Same cached prefix, then the editor's instructions.
      expect(reviewSystem).toHaveLength(3);
      expect(reviewSystem[0]).toEqual(writingSystem[0]);
      expect(reviewSystem[1]).toEqual(writingSystem[1]);
      expect(reviewSystem[2].text).toBe(REVIEW_INSTRUCTIONS);
      expect(review).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "high", format: { type: "json_schema" } } });
      const schema = (review.output_config?.format as unknown as { schema: { required: string[] } }).schema;
      expect(schema.required[0]).toBe("changes");

      const user = review.messages[0].content as string;
      expect(user.startsWith(writing.messages[0].content as string)).toBe(true);
      expect(user).toContain("<brouillon_a_relire>");
      expect(user).toContain('"hashtags": [\n  "#a"');
      // The code checks of the first draft are handed to the editor.
      expect(user).toContain("<controles_automatiques>\n- Instagram limite à 5 hashtags (6 proposés) : gardez les 5 plus précis.");

      expect(script.title).toBe("Changement d'heure : le réglage que tout le monde oublie");
      expect(script.hashtags).toEqual(fixtureDraft().hashtags);
      expect(script.reviewNotes).toEqual([
        "Hook : formule vague remplacée par la date sourcée [P1] → sujet clair en 1 s",
        "CTA déplacé après le payoff",
      ]);
      expect(script.warnings).toEqual([]);
      expect(events.at(-1)).toEqual({ type: "result", script });
    });

    it("says so when the editor changed nothing", async () => {
      const { script } = await generate(withSettings({ review: true }), [jsonMessage(output()), jsonMessage(reviewed({}, ["  "]))]);
      expect(script.reviewNotes).toEqual([REVIEW_NO_CHANGE]);
    });

    it("keeps the first draft, with a warning, when the review fails", async () => {
      const { script, events } = await generate(withSettings({ review: true }), [
        jsonMessage(output()),
        new Anthropic.InternalServerError(529, { type: "error" }, undefined, new Headers()),
      ]);
      expect(script).toMatchObject(fixtureDraft());
      expect(script).not.toHaveProperty("reviewNotes");
      expect(script.warnings).toEqual([
        "Relecture critique indisponible (API Claude surchargée ou indisponible (529) : réessayez dans quelques instants.) : première version conservée.",
      ]);
      expect(statusSteps(events)).toEqual(["research", "writing", "review", "finalizing"]);
    });

    it("keeps the first draft when the review breaks the output contract", async () => {
      const { script } = await generate(withSettings({ review: true }), [jsonMessage(output()), jsonMessage({ changes: ["x"], title: 3 })]);
      expect(script.title).toBe(fixtureDraft().title);
      expect(script.warnings[0]).toMatch(/^Relecture critique indisponible \(Réponse de Claude incomplète pendant la relecture critique du script/);
    });

    it("re-checks the links of the reviewed draft", async () => {
      const invented = reviewed({ sources: [{ title: "Inventée", url: "https://invente.example/x", source: "X" }] });
      const { script } = await generate(withSettings({ review: true }), [jsonMessage(output()), jsonMessage(invented)]);
      expect(script.sources).toEqual([]);
      expect(script.warnings[0]).toMatch(/^1 lien\(s\) cité\(s\) par Claude/);
    });

    it("reports a fallback during the review and credits the model that wrote the final text", async () => {
      const answer = message([fallbackBlock("claude-opus-5-5", "claude-opus-5"), textBlock(JSON.stringify(reviewed()))], "end_turn", { model: "claude-opus-5" });
      const { script } = await generate(withSettings({ review: true }), [jsonMessage(output()), answer]);
      expect(script.model).toBe("claude-opus-5");
      expect(script.warnings).toEqual(["Le modèle principal a décliné la relecture : relecture faite par claude-opus-5 (repli automatique)."]);
    });

    it("is skipped when refining (a targeted edit asked by the creator)", async () => {
      const refine = { previous: fixtureDraft(), instruction: "Hook plus percutant" };
      const { calls, events, script } = await generate(withSettings({ review: true }, { refine }), [jsonMessage(output())]);
      expect(calls).toHaveLength(1);
      expect(statusSteps(events)).toEqual(["writing", "finalizing"]);
      expect(script).not.toHaveProperty("reviewNotes");
    });

    it("stops when the request is cancelled during the review", async () => {
      const controller = new AbortController();
      const { deps } = makeDeps([jsonMessage(output())]);
      const fake = fakeClient([jsonMessage(output())]);
      const client = {
        beta: {
          messages: {
            stream: (params: Parameters<typeof fake.client.beta.messages.stream>[0], options?: { signal?: AbortSignal }) => {
              if ((params.system as unknown[]).length === 3) {
                controller.abort();
                return { on() { return this; }, finalMessage: async () => { throw new Anthropic.APIUserAbortError(); } };
              }
              return fake.client.beta.messages.stream(params, options);
            },
          },
        },
      } as unknown as Anthropic;
      const events: ScriptEvent[] = [];
      await expect(
        generateScript(withSettings({ review: true }), (e) => events.push(e), controller.signal, {}, { ...deps, client }),
      ).rejects.toThrow(new AiError("Génération annulée."));
      expect(events.some((e) => e.type === "result")).toBe(false);
    });

    it("validates the review contract: changes first, then the full draft", () => {
      expect(Object.keys(reviewOutputSchema.shape)[0]).toBe("changes");
      expect(reviewOutputSchema.safeParse(reviewed()).success).toBe(true);
    });
  });

  describe("competitors", () => {
    it("sends the competitive landscape and checks the draft does not reuse their titles", async () => {
      const copied = output({ title: "3 rituels pour s'endormir en 10 minutes" });
      const { calls, script } = await generate({ ...fixtureRequest, competitors: fixtureCompetitors }, [jsonMessage(copied)]);
      expect(calls[0].params.messages[0].content as string).toContain("<paysage_concurrentiel>");
      expect(script.warnings).toEqual([
        "Titre très proche d'une publication de @sommeilfacile (« 3 rituels pour s'endormir en 10 minutes ») : reformulez pour vous démarquer.",
      ]);
    });

    it("gives the overlap to the editor during the review", async () => {
      const copied = output({ title: "3 rituels pour s'endormir en 10 minutes" });
      const { calls } = await generate({ ...withSettings({ review: true }), competitors: fixtureCompetitors }, [jsonMessage(copied), jsonMessage({ changes: ["Titre changé"], ...output() })]);
      expect(calls[1].params.messages[0].content as string).toContain("- Titre très proche d'une publication de @sommeilfacile");
    });
  });

  describe("what wins in the niche (Ce qui cartonne)", () => {
    const nicheRecipes: ViralBrief = {
      niche: "sommeil et productivité",
      keywords: ["sommeil"],
      recipes: [
        {
          name: "Liste d'erreurs + promesse pour ce soir",
          description: "3 erreurs concrètes puis le geste du soir.",
          viewsLever: "On se reconnaît et on l'envoie.",
          followLever: "Suite annoncée (hypothèse).",
        },
      ],
      hookPatterns: [],
      followDrivers: [],
      avoid: [],
      topTitles: ["Changement d'heure : les 3 réglages avant dimanche"],
    };

    it("sends the niche's recipes with the request and validates them with the request schema", async () => {
      expect(scriptRequestSchema.safeParse({ ...fixtureRequest, nicheRecipes }).success).toBe(true);
      const { calls, script } = await generate({ ...fixtureRequest, nicheRecipes }, [jsonMessage(output())]);
      const user = calls[0].params.messages[0].content as string;
      expect(user).toContain("<ce_qui_cartonne>\n## Ce qui cartonne dans ta niche");
      expect(user).toContain("1. Liste d'erreurs + promesse pour ce soir — 3 erreurs concrètes puis le geste du soir.");
      expect(user).toContain("dont un qui commence par « Recette : » et un par « Abonnement : »");
      // The fixture title "Changement d'heure : 3 réglages avant dimanche" is a near copy of the top title.
      expect(script.warnings).toEqual([
        "Titre très proche d'une vidéo qui cartonne dans votre niche (« Changement d'heure : les 3 réglages avant dimanche ») : reformulez pour ne pas la copier.",
      ]);
    });

    it("has the editor check the recipe, the follow lever and the copy during the review", async () => {
      const { calls, script } = await generate({ ...withSettings({ review: true }), nicheRecipes }, [
        jsonMessage(output()),
        jsonMessage({ changes: ["Titre reformulé"], ...output({ title: "Ton réveil va te mentir dimanche : 3 réglages" }) }),
      ]);
      const reviewUser = calls[1].params.messages[0].content as string;
      expect(reviewUser).toContain("<ce_qui_cartonne>");
      expect(reviewUser).toContain("<controles_automatiques>\n- Titre très proche d'une vidéo qui cartonne dans votre niche");
      expect((calls[1].params.system as { text: string }[])[2].text).toContain("Si <ce_qui_cartonne> est présent");
      expect(script.warnings).toEqual([]);
      expect(script.reviewNotes).toEqual(["Titre reformulé"]);
    });
  });

  describe("failures", () => {
    async function failure(answer: Parameters<typeof fakeClient>[0]) {
      const events: ScriptEvent[] = [];
      const { deps } = makeDeps(answer);
      const promise = generateScript(fixtureRequest, (e) => events.push(e), new AbortController().signal, {}, deps);
      return { promise, events };
    }

    it("explains a refusal and emits no result", async () => {
      const { promise, events } = await failure([refusalMessage("Catégorie générale.")]);
      await expect(promise).rejects.toThrow(
        new AiError("Claude a refusé l'écriture du script (Catégorie générale.). Reformulez vos consignes ou choisissez un autre sujet."),
      );
      expect(events.some((e) => e.type === "result")).toBe(false);
    });

    it("suggests a shorter script when the answer is truncated", async () => {
      const { promise } = await failure([textMessage('{"title": "Tron', "max_tokens")]);
      await expect(promise).rejects.toThrow(
        "Réponse de Claude tronquée (limite de longueur atteinte) pendant l'écriture du script : choisissez une durée plus courte ou simplifiez les consignes, puis relancez.",
      );
    });

    it("rejects invalid JSON", async () => {
      const { promise } = await failure([textMessage("Voici votre script : …")]);
      await expect(promise).rejects.toThrow("Réponse de Claude illisible (JSON invalide) pendant l'écriture du script : réessayez.");
    });

    it("rejects JSON that breaks the output contract", async () => {
      const { promise } = await failure([jsonMessage({ ...output(), hooks: "pas un tableau" })]);
      await expect(promise).rejects.toThrow(/^Réponse de Claude incomplète pendant l'écriture du script \(champ « hooks » : /);
    });

    it("turns SDK errors into French AiErrors", async () => {
      const { promise } = await failure([new Anthropic.RateLimitError(429, { type: "error" }, undefined, new Headers())]);
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).message).toBe("Limite de requêtes Claude atteinte : réessayez dans une minute.");
    });

    it("names ANTHROPIC_API_KEY when no client is available", async () => {
      const promise = generateScript(fixtureRequest, () => undefined, new AbortController().signal, {}, { now: () => NOW });
      await expect(promise).rejects.toThrow(/ajoutez ANTHROPIC_API_KEY/);
    });

    it("stops before writing when the request is cancelled during the research", async () => {
      const controller = new AbortController();
      const { deps, calls } = makeDeps([jsonMessage(output())], {
        searchNews: vi.fn(async () => {
          controller.abort();
          return NEWS;
        }),
      });
      const events: ScriptEvent[] = [];
      await expect(generateScript(fixtureRequest, (e) => events.push(e), controller.signal, {}, deps)).rejects.toThrow(
        new AiError("Génération annulée."),
      );
      expect(calls).toHaveLength(0);
      expect(statusSteps(events)).toEqual(["research"]);
    });
  });
});
