import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatCount,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatSignalMetrics,
  pluralize,
} from "./format";

/** Intl uses (narrow) no-break spaces in fr-FR: compare on normal spaces. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

const NOW = Date.parse("2026-10-02T15:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatCompact", () => {
  it("formats in French compact notation", () => {
    expect(plain(formatCompact(12_345))).toBe("12,3 k");
    expect(plain(formatCompact(1_500_000))).toBe("1,5 M");
    expect(plain(formatCompact(2_300_000_000))).toBe("2,3 Md");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(0)).toBe("0");
  });

  it("returns a dash for missing values", () => {
    expect(formatCompact(undefined)).toBe("—");
    expect(formatCompact(Number.NaN)).toBe("—");
  });
});

describe("formatNumber / formatPercent / pluralize / formatCount", () => {
  it("groups thousands with spaces and uses a decimal comma", () => {
    expect(plain(formatNumber(1_234_567.5))).toBe("1 234 567,5");
    expect(formatNumber(null)).toBe("—");
  });

  it("signs percentages", () => {
    expect(plain(formatPercent(250))).toBe("+250 %");
    expect(plain(formatPercent(-12.4))).toBe("−12 %");
    expect(plain(formatPercent(0))).toBe("0 %");
    expect(plain(formatPercent(40, { signed: false }))).toBe("40 %");
  });

  it("uses the French plural rule (0 and 1 are singular)", () => {
    expect(pluralize(0, "vue", "vues")).toBe("vue");
    expect(pluralize(1, "vue", "vues")).toBe("vue");
    expect(pluralize(2, "vue", "vues")).toBe("vues");
    expect(plain(formatCount(12_345, "vue", "vues"))).toBe("12,3 k vues");
    expect(formatCount(1, "abonné", "abonnés")).toBe("1 abonné");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(plain(formatDuration(45))).toBe("45 s");
    expect(plain(formatDuration(60))).toBe("1 min");
    expect(plain(formatDuration(90))).toBe("1 min 30 s");
    expect(plain(formatDuration(3_900))).toBe("1 h 05 min");
    expect(plain(formatDuration(44.6))).toBe("45 s");
    expect(formatDuration(-1)).toBe("—");
  });
});

describe("formatRelative", () => {
  it("describes recent dates relative to now", () => {
    expect(formatRelative(ago(10_000), NOW)).toBe("à l'instant");
    expect(plain(formatRelative(ago(5 * MIN), NOW))).toBe("il y a 5 min");
    expect(plain(formatRelative(ago(3 * HOUR), NOW))).toBe("il y a 3 h");
    expect(formatRelative(ago(DAY + HOUR), NOW)).toBe("hier");
    expect(plain(formatRelative(ago(4 * DAY), NOW))).toBe("il y a 4 j");
  });

  it("handles future dates", () => {
    expect(plain(formatRelative(new Date(NOW + 2 * HOUR).toISOString(), NOW))).toBe("dans 2 h");
  });

  it("falls back to an absolute date after a week", () => {
    expect(plain(formatRelative("2026-09-12T12:00:00Z", NOW, { timeZone: "UTC" }))).toBe("12 sept.");
    expect(plain(formatRelative("2025-09-12T12:00:00Z", NOW, { timeZone: "UTC" }))).toBe("12 sept. 2025");
  });

  it("accepts timestamps and Date objects, ignores invalid input", () => {
    expect(plain(formatRelative(NOW - 3 * HOUR, NOW))).toBe("il y a 3 h");
    expect(plain(formatRelative(new Date(NOW - 3 * HOUR), NOW))).toBe("il y a 3 h");
    expect(formatRelative("pas une date", NOW)).toBe("");
    expect(formatRelative(undefined, NOW)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a short French date", () => {
    expect(plain(formatDate("2026-10-02T12:00:00Z", { timeZone: "UTC" }))).toBe("2 oct. 2026");
    expect(formatDate("")).toBe("");
  });
});

describe("formatSignalMetrics", () => {
  it("lists the available metrics in French, most meaningful first", () => {
    expect(formatSignalMetrics({ searchVolume: 20_000, increasePct: 1000 }).map(plain)).toEqual([
      "20 k+ recherches",
      "+1 000 %",
    ]);
    expect(formatSignalMetrics({ views: 1_250_000, likes: 98_000, comments: 1 }).map(plain)).toEqual([
      "1,3 M vues",
      "98 k j'aime",
      "1 commentaire",
    ]);
    expect(formatSignalMetrics({ rank: 2 }).map(plain)).toEqual(["n° 2"]);
    expect(formatSignalMetrics({})).toEqual([]);
  });
});
