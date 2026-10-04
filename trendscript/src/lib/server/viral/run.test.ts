import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViralEvent, ViralPlatform } from "../../types";
import { fixtureViralInputs, fixtureViralRequest, NOW, viralInput } from "../../viral/__fixtures__/viral";
import { VIRAL_THRESHOLDS_NOTE } from "../../viral/labels";
import type { ViralPostInput } from "../../viral/score";
import { fakeClient, jsonMessage } from "../ai/__fixtures__/anthropic";
import { fixtureViralOutput } from "../ai/__fixtures__/viral";
import { SourceError } from "../http";
import { viralCapabilities } from "./capabilities";
import type { PlatformCollection } from "./collect";
import { NO_AI_VIRAL_NOTE, runViralAnalysis, sampleNotes, selectReportPosts, type ViralDeps } from "./run";

const ENV = { APIFY_TOKEN: "apify_api_SECRET0123456789", YOUTUBE_API_KEY: "AIzaSECRETKEY0123456789" };

const SOURCES: Record<ViralPlatform, string> = {
  instagram: "Apify · Instagram Hashtag Scraper (reels)",
  tiktok: "Apify · TikTok Scraper (recherche de vidéos)",
  youtube: "YouTube Data API (recherche + statistiques)",
};

/** Collected videos as the real collectors return them: no follower known yet on Instagram and YouTube. */
function collected(platform: ViralPlatform): ViralPostInput[] {
  return fixtureViralInputs
    .filter((post) => post.platform === platform)
    .map((post) => (platform === "tiktok" ? post : { ...post, author: { handle: post.author.handle, url: post.author.url } }));
}

function fakeCollect(failures: Partial<Record<ViralPlatform, Error>> = {}) {
  return vi.fn<NonNullable<ViralDeps["collect"]>>(async (platform, ctx) => {
    const failure = failures[platform];
    if (failure) throw failure;
    const ratiosAllowed = platform !== "youtube" || ctx.env.YT_DERIVED_METRICS_APPROVED === "true";
    const collection: PlatformCollection = {
      platform,
      posts: collected(platform),
      source: SOURCES[platform],
      warnings: platform === "tiktok" ? ["Abonnés arrondis par TikTok."] : [],
      ratiosAllowed,
    };
    return structuredClone(collection);
  });
}

/** Restores the fixture's followers, as the real enrichment would read them. */
const fakeEnrich = vi.fn<NonNullable<ViralDeps["enrich"]>>(async (posts) => {
  const truth = new Map(fixtureViralInputs.map((post) => [post.id, post.author]));
  return {
    posts: posts.map((post) => ({ ...post, author: truth.get(post.id) ?? post.author })),
    notes: { instagram: ["Abonnés lus pour 3 des 4 auteurs."] },
  };
});

async function run(deps: ViralDeps = {}, { env = ENV as Record<string, string>, signal = new AbortController().signal, request = fixtureViralRequest } = {}) {
  const events: ViralEvent[] = [];
  const report = await runViralAnalysis(request, (event) => events.push(event), signal, env, {
    collect: fakeCollect(),
    enrich: fakeEnrich,
    client: null,
    now: NOW,
    ...deps,
  });
  return { report, events };
}

const steps = (events: ViralEvent[]) =>
  events
    .map((e) => (e.type === "status" ? `status:${e.step}` : e.type === "platform_start" ? `start:${e.platform}` : e.type === "platform_done" ? `done:${e.summary.platform}` : e.type))
    .filter((step, i, all) => step !== "progress" || all[i - 1] !== "progress");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fakeEnrich.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runViralAnalysis", () => {
  it("collects every platform, reads the followers, scores in code, asks Claude and streams every step", async () => {
    const fake = fakeClient([jsonMessage(fixtureViralOutput())]);
    const collect = fakeCollect();
    const { report, events } = await run({ collect, client: fake.client });

    expect(steps(events)).toEqual([
      "status:collect",
      "start:instagram",
      "start:tiktok",
      "start:youtube",
      "done:instagram",
      "done:tiktok",
      "done:youtube",
      "status:enrich",
      "status:analysis",
      "progress",
      "result",
    ]);
    expect(events[0]).toEqual({ type: "status", step: "collect", message: "Recherche des vidéos de ta niche sur Instagram, TikTok, YouTube…" });
    expect(events.find((e) => e.type === "status" && e.step === "enrich")).toMatchObject({ message: "Récupération des abonnés des auteurs…" });

    expect(collect).toHaveBeenCalledWith("tiktok", expect.objectContaining({ keywords: ["sommeil", "productivité"], periodDays: 30, geo: "FR", language: "fr", now: NOW }));
    expect(fakeEnrich).toHaveBeenCalledTimes(1);

    expect(report).toMatchObject({ createdAt: new Date(NOW).toISOString(), request: fixtureViralRequest, mode: "ai", model: "claude-opus-5-5" });
    expect(report.id).toMatch(/^[0-9a-f-]{36}$/);
    // Scored after enrichment: Instagram reels are measured, YouTube stays raw.
    expect(report.posts.slice(0, 3).map((post) => [post.id, post.tier, post.multiplier])).toEqual([
      ["tiktok:tt1", "explose", 180],
      ["instagram:IG1abc", "explose", 25],
      ["tiktok:tt2", "cartonne", 4],
    ]);
    expect(report.posts.find((post) => post.platform === "youtube")).not.toHaveProperty("multiplier");
    expect(report.patterns?.recipes.map((recipe) => recipe.name)).toEqual(["Liste d'erreurs + promesse pour ce soir"]);
    expect(report.notes).toEqual([
      VIRAL_THRESHOLDS_NOTE,
      "Multiplicateur d'audience calculable pour seulement 7 vidéo(s) sur 12 (abonnés de l'auteur inconnus pour les autres) : tendances à confirmer.",
      "2 citation(s) proposée(s) par Claude introuvable(s) mot pour mot dans les vidéos : retirée(s).",
      "Contrôle des preuves : 4 référence(s) à des vidéos inexistantes et 3 enseignement(s) sans vidéo réelle à l'appui retirés.",
    ]);
    expect(events.at(-1)).toEqual({ type: "result", report });
  });

  it("summarises each platform after enrichment, with the collectors' and enrichment's notes", async () => {
    const { report, events } = await run();
    expect(report.platforms).toEqual([
      {
        platform: "instagram",
        count: 4,
        withFollowers: 3,
        medianViews: 172_500,
        medianMultiplier: 3.33,
        ratiosAllowed: true,
        source: SOURCES.instagram,
        warning: "Abonnés lus pour 3 des 4 auteurs.",
      },
      {
        platform: "tiktok",
        count: 5,
        withFollowers: 4,
        medianViews: 200_000,
        medianMultiplier: 2.63,
        ratiosAllowed: true,
        source: SOURCES.tiktok,
        warning: "Abonnés arrondis par TikTok.",
      },
      { platform: "youtube", count: 3, withFollowers: 3, medianViews: 150_000, ratiosAllowed: false, source: SOURCES.youtube },
    ]);
    // platform_done is sent at collection time (before the followers are read).
    const instagramDone = events.find((e) => e.type === "platform_done" && e.summary.platform === "instagram");
    expect(instagramDone).toMatchObject({ summary: { count: 4, withFollowers: 0 } });
  });

  it("returns real data in stats mode without an Anthropic key", async () => {
    const { report, events } = await run({ client: null });
    expect(report.mode).toBe("stats");
    expect(report).not.toHaveProperty("patterns");
    expect(report).not.toHaveProperty("model");
    expect(report.notes.at(-1)).toBe(NO_AI_VIRAL_NOTE);
    expect(report.posts).toHaveLength(12);
    expect(steps(events)).not.toContain("status:analysis");
  });

  it("keeps the data when Claude fails, with a French note", async () => {
    const { report } = await run({ client: fakeClient([new Error("boom")]).client });
    expect(report.mode).toBe("stats");
    expect(report.notes.at(-1)).toBe(
      "Analyse par Claude indisponible (boom) : vidéos et mesures affichées sans les recettes. Relancez l'analyse pour réessayer.",
    );
  });

  it("reports an unconfigured platform with its setup note, never with invented videos", async () => {
    const collect = fakeCollect();
    const { report, events } = await run({ collect }, { env: { APIFY_TOKEN: "apify_api_x" } });
    expect(collect).not.toHaveBeenCalledWith("youtube", expect.anything());
    const youtube = report.platforms.find((summary) => summary.platform === "youtube");
    expect(youtube).toEqual({
      platform: "youtube",
      count: 0,
      withFollowers: 0,
      ratiosAllowed: false,
      source: "Non configuré",
      warning: viralCapabilities({}).find((status) => status.platform === "youtube")?.note,
    });
    expect(youtube?.warning).toMatch(/YOUTUBE_API_KEY/);
    expect(events.filter((e) => e.type === "platform_done")).toHaveLength(3);
    expect(report.posts.some((post) => post.platform === "youtube")).toBe(false);
  });

  it("turns a platform failure into a redacted error summary and goes on with the others", async () => {
    const collect = fakeCollect({ tiktok: new SourceError(`Apify a refusé le jeton ${ENV.APIFY_TOKEN}`) });
    const { report } = await run({ collect });
    expect(report.platforms.find((summary) => summary.platform === "tiktok")).toEqual({
      platform: "tiktok",
      count: 0,
      withFollowers: 0,
      ratiosAllowed: true,
      source: "Apify (clockworks/tiktok-scraper)",
      error: "Apify a refusé le jeton ***",
    });
    expect(report.posts.some((post) => post.platform === "tiktok")).toBe(false);
    expect(report.posts.length).toBeGreaterThan(0);
  });

  it("fails with every platform's reason when nothing could be collected", async () => {
    const collect = fakeCollect({ tiktok: new SourceError("Crédit Apify épuisé."), instagram: new SourceError("Crédit Apify épuisé.") });
    await expect(run({ collect }, { env: { APIFY_TOKEN: "x" } })).rejects.toThrow(
      "Aucune vidéo récupérée pour ces mots-clés. Instagram : Crédit Apify épuisé. ; TikTok : Crédit Apify épuisé. ; YouTube : Renseignez YOUTUBE_API_KEY",
    );
  });

  it("does not ask Claude about fewer than 5 videos", async () => {
    const collect = vi.fn<NonNullable<ViralDeps["collect"]>>(async (platform) => ({
      platform,
      posts: platform === "tiktok" ? collected("tiktok").slice(0, 3) : [],
      source: SOURCES[platform],
      warnings: [],
      ratiosAllowed: platform !== "youtube",
    }));
    const fake = fakeClient([]);
    const { report } = await run({ collect, client: fake.client });
    expect(fake.calls).toHaveLength(0);
    expect(report.mode).toBe("stats");
    expect(report.notes.at(-1)).toMatch(/^Seulement 3 vidéo\(s\) récupérée\(s\)/);
  });

  it("keeps the data when reading the followers fails", async () => {
    const enrich = vi.fn<NonNullable<ViralDeps["enrich"]>>(async () => {
      throw new Error(`réseau ${ENV.YOUTUBE_API_KEY}`);
    });
    const { report } = await run({ enrich });
    expect(report.platforms.find((summary) => summary.platform === "instagram")?.warning).toBe("Abonnés des auteurs indisponibles (réseau ***).");
    expect(report.posts.filter((post) => post.platform === "instagram").every((post) => post.multiplier === undefined)).toBe(true);
  });

  it("stops at once when the request is cancelled", async () => {
    const controller = new AbortController();
    const collect = vi.fn<NonNullable<ViralDeps["collect"]>>(() => new Promise(() => undefined));
    const pending = runViralAnalysis(fixtureViralRequest, () => undefined, controller.signal, ENV, { collect, client: null, now: NOW });
    controller.abort();
    await expect(pending).rejects.toThrow("Analyse annulée.");
    const aborted = new AbortController();
    aborted.abort();
    await expect(runViralAnalysis(fixtureViralRequest, () => undefined, aborted.signal, ENV, { collect, now: NOW })).rejects.toThrow("Analyse annulée.");
  });

  it("only runs the requested platforms, in a fixed order", async () => {
    const collect = fakeCollect();
    const { report } = await run({ collect }, { request: { ...fixtureViralRequest, platforms: ["youtube", "tiktok"] } });
    expect(report.platforms.map((summary) => summary.platform)).toEqual(["tiktok", "youtube"]);
    expect(collect).not.toHaveBeenCalledWith("instagram", expect.anything());
  });
});

describe("selectReportPosts", () => {
  it("keeps the best videos plus every video Claude cited", () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({ ...viralInput("tiktok", `p${i}`, { title: `${i}`, handle: "a" }), tier: "normal" as const }));
    expect(selectReportPosts(posts, ["tiktok:p4"], 2).map((post) => post.id)).toEqual(["tiktok:p0", "tiktok:p1", "tiktok:p4"]);
  });
});

describe("sampleNotes", () => {
  it("always states that the thresholds are provisional", () => {
    expect(sampleNotes([])[0]).toBe(VIRAL_THRESHOLDS_NOTE);
  });
});

describe("viralCapabilities", () => {
  it("lists the 3 platforms with honest French notes and no secret", () => {
    const none = viralCapabilities({});
    expect(none.map((status) => [status.platform, status.available, status.via])).toEqual([
      ["instagram", false, "Non configuré"],
      ["tiktok", false, "Non configuré"],
      ["youtube", false, "Non configuré"],
    ]);
    expect(none[0].note).toMatch(/APIFY_TOKEN/);

    const metaOnly = viralCapabilities({ INSTAGRAM_ACCESS_TOKEN: "EAA", INSTAGRAM_USER_ID: "1" });
    expect(metaOnly[0]).toMatchObject({ available: false });
    expect(metaOnly[0].note).toContain("la recherche par hashtag de l'API Meta ne donne ni les vues ni l'auteur");

    const all = viralCapabilities({ ...ENV, INSTAGRAM_ACCESS_TOKEN: "EAAsecret", INSTAGRAM_USER_ID: "1784", APIFY_TIKTOK_ACTOR: "clockworks~free-tiktok-scraper" });
    expect(all.every((status) => status.available)).toBe(true);
    expect(all[0].via).toBe("Apify (Instagram Hashtag Scraper) + abonnés via l'API Meta, repli Apify");
    expect(all[1].via).toBe("Apify (clockworks/free-tiktok-scraper)");
    expect(all[2].note).toContain("Ratios vues ÷ abonnés désactivés");
    expect(JSON.stringify(all)).not.toMatch(/SECRET|EAAsecret/);

    const approved = viralCapabilities({ YOUTUBE_API_KEY: "k", YT_DERIVED_METRICS_APPROVED: "true" });
    expect(approved[2].note).toContain("Ratios vues ÷ abonnés activés");
  });
});
