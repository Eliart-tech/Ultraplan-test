/**
 * Client-side hook swap. Claude returns three hook variants and writes the
 * script with the first one: `beats[0].voiceover` repeats `hooks[0].spoken`
 * word for word, `beats[0].onScreenText` repeats `hooks[0].onScreenText` and
 * `fullScript` starts with `hooks[0].spoken` (prompt contract). Picking
 * another variant therefore only has to rewrite the opening — no new API
 * call. Pure: always apply it to the script as generated (hook 0 in use).
 */

import { countWords } from "@/lib/script/metrics";
import type { GeneratedScript, ScriptDraft } from "@/lib/types";

/** A draft, optionally with the server-computed metadata of GeneratedScript. */
export type HookSwappable = ScriptDraft & Partial<Pick<GeneratedScript, "wordCount" | "estimatedDurationSec">>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces the first occurrence of `search` in `text`, tolerating
 * whitespace differences (line breaks, double spaces). Returns null when
 * `search` is empty or absent.
 */
export function replaceLoose(text: string, search: string, replacement: string): string | null {
  const needle = search.replace(/\s+/g, " ").trim();
  if (!needle || !text) return null;
  const pattern = new RegExp(escapeRegExp(needle).replace(/ /g, "\\s+"));
  const match = pattern.exec(text);
  if (!match) return null;
  return text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
}

/** First sentence of `text` (up to . ! ? or …), or null when there is none. */
const FIRST_SENTENCE = /^\s*[\s\S]*?[.!?…]+(?=\s|$)/;

/**
 * New opening of the teleprompter text. In order: the old hook line, then the
 * old first beat, then — when the model paraphrased both — the first
 * sentence if it is about the size of a hook; otherwise the new hook is
 * prepended so nothing the creator wrote is lost.
 */
function swapOpening(
  fullScript: string,
  oldHook: string,
  newHook: string,
  oldFirstBeat: string | undefined,
  newFirstBeat: string | undefined,
): string {
  const byHook = replaceLoose(fullScript, oldHook, newHook);
  if (byHook !== null) return byHook;
  if (oldFirstBeat && newFirstBeat) {
    const byBeat = replaceLoose(fullScript, oldFirstBeat, newFirstBeat);
    if (byBeat !== null) return byBeat;
  }
  if (!fullScript.trim()) return newHook;
  const sentence = FIRST_SENTENCE.exec(fullScript);
  if (sentence && sentence[0].trim().length <= Math.max(40, oldHook.length * 2)) {
    return `${newHook}${fullScript.slice(sentence[0].length)}`;
  }
  return `${newHook}\n\n${fullScript.trimStart()}`;
}

/**
 * The script as if Claude had written it with `hooks[index]`:
 * - hooks reordered so the chosen one is first (exports mark hooks[0] as
 *   "utilisée", refinements keep it);
 * - first beat: spoken line and on-screen text swapped (the visual too when
 *   it was the old hook's visual);
 * - fullScript: opening swapped;
 * - wordCount recomputed, estimatedDurationSec scaled in proportion.
 *
 * `index` 0 or out of range returns `script` itself (same reference).
 */
export function applyHook<T extends HookSwappable>(script: T, index: number): T {
  if (!Number.isInteger(index) || index <= 0 || index >= script.hooks.length) return script;
  const current = script.hooks[0];
  const chosen = script.hooks[index];
  const hooks = [chosen, ...script.hooks.filter((_, position) => position !== index)];

  const beats = script.beats.slice();
  const firstBeat = beats[0];
  if (firstBeat) {
    beats[0] = {
      ...firstBeat,
      voiceover: replaceLoose(firstBeat.voiceover, current.spoken, chosen.spoken) ?? chosen.spoken,
      onScreenText: replaceLoose(firstBeat.onScreenText, current.onScreenText, chosen.onScreenText) ?? chosen.onScreenText,
      visual:
        chosen.visual && current.visual
          ? (replaceLoose(firstBeat.visual, current.visual, chosen.visual) ?? firstBeat.visual)
          : firstBeat.visual,
    };
  }

  const fullScript = swapOpening(script.fullScript, current.spoken, chosen.spoken, firstBeat?.voiceover, beats[0]?.voiceover);
  const next: T = { ...script, hooks, beats, fullScript };

  if (typeof script.wordCount === "number") {
    const wordCount = countWords(fullScript);
    next.wordCount = wordCount;
    if (typeof script.estimatedDurationSec === "number" && script.wordCount > 0) {
      next.estimatedDurationSec = Math.round((script.estimatedDurationSec * wordCount) / script.wordCount);
    }
  }
  return next;
}
