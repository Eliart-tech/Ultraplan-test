/**
 * Search in the saved history: accent- and case-insensitive, every word of
 * the query must appear somewhere in the entry ("ia réforme" matches
 * "Réforme des retraites : ce que l'IA change"). Pure and unit-tested.
 *
 * Field extractors are defensive: entries come from localStorage, where an
 * older version or a manual edit may have left a field missing.
 */

import type { SavedScript } from "@/lib/client/storage";
import type { Analysis } from "@/lib/types";
import { countryName } from "./analysis-export";

/** "  Réforme   ÉTÉ " → "reforme ete". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[#\u2019']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);

/** True when every word of `query` appears in one of the fields (empty query → true). */
export function matchesQuery(fields: string[], query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(fields.join(" \u0001 "));
  return words.every((word) => haystack.includes(word));
}

/** Script title, topic, category, angle and hashtags. */
export function scriptSearchFields(entry: SavedScript): string[] {
  return [
    str(entry.script?.title),
    str(entry.topic?.title),
    str(entry.topic?.category),
    str(entry.angle?.title),
    ...strings(entry.script?.hashtags),
  ];
}

/** Niche, keywords, country and topic titles. */
export function analysisSearchFields(analysis: Analysis): string[] {
  const topics = Array.isArray(analysis.topics) ? analysis.topics : [];
  return [
    str(analysis.request?.niche),
    ...strings(analysis.request?.keywords),
    countryName(str(analysis.request?.geo)),
    ...topics.map((topic) => str(topic?.title)),
  ];
}

export function filterScripts(scripts: SavedScript[], query: string): SavedScript[] {
  if (!normalizeSearch(query)) return scripts;
  return scripts.filter((entry) => matchesQuery(scriptSearchFields(entry), query));
}

export function filterAnalyses(analyses: Analysis[], query: string): Analysis[] {
  if (!normalizeSearch(query)) return analyses;
  return analyses.filter((analysis) => matchesQuery(analysisSearchFields(analysis), query));
}
