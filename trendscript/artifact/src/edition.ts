/**
 * Shared constants and French wording of the HTML edition.
 */

import type { Snapshot } from "./snapshot-types";

/** Model label shown in the UI, exports and history ("généré avec …"). */
export const AI_MODEL_LABEL = "Claude (votre compte claude.ai)";

/**
 * Environment handed to the server pipeline: no key at all (every paid
 * source stays "non configurée", exactly like a server without keys), and
 * the model label instead of an API model id.
 */
export const EDITION_ENV: Readonly<Record<string, string | undefined>> = Object.freeze({
  ANTHROPIC_MODEL: AI_MODEL_LABEL,
});

export const SERVER_ONLY_SENTENCE =
  "Édition HTML : cette source nécessite la version serveur de TrendScript (clés API côté serveur, voir trendscript/README.md).";

const PARIS = "Europe/Paris";

/** "2 oct. 2026 à 21:33" (heure de Paris). */
export function frenchDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: PARIS }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS }).format(date);
  return `${day} à ${time}`;
}

/** "instantané réel du 2 oct. 2026 à 21:33 (heure de Paris)". */
export function snapshotLabel(snapshot: Snapshot): string {
  return `instantané réel du ${frenchDateTime(snapshot.capturedAt)} (heure de Paris)`;
}

export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Reads the snapshot inlined by the build (`<script type="application/json" id="ts-snapshot">`). */
export function readInlineSnapshot(): Snapshot {
  const element = typeof document !== "undefined" ? document.getElementById("ts-snapshot") : null;
  try {
    const parsed = JSON.parse(element?.textContent ?? "") as Snapshot;
    if (parsed && typeof parsed.capturedAt === "string" && parsed.sources) return parsed;
  } catch {
    // fall through
  }
  return { version: 1, capturedAt: new Date(0).toISOString(), geo: "FR", language: "fr", sources: {} };
}
