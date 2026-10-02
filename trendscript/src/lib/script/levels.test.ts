import { describe, expect, it } from "vitest";
import {
  ANGLE_TYPES,
  CTA_TYPES,
  DURATIONS,
  HOOK_STYLES,
  SCRIPT_PLATFORMS,
  SPEAKING_PACES,
  TONES,
  VIDEO_FORMATS,
} from "../types";
import {
  ANGLE_TYPE_LABELS,
  combinationAdvice,
  CTA_LABELS,
  DURATION_LABELS,
  FORMAT_LABELS,
  HOOK_STYLE_LABELS,
  PACE_LABELS,
  PEDAGOGY_LEVELS,
  PEDAGOGY_PROMPT_ROWS,
  pedagogyBand,
  PLATFORM_LABELS,
  TONE_LABELS,
  TONE_PROMPT_ROWS,
  VIRALITY_LEVELS,
  VIRALITY_PROMPT_ROWS,
  viralityBand,
} from "./levels";

describe("viralityBand / pedagogyBand", () => {
  it("maps the slider with band = min(5, floor(v / 20) + 1)", () => {
    const cases: [number, number][] = [
      [0, 1],
      [19, 1],
      [19.9, 1],
      [20, 2],
      [39, 2],
      [40, 3],
      [59, 3],
      [60, 4],
      [72, 4],
      [79, 4],
      [80, 5],
      [99, 5],
      [100, 5],
    ];
    for (const [value, band] of cases) {
      expect(viralityBand(value).band, `virality ${value}`).toBe(band);
      expect(pedagogyBand(value).band, `pedagogy ${value}`).toBe(band);
    }
  });

  it("clamps out-of-range and non-finite values instead of returning undefined", () => {
    expect(viralityBand(-10).band).toBe(1);
    expect(viralityBand(150).band).toBe(5);
    expect(viralityBand(Number.NaN).band).toBe(1);
    expect(pedagogyBand(Number.POSITIVE_INFINITY).band).toBe(1);
    expect(pedagogyBand(-Infinity).band).toBe(1);
  });

  it("returns the level whose [min, max] range contains every integer slider value", () => {
    for (let v = 0; v <= 100; v++) {
      const virality = viralityBand(v);
      const pedagogy = pedagogyBand(v);
      expect(v).toBeGreaterThanOrEqual(virality.min);
      expect(v).toBeLessThanOrEqual(virality.max);
      expect(v).toBeGreaterThanOrEqual(pedagogy.min);
      expect(v).toBeLessThanOrEqual(pedagogy.max);
    }
  });

  it("has French labels matching the playbook band names", () => {
    expect(VIRALITY_LEVELS.map((l) => l.label)).toEqual(["Sobre", "Engageant", "Dynamique", "Viral", "Ultra-viral"]);
    expect(PEDAGOGY_LEVELS.map((l) => l.label)).toEqual([
      "Divertissement pur",
      "Info-divertissement",
      "Explicatif",
      "Pédagogique",
      "Cours structuré",
    ]);
  });
});

describe("level tables", () => {
  it.each([
    ["VIRALITY_LEVELS", VIRALITY_LEVELS],
    ["PEDAGOGY_LEVELS", PEDAGOGY_LEVELS],
  ])("%s covers 0–100 contiguously, bands 1 to 5 in order", (_name, levels) => {
    expect(levels.map((l) => l.band)).toEqual([1, 2, 3, 4, 5]);
    expect(levels[0].min).toBe(0);
    expect(levels[levels.length - 1].max).toBe(100);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].min).toBe(levels[i - 1].max + 1);
    }
    for (const level of levels) {
      expect(level.label.trim()).not.toBe("");
      expect(level.description.trim()).not.toBe("");
    }
  });

  it("has one prompt row per band, with the observable markers of the playbook", () => {
    for (const band of [1, 2, 3, 4, 5] as const) {
      expect(VIRALITY_PROMPT_ROWS[band]).toMatch(/^Hook : /);
      expect(VIRALITY_PROMPT_ROWS[band]).toContain("CTA :");
      expect(PEDAGOGY_PROMPT_ROWS[band]).toMatch(/^Contenu : /);
      expect(PEDAGOGY_PROMPT_ROWS[band]).toContain("Preuves :");
    }
    // Virality never licenses exaggeration (playbook §5.1, V5).
    expect(VIRALITY_PROMPT_ROWS[5]).toContain("aucune exagération");
    expect(VIRALITY_PROMPT_ROWS[5]).toContain("JAMAIS la peur");
    // P5 needs 45 s or a series.
    expect(PEDAGOGY_PROMPT_ROWS[5]).toContain("45 s");
  });

  it("has a prompt row and a label for every tone", () => {
    for (const tone of TONES) {
      expect(TONE_PROMPT_ROWS[tone]).toMatch(/^Adresse : /);
      expect(TONE_LABELS[tone].label.trim()).not.toBe("");
      expect(TONE_LABELS[tone].description.trim()).not.toBe("");
    }
  });
});

describe("UI labels", () => {
  it("label every enum value of the domain model (no missing select option)", () => {
    for (const style of HOOK_STYLES) expect(HOOK_STYLE_LABELS[style]?.label, style).toBeTruthy();
    for (const cta of CTA_TYPES) expect(CTA_LABELS[cta]?.label, cta).toBeTruthy();
    for (const format of VIDEO_FORMATS) expect(FORMAT_LABELS[format]?.label, format).toBeTruthy();
    for (const platform of SCRIPT_PLATFORMS) expect(PLATFORM_LABELS[platform]?.label, platform).toBeTruthy();
    for (const pace of SPEAKING_PACES) expect(PACE_LABELS[pace]?.label, pace).toBeTruthy();
    for (const type of [...ANGLE_TYPES, "custom" as const]) expect(ANGLE_TYPE_LABELS[type], type).toBeTruthy();
    for (const duration of DURATIONS) expect(DURATION_LABELS[duration], String(duration)).toMatch(new RegExp(`^${duration} s`));
  });

  it("states the speaking rates used by the word budget", () => {
    expect(PACE_LABELS.pose.description).toContain("2,2");
    expect(PACE_LABELS.normal.description).toContain("2,5");
    expect(PACE_LABELS.dynamique.description).toContain("2,8");
  });

  it("warns about the platform rules the checks enforce", () => {
    expect(PLATFORM_LABELS.instagram_reels.description).toContain("5 hashtags");
    expect(PLATFORM_LABELS.youtube_shorts.description).toContain("Content ID");
    expect(CTA_LABELS.comment_keyword.description).toContain("appât à engagement");
  });
});

describe("combinationAdvice", () => {
  it("names the four typical combinations of playbook §5.3", () => {
    expect(combinationAdvice(80, 80)).toMatch(/^Edutainment/);
    expect(combinationAdvice(10, 70)).toMatch(/^Cours sobre/);
    expect(combinationAdvice(75, 10)).toMatch(/^Divertissement viral/);
    expect(combinationAdvice(10, 10)).toMatch(/^Ambiance/);
  });

  it("uses 60 as 'high' and 40 as 'low' thresholds", () => {
    expect(combinationAdvice(60, 60)).toMatch(/^Edutainment/);
    expect(combinationAdvice(59, 60)).toBeNull();
    expect(combinationAdvice(39, 39)).toMatch(/^Ambiance/);
    expect(combinationAdvice(40, 39)).toBeNull();
  });

  it("returns null for the middle of the grid", () => {
    expect(combinationAdvice(50, 50)).toBeNull();
    expect(combinationAdvice(72, 55)).toBeNull();
  });

  it("forbids the viral-entertainment mix on sensitive topics", () => {
    expect(combinationAdvice(90, 0)).toContain("interdit sur un sujet sensible");
  });
});
