/**
 * Voice-over arithmetic shared by the prompt (word budget given to Claude),
 * the server checks and the UI (live word count vs. target). Pure and
 * client-safe.
 *
 * Rates come from the playbook (§4.1): 2.5 words/s by default (~150 words/min,
 * the usual French working value), 2.2 for a calm delivery, 2.8 for a fast
 * face-camera delivery. 10 % of the duration is kept free for pauses and
 * purely visual beats.
 */

import type { SpeakingPace } from "../types";

const WORDS_PER_SECOND: Record<SpeakingPace, number> = {
  pose: 2.2,
  normal: 2.5,
  dynamique: 2.8,
};

/** Share of the duration actually spoken (the rest is pauses / visual beats). */
const SPOKEN_SHARE = 0.9;

/**
 * Counts spoken words, French-aware.
 *
 * Choices (documented because they change the budget check):
 * - Elisions stay one word: "l'IA", "j'ai", "aujourd'hui", "qu'on" count as 1,
 *   like word processors do — the words/second rates above were calibrated
 *   with that convention.
 * - Hyphenated words count as 1 ("peut-être", "c'est-à-dire").
 * - Stage directions in square brackets ("[ZOOM]", "[B-ROLL: …]") are not
 *   spoken and are ignored.
 * - A `{À VÉRIFIER : …}` placeholder stands for one value to be said and
 *   counts as 1 word.
 * - Tokens without any letter or digit (emojis, "—", "…") are ignored.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " X ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function wordsPerSecond(pace: SpeakingPace): number {
  return WORDS_PER_SECOND[pace] ?? WORDS_PER_SECOND.normal;
}

/** Target voice-over length: `round(duration × words/s × 0.9)` (playbook §0). */
export function wordBudget(durationSec: number, pace: SpeakingPace): number {
  return Math.round(durationSec * wordsPerSecond(pace) * SPOKEN_SHARE);
}

/**
 * Seconds needed to say `words` at this pace, pauses included — the exact
 * inverse of `wordBudget`, so a script on budget is estimated at its target
 * duration.
 */
export function estimateDuration(words: number, pace: SpeakingPace): number {
  if (words <= 0) return 0;
  return Math.round(words / (wordsPerSecond(pace) * SPOKEN_SHARE));
}

/**
 * Accepted ±10 % window around the budget (playbook §0). Computed as
 * `budget × 9 / 10` and `budget × 11 / 10` so integer budgets stay exact
 * (`100 × 1.1` is 110.00000000000001 in floating point, which `ceil` turned
 * into 111).
 */
export function budgetRange(budget: number): { min: number; max: number } {
  return { min: Math.floor((budget * 9) / 10), max: Math.ceil((budget * 11) / 10) };
}
