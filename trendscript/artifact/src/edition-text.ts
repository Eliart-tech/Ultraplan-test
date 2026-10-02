/**
 * French wording of what Claude and Firecrawl can do in this view, shared by
 * the banner, the in-page server and the reused components patched at build
 * time. One source of truth, so every place says the same thing: inside
 * claude.ai (refused, not served for this view or account) or outside it.
 */

import { getEditionState, hasClaudeRuntime, type EditionState } from "./capabilities";

/** Why Claude cannot be used here, as a fragment without final period; "" when it can. */
export function claudeProblem(state: EditionState = getEditionState()): string {
  switch (state.claude) {
    case "available":
      return "";
    case "pending":
      return "accès à Claude en cours de vérification";
    case "blocked":
      return state.claudeNote ?? "Claude n'est pas disponible dans cette vue de claude.ai";
    default:
      return hasClaudeRuntime()
        ? "Claude n'est pas disponible dans cette vue de claude.ai (ou pour ce compte)"
        : "Claude n'est accessible que dans claude.ai : ouvrez cette page dans claude.ai, connecté à votre compte, et autorisez-la à utiliser Claude";
  }
}

/** Same, as a sentence ("Claude n'est pas … ."). */
export function claudeProblemSentence(state: EditionState = getEditionState()): string {
  const problem = claudeProblem(state);
  return problem ? `${problem[0].toUpperCase()}${problem.slice(1)}.` : "";
}

/** Banner wording for Claude. */
export function claudeBannerSentence(state: EditionState = getEditionState()): string {
  switch (state.claude) {
    case "available":
      return "Claude via votre compte claude.ai";
    case "pending":
      return "Claude via votre compte claude.ai (vérification…)";
    case "blocked":
      return `mode sans IA (${claudeProblem(state)})`;
    default:
      return hasClaudeRuntime()
        ? "Claude non disponible dans cette vue de claude.ai (ou pour ce compte) : mode sans IA"
        : "Claude indisponible hors de claude.ai : mode sans IA";
  }
}

/**
 * Firecrawl, three ways:
 * - "live": it answered in this view;
 * - "maybe": `use("mcp")` resolved, but nothing proves the connector is
 *   connected until the first call (made by Analyser);
 * - "off": not usable here — `why` says why.
 */
export function firecrawlMode(state: EditionState = getEditionState()): { mode: "live" | "maybe" | "off"; why: string } {
  if (state.firecrawl === "available") return { mode: state.firecrawlConfirmed ? "live" : "maybe", why: "" };
  if (state.firecrawlNote) return { mode: "off", why: state.firecrawlNote };
  if (state.firecrawl === "pending") return { mode: "off", why: "vérification du connecteur Firecrawl en cours" };
  return {
    mode: "off",
    why: hasClaudeRuntime()
      ? "connecteurs claude.ai indisponibles dans cette vue"
      : "données en direct uniquement dans claude.ai, avec votre connecteur Firecrawl",
  };
}

/** Banner wording for the live part of the data. */
export function liveBannerSentence(state: EditionState = getEditionState()): string {
  const { mode, why } = firecrawlMode(state);
  if (mode === "live") return "+ Google Actualités et Tendances en direct via votre connecteur Firecrawl";
  if (mode === "maybe") {
    return "+ Google Actualités et Tendances en direct si votre connecteur Firecrawl est connecté (vérifié à la première analyse)";
  }
  return state.firecrawl === "pending" ? `(${why}…)` : `(pas de données en direct : ${why})`;
}
