import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW, fixtureCreator, fixtureReport } from "@/lib/creators/__fixtures__/creator";
import { computeCreatorStats } from "@/lib/creators/stats";
import { fixtureDraft, fixtureSettings, fixtureSignals, fixtureTopic } from "@/lib/script/__fixtures__/script";
import type { Analysis, CompetitorReport, GeneratedScript, ViralReport } from "@/lib/types";
import { fixtureViralReport } from "@/lib/viral/__fixtures__/viral";

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

// ---------------------------------------------------------------------------
// Competitor reports
// ---------------------------------------------------------------------------

const creatorStats = computeCreatorStats(fixtureCreator, { now: NOW, timeZone: "Europe/Paris" });

function competitor(handle: string, overrides: Partial<CompetitorReport> = {}): CompetitorReport {
  const base = fixtureReport({ stats: creatorStats });
  return {
    ...base,
    id: `report-${handle}`,
    data: { ...base.data, account: { ...base.data.account, handle } },
    ...overrides,
  };
}

describe("competitor reports", () => {
  it("keys accounts case-insensitively, without @", () => {
    expect(storage.competitorKey("tiktok", "@BudgetMalin ")).toBe("tiktok:budgetmalin");
    expect(storage.reportKey(competitor("Lea"))).toBe("tiktok:lea");
  });

  it("saves newest first, one report per platform + handle", () => {
    storage.saveCompetitorReport(competitor("a"));
    storage.saveCompetitorReport(competitor("b"));
    const again = competitor("A", { id: "report-a2", createdAt: "2026-10-03T00:00:00Z" });
    expect(storage.saveCompetitorReport(again)).toEqual({ ok: true, evicted: 0 });
    expect(storage.getCompetitors().map((r) => r.id)).toEqual(["report-a2", "report-b"]);
    expect(JSON.parse(local.getItem("trendscript:competitors:v1")!).version).toBe(1);
    expect(storage.findCompetitor("tiktok:a")?.id).toBe("report-a2");
  });

  it("caps the list at 12", () => {
    for (let i = 0; i < 14; i++) storage.saveCompetitorReport(competitor(`c${i}`));
    const reports = storage.getCompetitors();
    expect(reports).toHaveLength(storage.MAX_SAVED_COMPETITORS);
    expect(reports[0].data.account.handle).toBe("c13");
  });

  it("trims long captions for storage", () => {
    const long = competitor("long");
    long.data = {
      ...long.data,
      posts: long.data.posts.map((post, index) => (index === 0 ? { ...post, text: "x".repeat(5000), transcript: "y".repeat(3000) } : post)),
    };
    storage.saveCompetitorReport(long);
    const saved = storage.getCompetitors()[0].data.posts[0];
    expect(saved.text).toHaveLength(storage.STORED_POST_TEXT_MAX);
    expect(saved.text?.endsWith("…")).toBe(true);
    expect(saved.transcript).toHaveLength(storage.STORED_POST_TEXT_MAX);
    expect(storage.getCompetitors()[0].data.posts[1].text).toBe(fixtureCreator.posts[1].text);
  });

  it("removes and clears", () => {
    storage.saveCompetitorReport(competitor("a"));
    storage.saveCompetitorReport(competitor("b"));
    storage.removeCompetitorReport("tiktok:a");
    expect(storage.getCompetitors().map((r) => r.id)).toEqual(["report-b"]);
    storage.clearCompetitors();
    expect(local.getItem("trendscript:competitors:v1")).toBeNull();
    expect(storage.getCompetitors()).toEqual([]);
  });

  it("drops malformed and duplicate entries when reading", async () => {
    const dirty = new MemoryStorage();
    dirty.setItem(
      "trendscript:competitors:v1",
      JSON.stringify({ version: 1, reports: [competitor("ok"), { id: "broken" }, competitor("OK", { id: "dup" }), null] }),
    );
    await setup(dirty);
    expect(storage.getCompetitors().map((r) => r.id)).toEqual(["report-ok"]);
    expect(storage.sanitizeCompetitors("nope")).toEqual([]);
    expect(storage.sanitizeCompetitors([competitor("bare")]).map((r) => r.id)).toEqual(["report-bare"]);
  });

  it("evicts the oldest reports when the quota is exceeded", async () => {
    const size = JSON.stringify(storage.trimCompetitorReport(competitor("x"))).length;
    await setup(new MemoryStorage(2 * size + 300));
    storage.saveCompetitorReport(competitor("a"));
    storage.saveCompetitorReport(competitor("b"));
    const result = storage.saveCompetitorReport(competitor("c"));
    expect(result.ok).toBe(true);
    expect(result.evicted).toBe(1);
    expect(storage.getCompetitors().map((r) => r.data.account.handle)).toEqual(["c", "b"]);
  });
});

describe("YouTube 30-day retention", () => {
  const DAY = 24 * 60 * 60_000;
  /** `null` = field absent (allowed). */
  function youtube(fetchedAt: string, ratiosAllowed: boolean | null = false): CompetitorReport {
    const base = competitor("chaine");
    return {
      ...base,
      data: {
        ...base.data,
        fetchedAt,
        ...(ratiosAllowed === null ? {} : { ratiosAllowed }),
        account: { ...base.data.account, platform: "youtube" },
      },
    };
  }

  it("expires YouTube reports without derived-metrics approval after 30 days", () => {
    const now = Date.parse("2026-11-10T00:00:00Z");
    expect(storage.isRetentionExpired(youtube("2026-10-01T00:00:00Z"), now)).toBe(true);
    expect(storage.isRetentionExpired(youtube("2026-10-20T00:00:00Z"), now)).toBe(false);
    expect(storage.isRetentionExpired(youtube("2026-10-01T00:00:00Z", null), now)).toBe(false);
    expect(storage.isRetentionExpired(youtube("2026-10-01T00:00:00Z", true), now)).toBe(false);
    expect(storage.isRetentionExpired(competitor("tk"), now + 90 * DAY)).toBe(false);
  });

  it("strips every audience statistic, keeping the text", () => {
    const stripped = storage.stripReportMetrics(youtube("2026-10-01T00:00:00Z"));
    expect(stripped.data.account.followers).toBeUndefined();
    expect(stripped.data.account.totalPosts).toBeUndefined();
    expect(stripped.data.posts.every((post) => Object.keys(post.metrics).length === 0)).toBe(true);
    expect(stripped.data.posts[0].title).toBe(fixtureCreator.posts[0].title);
    expect(stripped.stats.medianViews).toBeUndefined();
    expect(stripped.stats.outliers).toEqual([]);
    expect(stripped.stats.weekdays.every((bucket) => bucket.median === undefined)).toBe(true);
    expect(stripped.insights).toEqual(youtube("2026-10-01T00:00:00Z").insights);
    expect(storage.isMetricsStripped(stripped)).toBe(true);
    expect(storage.stripReportMetrics(stripped)).toBe(stripped);
  });

  it("hides expired statistics on read and erases them from storage", async () => {
    const seeded = new MemoryStorage();
    seeded.setItem(
      "trendscript:competitors:v1",
      JSON.stringify({ version: 1, reports: [youtube("2020-01-01T00:00:00Z"), competitor("fresh")] }),
    );
    await setup(seeded);
    const [expired, fresh] = storage.getCompetitors();
    expect(expired.data.posts[0].metrics).toEqual({});
    expect(fresh.data.posts[0].metrics.views).toBe(fixtureCreator.posts[0].metrics.views);
    // Still in storage until purged.
    expect(JSON.parse(seeded.getItem("trendscript:competitors:v1")!).reports[0].data.posts[0].metrics.views).toBeDefined();
    expect(storage.purgeExpiredCompetitors()).toBe(1);
    expect(JSON.parse(seeded.getItem("trendscript:competitors:v1")!).reports[0].data.posts[0].metrics).toEqual({});
    expect(storage.purgeExpiredCompetitors()).toBe(0);
  });
});

describe("studio hand-off (sessionStorage)", () => {
  const handoff = { topic: fixtureTopic, signals: fixtureSignals, angle: fixtureTopic.angles[0], competitorKey: "tiktok:a", label: "@a" };

  it("is peeked without being consumed, then cleared", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(storage.peekStudioHandoff(now)).toBeNull();
    expect(storage.saveStudioHandoff(handoff, now)).toBe(true);
    expect(local.getItem("trendscript:handoff:v1")).toBeNull();
    const first = storage.peekStudioHandoff(now + 1000);
    expect(first).toMatchObject({ version: 1, competitorKey: "tiktok:a", topic: { id: fixtureTopic.id } });
    expect(storage.peekStudioHandoff(now + 2000)).toEqual(first);
    storage.clearStudioHandoff();
    expect(storage.peekStudioHandoff(now)).toBeNull();
  });

  it("ignores stale or malformed hand-offs", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    storage.saveStudioHandoff(handoff, now);
    expect(storage.peekStudioHandoff(now + storage.HANDOFF_TTL_MS + 1)).toBeNull();
    session.setItem("trendscript:handoff:v1", JSON.stringify({ version: 1, createdAt: new Date(now).toISOString(), topic: {} }));
    expect(storage.peekStudioHandoff(now)).toBeNull();
  });
});

describe("« Ce qui cartonne » lab reports", () => {
  const DAY = 24 * 60 * 60_000;
  function lab(keywords: string[], overrides: Partial<ViralReport> = {}): ViralReport {
    const base = fixtureViralReport();
    return { ...base, id: `lab-${keywords.join("-")}`, request: { ...base.request, keywords }, ...overrides };
  }

  it("keys reports by platforms + keywords, ignoring order, case, accents and #", () => {
    expect(storage.viralKey(["Productivité", "#sommeil"], ["tiktok", "instagram"])).toBe("instagram+tiktok:productivite|sommeil");
    expect(storage.viralKey(["sommeil", "productivite"], ["instagram", "tiktok"])).toBe("instagram+tiktok:productivite|sommeil");
    expect(storage.viralReportKey(fixtureViralReport())).toBe("instagram+tiktok+youtube:productivite|sommeil");
  });

  it("saves newest first, one report per keywords + platforms, max 6", () => {
    storage.saveViralReport(lab(["a1"]));
    storage.saveViralReport(lab(["b1"]));
    const again = lab(["A1"], { id: "lab-a-again" });
    expect(storage.saveViralReport(again)).toEqual({ ok: true, evicted: 0 });
    expect(storage.getViralReports().map((r) => r.id)).toEqual(["lab-a-again", "lab-b1"]);
    expect(JSON.parse(local.getItem("trendscript:viral:v1")!).version).toBe(1);
    expect(storage.findViralReport(storage.viralReportKey(again))?.id).toBe("lab-a-again");

    for (let i = 0; i < 8; i++) storage.saveViralReport(lab([`k${i}`]));
    const reports = storage.getViralReports();
    expect(reports).toHaveLength(storage.MAX_SAVED_VIRAL);
    expect(reports[0].id).toBe("lab-k7");
  });

  it("trims long captions, removes and clears", () => {
    const long = lab(["long"]);
    long.posts = long.posts.map((post, index) => (index === 0 ? { ...post, text: "x".repeat(4000) } : post));
    storage.saveViralReport(long);
    expect(storage.getViralReports()[0].posts[0].text).toHaveLength(storage.STORED_POST_TEXT_MAX);
    storage.saveViralReport(lab(["autre"]));
    storage.removeViralReport(storage.viralReportKey(long));
    expect(storage.getViralReports().map((r) => r.id)).toEqual(["lab-autre"]);
    storage.clearViralReports();
    expect(local.getItem("trendscript:viral:v1")).toBeNull();
    expect(storage.getViralReports()).toEqual([]);
  });

  it("drops malformed and duplicate entries when reading", async () => {
    const dirty = new MemoryStorage();
    dirty.setItem(
      "trendscript:viral:v1",
      JSON.stringify({
        version: 1,
        reports: [lab(["ok"]), { id: "broken" }, lab(["OK"], { id: "dup" }), lab(["x"], { posts: [{ id: "p" }] as never }), null],
      }),
    );
    await setup(dirty);
    expect(storage.getViralReports().map((r) => r.id)).toEqual(["lab-ok"]);
    expect(storage.sanitizeViralReports("nope")).toEqual([]);
  });

  it("erases YouTube statistics after 30 days when ratios are not allowed, keeping the rest", async () => {
    const createdAt = new Date(Date.parse("2026-10-04T10:00:00Z") - 40 * DAY).toISOString();
    const old = lab(["vieux"], { createdAt });
    const now = Date.parse("2026-10-04T10:00:00Z");
    expect(storage.isViralRetentionExpired(old, now)).toBe(true);
    expect(storage.isViralRetentionExpired(lab(["recent"]), now)).toBe(false);
    const approved = lab(["ok"], { createdAt, platforms: old.platforms.map((s) => ({ ...s, ratiosAllowed: true })) });
    expect(storage.isViralRetentionExpired(approved, now)).toBe(false);

    const stripped = storage.stripViralYoutubeMetrics(old);
    const youtube = stripped.posts.filter((post) => post.platform === "youtube");
    expect(youtube.every((post) => Object.keys(post.metrics).length === 0 && post.author.followers === undefined)).toBe(true);
    expect(youtube.every((post) => post.viewsPerDay === undefined && post.tier === "normal" && post.title)).toBe(true);
    const tiktok = stripped.posts.find((post) => post.id === "tiktok:tt1")!;
    expect(tiktok.metrics.views).toBe(900_000);
    expect(stripped.platforms.find((s) => s.platform === "youtube")?.medianViews).toBeUndefined();
    expect(stripped.patterns).toEqual(old.patterns);
    expect(storage.isViralMetricsStripped(stripped)).toBe(true);
    expect(storage.stripViralYoutubeMetrics(stripped)).toBe(stripped);

    const seeded = new MemoryStorage();
    seeded.setItem("trendscript:viral:v1", JSON.stringify({ version: 1, reports: [old] }));
    await setup(seeded);
    expect(storage.getViralReports()[0].posts.find((post) => post.platform === "youtube")?.metrics).toEqual({});
    expect(storage.purgeExpiredViralReports()).toBe(1);
    const stored = JSON.parse(seeded.getItem("trendscript:viral:v1")!).reports[0];
    expect(stored.notes[0]).toBe(storage.VIRAL_RETENTION_NOTE);
    expect(storage.purgeExpiredViralReports()).toBe(0);
  });

  it("hands a lab idea to the Studio with its report key", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    storage.saveStudioHandoff(
      { topic: fixtureTopic, signals: fixtureSignals, angle: fixtureTopic.angles[0], viralKey: "tiktok:sommeil" },
      now,
    );
    expect(storage.peekStudioHandoff(now)?.viralKey).toBe("tiktok:sommeil");
  });
});
