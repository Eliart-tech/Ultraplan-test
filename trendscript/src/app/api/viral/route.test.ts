import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runViralAnalysis } from "@/lib/server/viral";
import { readSse } from "@/lib/sse";
import type { ViralEvent, ViralReport } from "@/lib/types";
import { POST } from "./route";

vi.mock("@/lib/server/viral", () => ({ runViralAnalysis: vi.fn() }));

const profile = { name: "", niche: "sommeil", audience: "", positioning: "", voice: "", avoid: "", defaultCta: "" };
const valid = { platforms: ["tiktok", "youtube"], keywords: ["#sommeil", "productivité"], niche: "sommeil", profile };

const report: ViralReport = {
  id: "r1",
  createdAt: "2026-10-04T10:00:00.000Z",
  request: { ...valid, keywords: ["sommeil", "productivité"], platforms: ["tiktok", "youtube"], periodDays: 30, geo: "FR", language: "fr" },
  mode: "stats",
  posts: [],
  platforms: [],
  notes: [],
};

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/viral", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function events(response: Response): Promise<ViralEvent[]> {
  const list: ViralEvent[] = [];
  await readSse<ViralEvent>(response, (event) => list.push(event));
  return list;
}

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "");
  vi.mocked(runViralAnalysis).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/viral", () => {
  it("requires a session when the password gate is on", async () => {
    vi.stubEnv("APP_PASSWORD", "un mot de passe de test");
    expect((await POST(post(valid))).status).toBe(401);
    expect(runViralAnalysis).not.toHaveBeenCalled();
  });

  it("rejects invalid input with a French 400 before streaming", async () => {
    const none = await POST(post({ ...valid, platforms: [] }));
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/au moins une plateforme/);
    const noKeyword = await POST(post({ ...valid, keywords: [] }));
    expect((await noKeyword.json()).error).toMatch(/au moins un mot-clé/);
    expect((await POST(post({ ...valid, keywords: ["a1", "b2", "c3", "d4", "e5", "f6"] }))).status).toBe(400);
    expect((await POST(post({ ...valid, platforms: ["linkedin"] }))).status).toBe(400);
    expect((await POST(post({ ...valid, periodDays: 14 }))).status).toBe(400);
    expect((await POST(post("{"))).status).toBe(400);
    expect(runViralAnalysis).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    expect((await POST(post({ ...valid, niche: "x".repeat(60_000) }))).status).toBe(413);
  });

  it("streams the analysis and applies the schema defaults", async () => {
    vi.mocked(runViralAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "platform_start", platform: "tiktok" });
      send({ type: "status", step: "enrich", message: "Récupération des abonnés des auteurs…" });
      return report;
    });
    const response = await POST(post(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const list = await events(response);
    expect(list.map((event) => event.type)).toEqual(["platform_start", "status", "result"]);
    expect(list[2]).toEqual({ type: "result", report });
    const [request, , signal] = vi.mocked(runViralAnalysis).mock.calls[0];
    expect(request).toEqual({ ...valid, keywords: ["sommeil", "productivité"], periodDays: 30, geo: "FR", language: "fr" });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("sends exactly one result when the analysis emits it itself", async () => {
    vi.mocked(runViralAnalysis).mockImplementation(async (_request, send) => {
      send({ type: "result", report });
      return report;
    });
    expect((await events(await POST(post(valid)))).map((event) => event.type)).toEqual(["result"]);
  });

  it("turns a failure into an SSE error event", async () => {
    vi.mocked(runViralAnalysis).mockRejectedValue(new Error("Aucune vidéo récupérée pour ces mots-clés."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await events(await POST(post(valid)))).toEqual([{ type: "error", message: "Aucune vidéo récupérée pour ces mots-clés." }]);
  });
});
