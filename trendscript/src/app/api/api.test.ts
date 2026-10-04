import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnthropic } from "@/lib/server/ai/client";
import { generateScript } from "@/lib/server/ai/script";
import { runAnalysis } from "@/lib/server/analyze";
import { SESSION_COOKIE, createSessionToken } from "@/lib/server/auth";
import { readSse } from "@/lib/sse";
import type { AnalyzeEvent, GeneratedScript, ScriptEvent, ScriptRequest } from "@/lib/types";
import { POST as analyzePost } from "./analyze/route";
import { POST as loginPost } from "./auth/login/route";
import { POST as logoutPost } from "./auth/logout/route";
import { POST as scriptPost } from "./script/route";
import { GET as sourcesGet } from "./sources/route";

vi.mock("@/lib/server/ai/client", () => ({
  getAnthropic: vi.fn(() => null),
  aiModel: vi.fn(() => "claude-test-model"),
  describeAiError: vi.fn(() => "erreur"),
}));
vi.mock("@/lib/server/ai/script", () => ({ generateScript: vi.fn() }));
vi.mock("@/lib/server/analyze", () => ({ runAnalysis: vi.fn() }));

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

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "");
  vi.stubEnv("APIFY_TOKEN", SECRET);
  vi.mocked(getAnthropic).mockReturnValue(null);
  vi.mocked(runAnalysis).mockReset();
  vi.mocked(generateScript).mockReset();
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
    expect(runAnalysis).not.toHaveBeenCalled();
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
