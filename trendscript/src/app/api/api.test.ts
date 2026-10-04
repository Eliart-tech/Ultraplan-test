import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnthropic } from "@/lib/server/ai/client";
import { generateScript } from "@/lib/server/ai/script";
import { runAnalysis } from "@/lib/server/analyze";
import { SESSION_COOKIE, createSessionToken } from "@/lib/server/auth";
import { runCompetitorAnalysis } from "@/lib/server/competitor";
import { creatorCapabilities } from "@/lib/server/creators";
import { runViralAnalysis, viralCapabilities } from "@/lib/server/viral";
import { readSse } from "@/lib/sse";
import type {
  AnalyzeEvent,
  CompetitorEvent,
  CompetitorReport,
  CreatorPlatformStatus,
  GeneratedScript,
  ScriptEvent,
  ScriptRequest,
  ViralEvent,
  ViralReport,
} from "@/lib/types";
import type { ViralPlatformStatus } from "@/lib/viral/labels";
import { POST as analyzePost } from "./analyze/route";
import { POST as loginPost } from "./auth/login/route";
import { POST as logoutPost } from "./auth/logout/route";
import { POST as competitorPost } from "./competitor/route";
import { POST as scriptPost } from "./script/route";
import { GET as sourcesGet } from "./sources/route";
import { POST as viralPost } from "./viral/route";

vi.mock("@/lib/server/ai/client", () => ({
  getAnthropic: vi.fn(() => null),
  aiModel: vi.fn(() => "claude-test-model"),
  describeAiError: vi.fn(() => "erreur"),
}));
vi.mock("@/lib/server/ai/script", () => ({ generateScript: vi.fn() }));
vi.mock("@/lib/server/analyze", () => ({ runAnalysis: vi.fn() }));
vi.mock("@/lib/server/competitor", () => ({ runCompetitorAnalysis: vi.fn() }));
vi.mock("@/lib/server/creators", () => ({ creatorCapabilities: vi.fn(() => []) }));
vi.mock("@/lib/server/viral", () => ({ viralCapabilities: vi.fn(() => []), runViralAnalysis: vi.fn() }));

const PASSWORD = "un mot de passe de test";
const SECRET = "apify_api_TRESSECRET0123456789";

function post(path: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function events<E>(response: Response): Promise<E[]> {
  const list: E[] = [];
  await readSse<E>(response, (event) => list.push(event));
  return list;
}

const validAnalyze = { geo: "fr", language: "fr", niche: "", keywords: ["#ia"], sources: ["google_trends"], maxTopics: 5 };

const validScript: ScriptRequest = {
  topic: {
    id: "topic-1",
    title: "Sujet",
    summary: "Résumé",
    whyNow: "Maintenant",
    category: "Tech",
    platforms: ["google"],
    signalIds: ["google_trends:1"],
    keywords: ["ia"],
    lifespan: "court",
    saturation: "faible",
    sensitivity: { level: "faible", reason: "" },
    scores: { momentum: 50, reach: 50, crossPlatform: 25, freshness: 80, nicheFit: 0, total: 50 },
    angles: [],
  },
  signals: [
    {
      id: "google_trends:1",
      source: "google_trends",
      platform: "google",
      kind: "search_trend",
      title: "IA",
      metrics: { searchVolume: 20000 },
      tags: [],
      related: [],
      strength: 80,
    },
  ],
  angle: { id: "custom", type: "custom", title: "Mon angle", pitch: "Pitch", hook: "", whyItWorks: "" },
  settings: {
    platform: "instagram_reels",
    durationSec: 30,
    virality: 50,
    pedagogy: 50,
    tone: "expert",
    format: "face_camera",
    hookStyle: "auto",
    cta: "auto",
    language: "fr",
    research: false,
    pace: "normal",
    sponsored: false,
    aiVisuals: false,
    review: false,
  },
  profile: { name: "", niche: "", audience: "", positioning: "", voice: "", avoid: "", defaultCta: "" },
};

const fakeScript = { id: "script-1", title: "Script" } as GeneratedScript;

const validCompetitor = {
  platform: "youtube",
  handle: "https://www.youtube.com/@Squeezie",
  focus: "ses hooks",
  maxPosts: 20,
  profile: validScript.profile,
};

const fakeReport = { id: "report-1", mode: "stats" } as CompetitorReport;

const creators: CreatorPlatformStatus[] = [
  { platform: "instagram", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
  { platform: "tiktok", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
  { platform: "youtube", available: true, via: "flux RSS public (15 dernières vidéos)", note: "" },
  { platform: "linkedin", available: false, via: "Apify", note: "APIFY_TOKEN manquant" },
];

const viral: ViralPlatformStatus[] = [
  { platform: "instagram", available: false, via: "Non configuré", note: "Renseignez APIFY_TOKEN dans Réglages." },
  { platform: "tiktok", available: true, via: "Apify (clockworks/tiktok-scraper)", note: "≈ 0,40 $ par analyse." },
  { platform: "youtube", available: true, via: "YouTube Data API", note: "Ratios vues ÷ abonnés désactivés." },
];

const validViral = { platforms: ["tiktok", "youtube"], keywords: ["#sommeil", "productivité"], profile: validScript.profile };

const fakeViralReport = { id: "viral-1", mode: "stats" } as ViralReport;

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "");
  vi.stubEnv("APIFY_TOKEN", SECRET);
  vi.mocked(getAnthropic).mockReturnValue(null);
  vi.mocked(runAnalysis).mockReset();
  vi.mocked(generateScript).mockReset();
  vi.mocked(runCompetitorAnalysis).mockReset();
  vi.mocked(creatorCapabilities).mockReturnValue(creators);
  vi.mocked(viralCapabilities).mockReturnValue(viral);
  vi.mocked(runViralAnalysis).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth on every route", () => {
  beforeEach(() => vi.stubEnv("APP_PASSWORD", PASSWORD));

  it("rejects API calls without a session, even if the proxy is bypassed", async () => {
    expect((await sourcesGet(new Request("http://localhost/api/sources"))).status).toBe(401);
    expect((await analyzePost(post("/api/analyze", validAnalyze))).status).toBe(401);
    expect((await scriptPost(post("/api/script", validScript))).status).toBe(401);
    expect((await competitorPost(post("/api/competitor", validCompetitor))).status).toBe(401);
    expect((await viralPost(post("/api/viral", validViral))).status).toBe(401);
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(runViralAnalysis).not.toHaveBeenCalled();
    expect(runCompetitorAnalysis).not.toHaveBeenCalled();
  });

  it("logs in with the right password and sets a hardened cookie", async () => {
    const response = await loginPost(post("/api/auth/login", { password: PASSWORD }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=\\d+\\.[\\w-]{43};`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);

    const value = cookie.split(";")[0].split("=")[1];
    const sources = await sourcesGet(
      new Request("http://localhost/api/sources", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
    );
    expect(sources.status).toBe(200);
  });

  it("refuses a wrong password after a short delay", async () => {
    const started = Date.now();
    const response = await loginPost(post("/api/auth/login", { password: "mauvais" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await response.json()).error).toBe("Mot de passe incorrect.");
    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  });

  it("validates the login body", async () => {
    expect((await loginPost(post("/api/auth/login", "pas du json"))).status).toBe(400);
    expect((await loginPost(post("/api/auth/login", { password: "" }))).status).toBe(400);
  });

  it("logs out by expiring the cookie", async () => {
    const response = await logoutPost();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });
});

describe("GET /api/sources", () => {
  it("reports configuration without leaking any secret", async () => {
    const response = await sourcesGet(new Request("http://localhost/api/sources"));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    const body = JSON.parse(text);
    expect(body.sources).toHaveLength(11);
    expect(body.sources.find((s: { id: string }) => s.id === "tiktok_apify").configured).toBe(true);
    expect(body.sources.find((s: { id: string }) => s.id === "youtube").configured).toBe(Boolean(process.env.YOUTUBE_API_KEY));
    expect(body.ai).toEqual({ configured: false, model: "claude-test-model" });
    expect(body.auth).toEqual({ enabled: false });
    expect(body.creators).toEqual(creators);
    expect(vi.mocked(creatorCapabilities).mock.calls[0][0]).toBe(process.env);
    expect(body.viral).toEqual(viral);
    expect(vi.mocked(viralCapabilities).mock.calls[0][0]).toBe(process.env);
  });

  it("works with a session when the gate is on", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const { value } = await createSessionToken({ APP_PASSWORD: PASSWORD });
    const response = await sourcesGet(
      new Request("http://localhost/api/sources", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
    );
    expect((await response.json()).auth).toEqual({ enabled: true });
  });
});

describe("POST /api/analyze", () => {
  it("rejects invalid input with a French 400 before streaming", async () => {
    const bad = await analyzePost(post("/api/analyze", { ...validAnalyze, sources: [] }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/Choisissez au moins une source/);
    expect((await analyzePost(post("/api/analyze", "{"))).status).toBe(400);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const huge = await analyzePost(post("/api/analyze", { ...validAnalyze, niche: "x".repeat(60_000) }));
    expect(huge.status).toBe(413);
  });

  it("streams the events emitted by runAnalysis with the parsed request", async () => {
    vi.mocked(runAnalysis).mockImplementation(async (request, send) => {
      send({ type: "source_start", source: "google_trends" });
      send({ type: "synthesis_start", signalCount: 0, mode: "basic" });
      return {} as never;
    });
    const response = await analyzePost(post("/api/analyze", validAnalyze));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const list = await events<AnalyzeEvent>(response);
    expect(list.map((e) => e.type)).toEqual(["source_start", "synthesis_start"]);
    const request = vi.mocked(runAnalysis).mock.calls[0][0];
    expect(request).toMatchObject({ geo: "FR", keywords: ["ia"], maxTopics: 5 });
  });

  it("turns a crash into an SSE error event", async () => {
    vi.mocked(runAnalysis).mockRejectedValue(new Error("Panne inattendue"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await events<AnalyzeEvent>(await analyzePost(post("/api/analyze", validAnalyze)));
    expect(list).toEqual([{ type: "error", message: "Panne inattendue" }]);
  });
});

describe("POST /api/script", () => {
  it("answers 503 naming ANTHROPIC_API_KEY when Claude isn't configured", async () => {
    const response = await scriptPost(post("/api/script", validScript));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("ANTHROPIC_API_KEY");
    expect(generateScript).not.toHaveBeenCalled();
  });

  it("validates the body once Claude is configured", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);
    const response = await scriptPost(
      post("/api/script", { ...validScript, settings: { ...validScript.settings, durationSec: 42 } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/settings\.durationSec/);
  });

  it("sends exactly one result, whether or not the generator emits it", async () => {
    vi.mocked(getAnthropic).mockReturnValue({} as ReturnType<typeof getAnthropic>);

    vi.mocked(generateScript).mockImplementation(async (_request, send) => {
      send({ type: "status", step: "writing", message: "Écriture…" });
      return fakeScript;
    });
    let list = await events<ScriptEvent>(await scriptPost(post("/api/script", validScript)));
    expect(list.map((e) => e.type)).toEqual(["status", "result"]);
    expect(list[1]).toEqual({ type: "result", script: fakeScript });

    vi.mocked(generateScript).mockImplementation(async (_request, send) => {
      send({ type: "result", script: fakeScript });
      return fakeScript;
    });
    list = await events<ScriptEvent>(await scriptPost(post("/api/script", validScript)));
    expect(list.map((e) => e.type)).toEqual(["result"]);
  });
});

describe("POST /api/competitor", () => {
  it("rejects invalid input with a French 400 before streaming", async () => {
    const bad = await competitorPost(post("/api/competitor", { ...validCompetitor, handle: "x" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/pseudo du créateur/);
    const platform = await competitorPost(post("/api/competitor", { ...validCompetitor, platform: "snapchat" }));
    expect(platform.status).toBe(400);
    const posts = await competitorPost(post("/api/competitor", { ...validCompetitor, maxPosts: 80 }));
    expect(posts.status).toBe(400);
    expect((await competitorPost(post("/api/competitor", "{"))).status).toBe(400);
    expect(runCompetitorAnalysis).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const huge = await competitorPost(post("/api/competitor", { ...validCompetitor, focus: "x".repeat(60_000) }));
    expect(huge.status).toBe(413);
  });

  it("works without Claude (stats mode) and applies the schema defaults", async () => {
    vi.mocked(runCompetitorAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "status", step: "fetch", message: "Récupération des publications…" });
      send({ type: "status", step: "stats", message: "Calcul des statistiques…" });
      return fakeReport;
    });
    const response = await competitorPost(post("/api/competitor", validCompetitor));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const list = await events<CompetitorEvent>(response);
    expect(list.map((e) => e.type)).toEqual(["status", "status", "result"]);
    expect(list[2]).toEqual({ type: "result", report: fakeReport });
    const [request, , signal] = vi.mocked(runCompetitorAnalysis).mock.calls[0];
    expect(request).toMatchObject({ platform: "youtube", maxPosts: 20, language: "fr", geo: "FR", focus: "ses hooks" });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("sends exactly one result when the analysis emits it itself", async () => {
    vi.mocked(runCompetitorAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "result", report: fakeReport });
      return fakeReport;
    });
    const list = await events<CompetitorEvent>(await competitorPost(post("/api/competitor", validCompetitor)));
    expect(list.map((e) => e.type)).toEqual(["result"]);
  });

  it("turns a failure (unknown handle, missing key…) into an SSE error event", async () => {
    vi.mocked(runCompetitorAnalysis).mockRejectedValue(new Error("Compte TikTok introuvable : vérifiez le pseudo."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await events<CompetitorEvent>(await competitorPost(post("/api/competitor", validCompetitor)));
    expect(list).toEqual([{ type: "error", message: "Compte TikTok introuvable : vérifiez le pseudo." }]);
  });
});

describe("POST /api/viral", () => {
  it("rejects invalid input with a French 400 before streaming", async () => {
    const none = await viralPost(post("/api/viral", { ...validViral, keywords: [] }));
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/au moins un mot-clé/);
    const tooMany = await viralPost(post("/api/viral", { ...validViral, keywords: ["a1", "b2", "c3", "d4", "e5", "f6"] }));
    expect(tooMany.status).toBe(400);
    const platform = await viralPost(post("/api/viral", { ...validViral, platforms: ["linkedin"] }));
    expect(platform.status).toBe(400);
    const period = await viralPost(post("/api/viral", { ...validViral, periodDays: 14 }));
    expect(period.status).toBe(400);
    expect((await viralPost(post("/api/viral", "{"))).status).toBe(400);
    expect(runViralAnalysis).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const huge = await viralPost(post("/api/viral", { ...validViral, niche: "x".repeat(60_000) }));
    expect(huge.status).toBe(413);
  });

  it("streams the run (without Claude) with the parsed request and the schema defaults", async () => {
    vi.mocked(runViralAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "status", step: "collect", message: "Recherche des vidéos…" });
      send({ type: "platform_start", platform: "tiktok" });
      return fakeViralReport;
    });
    const response = await viralPost(post("/api/viral", validViral));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const list = await events<ViralEvent>(response);
    expect(list.map((e) => e.type)).toEqual(["status", "platform_start", "result"]);
    expect(list[2]).toEqual({ type: "result", report: fakeViralReport });
    const [request, , signal] = vi.mocked(runViralAnalysis).mock.calls[0];
    expect(request).toMatchObject({
      platforms: ["tiktok", "youtube"],
      keywords: ["sommeil", "productivité"],
      niche: "",
      periodDays: 30,
      geo: "FR",
      language: "fr",
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("sends exactly one result when the run emits it itself", async () => {
    vi.mocked(runViralAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "result", report: fakeViralReport });
      return fakeViralReport;
    });
    const list = await events<ViralEvent>(await viralPost(post("/api/viral", validViral)));
    expect(list.map((e) => e.type)).toEqual(["result"]);
  });

  it("turns a failure into an SSE error event", async () => {
    vi.mocked(runViralAnalysis).mockRejectedValue(new Error("Aucune vidéo récupérée pour ces mots-clés."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await events<ViralEvent>(await viralPost(post("/api/viral", validViral)));
    expect(list).toEqual([{ type: "error", message: "Aucune vidéo récupérée pour ces mots-clés." }]);
  });
});
