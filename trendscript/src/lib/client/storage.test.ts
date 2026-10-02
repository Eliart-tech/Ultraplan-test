import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDraft, fixtureSettings, fixtureSignals, fixtureTopic } from "@/lib/script/__fixtures__/script";
import type { Analysis, GeneratedScript } from "@/lib/types";

/** In-memory Storage with an optional byte quota (UTF-16 length of all values). */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    const others = [...this.data.entries()].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0);
    if (others + value.length > this.quota) throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.data.set(key, String(value));
  }
}

let local: MemoryStorage;
let session: MemoryStorage;
type StorageModule = typeof import("./storage");
let storage: StorageModule;

async function setup(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()) {
  local = localStorage;
  session = sessionStorage;
  vi.stubGlobal("window", {
    localStorage: local,
    sessionStorage: session,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  // Fresh module: its per-key caches start empty.
  vi.resetModules();
  storage = await import("./storage");
}

beforeEach(async () => {
  await setup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function script(id: string): GeneratedScript {
  return {
    ...fixtureDraft(),
    id,
    createdAt: "2026-10-02T12:00:00Z",
    model: "claude-opus-5-5",
    wordCount: 101,
    wordBudget: 101,
    estimatedDurationSec: 40,
    warnings: [],
  };
}

function savedScript(id: string) {
  return {
    id,
    savedAt: "2026-10-02T12:00:00Z",
    script: script(id),
    topic: fixtureTopic,
    angle: fixtureTopic.angles[0],
    settings: fixtureSettings,
    signals: fixtureSignals,
    geo: "FR",
  };
}

function analysis(id: string, extraSignals = 0): Analysis {
  const extra = Array.from({ length: extraSignals }, (_, i) => ({ ...fixtureSignals[0], id: `extra:${i}` }));
  return {
    id,
    createdAt: "2026-10-02T12:00:00Z",
    request: { geo: "FR", language: "fr", niche: "", keywords: [], sources: ["google_trends"], maxTopics: 8 },
    mode: "basic",
    sources: [],
    signals: [...fixtureSignals, ...extra],
    topics: [fixtureTopic],
    notes: [],
  };
}

describe("profile", () => {
  it("returns the empty profile when nothing is stored", () => {
    expect(storage.getProfile()).toEqual(storage.EMPTY_PROFILE);
  });

  it("saves under the versioned key and reads back", () => {
    const profile = { ...storage.EMPTY_PROFILE, name: "Léa", niche: "sommeil" };
    expect(storage.saveProfile(profile)).toBe(true);
    expect(JSON.parse(local.getItem("trendscript:profile:v1")!)).toEqual(profile);
    expect(storage.getProfile()).toEqual(profile);
  });

  it("sanitizes corrupted data instead of throwing", async () => {
    const corrupted = new MemoryStorage();
    corrupted.setItem("trendscript:profile:v1", JSON.stringify({ name: 42, niche: "tech", extra: "x" }));
    await setup(corrupted);
    expect(storage.getProfile()).toEqual({ ...storage.EMPTY_PROFILE, niche: "tech" });

    const garbage = new MemoryStorage();
    garbage.setItem("trendscript:profile:v1", "{not json");
    await setup(garbage);
    expect(storage.getProfile()).toEqual(storage.EMPTY_PROFILE);
  });

  it("returns a cached object until the next write", () => {
    const first = storage.getProfile();
    expect(storage.getProfile()).toBe(first);
    storage.saveProfile({ ...first, name: "Léa" });
    expect(storage.getProfile()).not.toBe(first);
  });

  it("reports whether a profile is filled", () => {
    expect(storage.isProfileFilled(storage.EMPTY_PROFILE)).toBe(false);
    expect(storage.isProfileFilled({ ...storage.EMPTY_PROFILE, voice: "tutoiement" })).toBe(true);
  });
});

describe("history", () => {
  it("adds scripts newest first and replaces by id", () => {
    storage.saveScriptToHistory(savedScript("a"));
    storage.saveScriptToHistory(savedScript("b"));
    storage.saveScriptToHistory({ ...savedScript("a"), savedAt: "2026-10-03T00:00:00Z" });
    const { scripts } = storage.getHistory();
    expect(scripts.map((s) => s.id)).toEqual(["a", "b"]);
    expect(scripts[0].savedAt).toBe("2026-10-03T00:00:00Z");
  });

  it("caps scripts at 50 and analyses at 10", () => {
    for (let i = 0; i < 55; i++) storage.saveScriptToHistory(savedScript(`s${i}`));
    for (let i = 0; i < 12; i++) storage.saveAnalysisToHistory(analysis(`a${i}`));
    const history = storage.getHistory();
    expect(history.scripts).toHaveLength(storage.MAX_SAVED_SCRIPTS);
    expect(history.scripts[0].id).toBe("s54");
    expect(history.analyses).toHaveLength(storage.MAX_SAVED_ANALYSES);
    expect(history.analyses[0].id).toBe("a11");
  });

  it("stores analyses with only the signals referenced by topics", () => {
    storage.saveAnalysisToHistory(analysis("x", 20));
    const saved = storage.getHistory().analyses[0];
    expect(saved.signals.map((s) => s.id)).toEqual(fixtureSignals.map((s) => s.id));
    expect(storage.trimAnalysis(analysis("y", 5)).signals).toHaveLength(fixtureSignals.length);
  });

  it("removes entries and clears everything", () => {
    storage.saveScriptToHistory(savedScript("a"));
    storage.saveScriptToHistory(savedScript("b"));
    storage.saveAnalysisToHistory(analysis("x"));
    storage.removeScriptFromHistory("a");
    storage.removeAnalysisFromHistory("x");
    expect(storage.getHistory().scripts.map((s) => s.id)).toEqual(["b"]);
    expect(storage.getHistory().analyses).toEqual([]);
    storage.clearHistory();
    expect(local.getItem("trendscript:history:v1")).toBeNull();
    expect(storage.getHistory()).toEqual({ scripts: [], analyses: [] });
  });

  it("drops malformed entries when reading", async () => {
    const dirty = new MemoryStorage();
    dirty.setItem(
      "trendscript:history:v1",
      JSON.stringify({ scripts: [savedScript("ok"), { id: "broken" }, null], analyses: [analysis("x"), "nope"] }),
    );
    await setup(dirty);
    const history = storage.getHistory();
    expect(history.scripts.map((s) => s.id)).toEqual(["ok"]);
    expect(history.analyses.map((a) => a.id)).toEqual(["x"]);
  });

  it("evicts the oldest analyses, then scripts, when the quota is exceeded", async () => {
    const entrySize = JSON.stringify(savedScript("x")).length;
    const analysisSize = JSON.stringify(storage.trimAnalysis(analysis("x"))).length;
    // Room for 3 scripts and 1 analysis, not more.
    await setup(new MemoryStorage(3 * entrySize + analysisSize + 500));
    storage.saveAnalysisToHistory(analysis("old"));
    storage.saveScriptToHistory(savedScript("s1"));
    storage.saveScriptToHistory(savedScript("s2"));
    storage.saveScriptToHistory(savedScript("s3"));
    const result = storage.saveScriptToHistory(savedScript("s4"));
    expect(result.ok).toBe(true);
    expect(result.evicted).toBeGreaterThanOrEqual(1);
    const history = storage.getHistory();
    expect(history.scripts[0].id).toBe("s4");
    expect(history.analyses).toEqual([]);
  });

  it("exports the history as JSON", () => {
    storage.saveScriptToHistory(savedScript("a"));
    const exported = JSON.parse(storage.exportHistoryJson());
    expect(exported.app).toBe("TrendScript");
    expect(exported.scripts[0].id).toBe("a");
  });
});

describe("studio draft (sessionStorage)", () => {
  it("round-trips through sessionStorage with an envelope", () => {
    expect(storage.loadStudioDraft()).toBeNull();
    expect(storage.saveStudioDraft({ step: "topics" })).toBe(true);
    expect(JSON.parse(session.getItem("trendscript:studio:v1")!)).toMatchObject({ version: 1, data: { step: "topics" } });
    expect(local.getItem("trendscript:studio:v1")).toBeNull();
    expect(storage.loadStudioDraft()).toEqual({ step: "topics" });
    storage.clearStudioDraft();
    expect(storage.loadStudioDraft()).toBeNull();
  });

  it("applies the type guard", () => {
    storage.saveStudioDraft({ step: 3 });
    const isDraft = (value: unknown): value is { step: string } =>
      typeof value === "object" && value !== null && typeof (value as { step: unknown }).step === "string";
    expect(storage.loadStudioDraft(isDraft)).toBeNull();
  });
});

describe("without storage", () => {
  it("degrades gracefully when storage is unavailable or throws", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new DOMException("denied", "SecurityError");
      },
      get sessionStorage(): Storage {
        throw new DOMException("denied", "SecurityError");
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.resetModules();
    const mod = await import("./storage");
    expect(mod.getProfile()).toEqual(mod.EMPTY_PROFILE);
    expect(mod.saveProfile({ ...mod.EMPTY_PROFILE, name: "x" })).toBe(false);
    expect(mod.saveScriptToHistory(savedScript("a"))).toEqual({ ok: false, evicted: 0 });
    expect(mod.saveStudioDraft({})).toBe(false);
    expect(mod.loadStudioDraft()).toBeNull();
    expect(() => mod.clearHistory()).not.toThrow();
  });

  it("works on the server (no window)", async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    const mod = await import("./storage");
    expect(mod.getHistory()).toEqual({ scripts: [], analyses: [] });
    expect(mod.saveProfile(mod.EMPTY_PROFILE)).toBe(false);
  });
});
