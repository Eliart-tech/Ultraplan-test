/**
 * Fact-checking step of the HTML edition (`settings.research`): Claude on
 * the viewer's claude.ai account, with one page tool — `web_search` — run by
 * the viewer's Firecrawl connector (≤ 5 searches). Same instructions and
 * same brief format as the server version (RESEARCH_SYSTEM,
 * buildResearchUser); the sources of the brief are only URLs that the
 * searches actually returned.
 *
 * Any failure throws a French error: the script pipeline turns it into a
 * non-fatal warning and writes the script from the analysis data alone.
 */

import { AiError } from "@/lib/server/ai/client";
import { buildResearchUser, RESEARCH_SYSTEM, rankSources, type ResearchOptions } from "@/lib/server/ai/research";
import type { RelatedLink, ResearchBrief } from "@/lib/types";
import { getSample, type SampleTool } from "./capabilities";
import { firecrawlSearch, firecrawlUnavailableReason, firecrawlUsable } from "./firecrawl";
import { toAiError } from "./sample-client";

const MAX_SEARCHES = 5;
const RESULTS_PER_SEARCH = 5;
const BRIEF_HEADING = "FAITS VÉRIFIÉS";

function hostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** "France" for FR — Firecrawl's `location` takes a country name. */
function countryName(geo: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(geo.toUpperCase());
  } catch {
    return undefined;
  }
}

/** The final brief: from the last "FAITS VÉRIFIÉS" heading (narration between searches is dropped). */
export function extractBrief(text: string): string {
  const index = text.lastIndexOf(BRIEF_HEADING);
  return (index === -1 ? text : text.slice(index)).trim();
}

const TOOL_GUIDE = `Outil disponible : web_search({ "query": "…" }) lance une recherche web (moteur Firecrawl) et renvoie jusqu'à ${RESULTS_PER_SEARCH} résultats { title, url, description }. Tu as droit à ${MAX_SEARCHES} recherches au maximum. N'écris dans la fiche que ce que disent ces résultats (titre et extrait) ; si un point n'y figure pas, range-le dans « Ce qu'on ignore ». Quand tu as fini de chercher, écris la fiche finale en commençant exactement par la ligne « ${BRIEF_HEADING} ».`;

export async function researchWithClaudeAi({
  topic,
  signals,
  settings,
  geo,
  signal,
  angle,
  now = Date.now(),
}: ResearchOptions): Promise<ResearchBrief> {
  const sample = await getSample();
  if (!sample) throw new AiError("Claude n'est pas disponible dans cette vue : recherche web impossible.");
  if (!(await firecrawlUsable())) {
    throw new AiError(`la recherche web passe par votre connecteur Firecrawl : ${await firecrawlUnavailableReason()}`);
  }
  const limits = await sample.limits().catch(() => null);
  if (!limits?.tools) {
    throw new AiError("cette vue de claude.ai ne permet pas à Claude d'utiliser des outils");
  }

  const results: RelatedLink[] = [];
  const failures: string[] = [];
  let searches = 0;
  const location = countryName(geo);

  const webSearch: SampleTool = {
    name: "web_search",
    description: `Recherche web (Firecrawl) : renvoie jusqu'à ${RESULTS_PER_SEARCH} résultats { title, url, description }. ${MAX_SEARCHES} recherches au maximum ; formule des requêtes courtes et ciblées, d'abord dans la langue du pays.`,
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "La requête de recherche (quelques mots)." } },
      required: ["query"],
    },
    async execute(input, context) {
      const query = String(input.query ?? "").trim().slice(0, 300);
      if (!query) throw new Error("Requête vide.");
      if (searches >= MAX_SEARCHES) throw new Error(`Nombre maximal de recherches atteint (${MAX_SEARCHES}) : écris la fiche.`);
      searches++;
      try {
        const found = await firecrawlSearch(query, { limit: RESULTS_PER_SEARCH, location, signal: context.signal });
        for (const item of found) results.push({ title: item.title, url: item.url, source: hostname(item.url) });
        return { results: found };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        throw new Error(`Recherche impossible : ${message}`);
      }
    },
  };

  const prompt = `<consignes>\n${RESEARCH_SYSTEM}\n\n${TOOL_GUIDE}\n</consignes>\n\n${buildResearchUser({ topic, signals, settings, geo, angle, now })}`;
  let text: string;
  try {
    ({ text } = await sample(prompt, { tools: [webSearch], signal, modelTier: "complex", cache: false }));
  } catch (error) {
    throw toAiError(error);
  }

  if (results.length === 0) {
    throw new AiError(
      failures.length
        ? `aucune recherche n'a abouti (${failures[0]})`
        : "Claude n'a lancé aucune recherche : fiche non vérifiée, ignorée",
    );
  }
  const facts = extractBrief(text);
  if (!facts) throw new AiError("La recherche web n'a rien renvoyé d'exploitable.");

  // Results the brief names (URL or site) first, then the others — only URLs the searches returned.
  const lower = facts.toLowerCase();
  const cited = results.filter((link) => lower.includes(link.url.toLowerCase()) || (link.source && lower.includes(link.source.toLowerCase())));
  const suffix = failures.length ? `\n(Recherche partielle : ${failures.length} recherche(s) en échec.)` : "";
  return { facts: `${facts}${suffix}`, sources: rankSources({ cited, results, errors: [] }) };
}
