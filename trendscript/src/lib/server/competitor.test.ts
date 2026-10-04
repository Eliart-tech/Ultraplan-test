import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCompetitorRequest, fixtureCreator, NOW } from "../creators/__fixtures__/creator";
import { computeCreatorStats } from "../creators/stats";
import type { CompetitorEvent, CreatorData } from "../types";
import { fakeClient, jsonMessage } from "./ai/__fixtures__/anthropic";
import { fixtureCompetitorOutput } from "./ai/__fixtures__/competitor";
import { NO_AI_COMPETITOR_NOTE, runCompetitorAnalysis, sampleNotes, type CompetitorDeps } from "./competitor";
import { SourceError } from "./http";

// The real fetchers live in ./creators (network); the orchestrator is tested with injected fakes.
vi.mock("./creators", () => ({
  normalizeHandle: vi.fn((_platform: string, input: string) => {
    const handle = input.trim().replace(/^@/, "");
    return /^[\w.]{2,}$/.test(handle) ? handle.toLowerCase() : null;
  }),
  fetchCreator: vi.fn(async () => {
    throw new Error("fetchCreator must be injected in tests");
  }),
}));

const PARIS = { now: NOW, timeZone: "Europe/Paris" };

function fakeFetch(result: CreatorData | Error = fixtureCreator) {
  return vi.fn<NonNullable<CompetitorDeps["fetch"]>>(async () => {
    if (result instanceof Error) throw result;
    return structuredClone(result);
  });
}

async function run(deps: CompetitorDeps, { env = {}, signal = new AbortController().signal, request = fixtureCompetitorRequest } = {}) {
  const events: CompetitorEvent[] = [];
  const report = await runCompetitorAnalysis(request, (event) => events.push(event), signal, env, { now: NOW, ...deps });
  return { report, events };
}

const steps = (events: CompetitorEvent[]) => events.map((e) => (e.type === "status" ? `status:${e.step}` : e.type));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runCompetitorAnalysis", () => {
  it("fetches, computes the stats, asks Claude and streams every step", async () => {
    const fetch = fakeFetch();
    const fake = fakeClient([jsonMessage(fixtureCompetitorOutput())]);
    const { report, events } = await run({ fetch, client: fake.client });

    expect(fetch).toHaveBeenCalledWith("tiktok", "budgetmalin", {
      env: {},
      signal: expect.any(AbortSignal),
      now: NOW,
      geo: "FR",
      language: "fr",
      maxPosts: 30,
    });
    const order = steps(events).filter((step, i, all) => step !== "progress" || all[i - 1] !== "progress");
    expect(order).toEqual(["status:fetch", "status:stats", "data", "status:analysis", "progress", "result"]);
    expect(events[0]).toEqual({ type: "status", step: "fetch", message: "Récupération des publications de @budgetmalin sur TikTok…" });

    const stats = computeCreatorStats(fixtureCreator, PARIS);
    expect(events[2]).toEqual({ type: "data", data: fixtureCreator, stats });
    expect(report).toMatchObject({
      createdAt: new Date(NOW).toISOString(),
      mode: "ai",
      model: "claude-opus-5-5",
      focus: "ses hooks",
      data: fixtureCreator,
      stats,
    });
    expect(report.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(report.insights?.pillars.map((p) => p.name)).toEqual(["Dépenses cachées", "Épargne"]);
    expect(report.notes).toEqual([
      "2 citation(s) proposée(s) par Claude introuvable(s) mot pour mot dans les publications : retirée(s).",
      "Contrôle des preuves : 4 référence(s) à des publications inexistantes et 3 enseignement(s) sans publication réelle à l'appui retirés.",
    ]);
    expect(events.at(-1)).toEqual({ type: "result", report });
    // The analysis prompt is built from the same data and stats.
    expect(fake.calls[0].params.messages[0].content as string).toContain("[p5]");
  });

  it("returns a stats-only report without an Anthropic key", async () => {
    const { report, events } = await run({ fetch: fakeFetch(), client: null }, { request: { ...fixtureCompetitorRequest, focus: undefined } });
    expect(steps(events)).toEqual(["status:fetch", "status:stats", "data", "result"]);
    expect(report.mode).toBe("stats");
    expect(report).not.toHaveProperty("insights");
    expect(report).not.toHaveProperty("model");
    expect(report).not.toHaveProperty("focus");
    expect(report.notes).toEqual([NO_AI_COMPETITOR_NOTE]);
  });

  it("builds the client from ANTHROPIC_API_KEY when none is injected", async () => {
    const { report } = await run({ fetch: fakeFetch() }, { env: {} });
    expect(report.mode).toBe("stats");
  });

  it("never loses the data when Claude fails", async () => {
    const fake = fakeClient([new Anthropic.RateLimitError(429, { type: "error" }, undefined, new Headers())]);
    const { report, events } = await run({ fetch: fakeFetch(), client: fake.client });
    expect(report.mode).toBe("stats");
    expect(report.data).toEqual(fixtureCreator);
    expect(report.notes).toEqual([
      "Analyse par Claude indisponible (Limite de requêtes Claude atteinte : réessayez dans une minute.) : publications et statistiques affichées sans l'analyse qualitative. Relancez l'analyse pour réessayer.",
    ]);
    expect(events.at(-1)?.type).toBe("result");
  });

  it("rejects a handle it cannot read, before any network call", async () => {
    const fetch = fakeFetch();
    const events: CompetitorEvent[] = [];
    await expect(
      runCompetitorAnalysis({ ...fixtureCompetitorRequest, handle: "!!" }, (e) => events.push(e), new AbortController().signal, {}, { fetch }),
    ).rejects.toThrow("Compte TikTok non reconnu : « !! ». Indiquez le pseudo (@pseudo) ou collez le lien du profil.");
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("passes on the fetcher's French error, without any secret", async () => {
    const secret = "apify_api_SECRET_TOKEN_123";
    const error = new SourceError(`Apify a répondu 401 pour https://api.apify.com/v2/acts?token=${secret} (jeton ${secret})`, 401);
    const promise = run({ fetch: fakeFetch(error), client: null }, { env: { APIFY_TOKEN: secret } });
    const message = await promise.catch((e: Error) => e.message);
    expect(message).toMatch(/^Apify a répondu 401/);
    expect(message).not.toContain(secret);
  });

  it("labels unexpected fetch errors", async () => {
    await expect(run({ fetch: fakeFetch(new TypeError("x is undefined")), client: null })).rejects.toThrow(
      "Erreur inattendue pendant la récupération des publications : x is undefined",
    );
  });

  it("says so when the account has no post to analyse", async () => {
    await expect(run({ fetch: fakeFetch({ ...fixtureCreator, posts: [] }), client: null })).rejects.toThrow(
      "Aucune publication récupérée pour @budgetmalin sur TikTok : le compte est peut-être privé, vide ou sans vidéo récente.",
    );
  });

  it("stops when the request is cancelled during the fetch", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<NonNullable<CompetitorDeps["fetch"]>>(
      () =>
        new Promise((resolve) => {
          controller.abort();
          setTimeout(() => resolve(fixtureCreator), 5);
        }),
    );
    const fake = fakeClient([jsonMessage(fixtureCompetitorOutput())]);
    const events: CompetitorEvent[] = [];
    await expect(
      runCompetitorAnalysis(fixtureCompetitorRequest, (e) => events.push(e), controller.signal, {}, { fetch, client: fake.client, now: NOW }),
    ).rejects.toThrow("Analyse annulée.");
    expect(steps(events)).toEqual(["status:fetch"]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("sampleNotes", () => {
  it("flags small samples, engagement ranking and missing followers", () => {
    const posts = fixtureCreator.posts.slice(0, 3).map((post) => ({ ...post, metrics: { likes: post.metrics.likes } }));
    const data: CreatorData = { ...fixtureCreator, account: { ...fixtureCreator.account, followers: undefined }, posts };
    expect(sampleNotes(data, computeCreatorStats(data, PARIS))).toEqual([
      "Seulement 3 publication(s) analysée(s) : les tendances sont à confirmer.",
      "Vues non publiques pour la plupart des publications : classement par score d'engagement (likes + 3 × commentaires + 5 × partages).",
      "Nombre d'abonnés non fourni par la source : portée et multiplicateurs d'audience non calculables.",
    ]);
    expect(sampleNotes(fixtureCreator, computeCreatorStats(fixtureCreator, PARIS))).toEqual([]);
  });

  it("explains the YouTube restriction on derived metrics", () => {
    const youtube: CreatorData = { ...fixtureCreator, ratiosAllowed: false };
    expect(sampleNotes(youtube, computeCreatorStats(youtube, PARIS))).toEqual([
      "Conditions de l'API YouTube : pas de métriques dérivées (taux d'engagement, portée, vues ÷ abonnés) sur la chaîne d'un autre créateur ; seuls les chiffres bruts et les classements sont affichés et analysés.",
    ]);
  });
});
