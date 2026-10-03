/**
 * LinkedIn posts of the last days on the creator's niche keywords, found
 * through a web search restricted to linkedin.com/posts (Firecrawl search
 * API). Shows *what is being discussed* on LinkedIn, with the exact
 * publication date decoded from each post id — but no engagement counts
 * (the search engine does not see them; use the Apify source for those).
 */

import type { Signal } from "../../types";
import { fetchWithTimeout, SourceError } from "../http";
import {
  LINKEDIN_MAX_AGE_DAYS,
  LINKEDIN_MAX_KEYWORDS,
  linkedinHitsToSignals,
  linkedinSearchQuery,
  searchLocation,
  type WebSearchHit,
} from "./linkedin";
import { errorMessage, scrubSecrets } from "./social-utils";
import type { SourceConnector, SourceContext } from "./types";

export const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const RESULTS_PER_KEYWORD = 10;

/** Searches the web; returns hits in Firecrawl's `data.web[]` shape. */
export type LinkedinSearch = (
  query: string,
  options: { limit: number; tbs: string; location?: string; signal: AbortSignal },
) => Promise<WebSearchHit[]>;

/** Pure: Firecrawl search request body. */
export function buildFirecrawlSearchBody(query: string, { limit, tbs, location }: { limit: number; tbs: string; location?: string }) {
  return { query, limit, tbs, sources: ["web"], ...(location ? { location } : {}) };
}

/** Pure: Firecrawl search response → hits (v2 `data.web`, tolerant of a bare `data` array). */
export function readFirecrawlSearch(json: unknown): WebSearchHit[] {
  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (root.success === false) {
    throw new SourceError(`Firecrawl : ${typeof root.error === "string" ? root.error : "recherche refusée"}.`);
  }
  const data = root.data;
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? (data as Record<string, unknown>).web : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return typeof record.url === "string"
      ? [
          {
            url: record.url,
            title: typeof record.title === "string" ? record.title : undefined,
            description: typeof record.description === "string" ? record.description : undefined,
          },
        ]
      : [];
  });
}

function firecrawlError(status: number, body: string): SourceError {
  if (status === 401 || status === 403) return new SourceError("Clé Firecrawl refusée : vérifiez FIRECRAWL_API_KEY.", status);
  if (status === 402) return new SourceError("Crédits Firecrawl épuisés : rechargez votre compte Firecrawl.", status);
  if (status === 429) return new SourceError("Firecrawl limite temporairement les recherches : réessayez dans une minute.", status, true);
  return new SourceError(`Firecrawl a répondu ${status}${body ? ` : ${scrubSecrets(body).slice(0, 200)}` : ""}`, status, status >= 500);
}

/** Server-side search through the Firecrawl REST API. */
export function firecrawlRestSearch(apiKey: string): LinkedinSearch {
  return async (query, { limit, tbs, location, signal }) => {
    const response = await fetchWithTimeout(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildFirecrawlSearchBody(query, { limit, tbs, location })),
      signal,
      timeoutMs: 45_000,
    });
    if (!response.ok) {
      let body = "";
      try {
        body = (await response.text()).replace(/\s+/g, " ");
      } catch {
        // keep the status only
      }
      throw firecrawlError(response.status, body);
    }
    try {
      return readFirecrawlSearch(await response.json());
    } catch (error) {
      if (error instanceof SourceError) throw error;
      throw new SourceError("Firecrawl a renvoyé une réponse JSON invalide.");
    }
  };
}

/** Runs one search per niche keyword (max 3) and maps the hits; shared by the server and the HTML edition. */
export async function fetchLinkedinWeb(
  ctx: Pick<SourceContext, "geo" | "keywords" | "signal" | "now">,
  search: LinkedinSearch,
): Promise<{ signals: Signal[]; warning?: string }> {
  const keywords = [...new Set(ctx.keywords.map((k) => k.replace(/^#/, "").trim()).filter(Boolean))].slice(0, LINKEDIN_MAX_KEYWORDS);
  if (keywords.length === 0) {
    return { signals: [], warning: "LinkedIn a besoin de mots-clés de niche pour chercher des publications." };
  }
  const location = searchLocation(ctx.geo);
  const outcomes = await Promise.allSettled(
    keywords.map((keyword) =>
      search(linkedinSearchQuery(keyword), { limit: RESULTS_PER_KEYWORD, tbs: "qdr:w", location, signal: ctx.signal }).then((hits) =>
        linkedinHitsToSignals(hits, { source: "linkedin_web", query: keyword, now: ctx.now }),
      ),
    ),
  );

  const byId = new Map<string, Signal>();
  const failures: string[] = [];
  const empty: string[] = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      failures.push(`${keywords[index]} (${errorMessage(outcome.reason)})`);
      return;
    }
    if (outcome.value.length === 0) empty.push(keywords[index]);
    for (const signal of outcome.value) if (!byId.has(signal.id)) byId.set(signal.id, signal);
  });
  if (failures.length === keywords.length) {
    throw new SourceError(`Recherche LinkedIn impossible : ${failures.join(" ; ")}`);
  }

  const notes = [
    "Publications trouvées par recherche web : sans compteurs de réactions (seule la source LinkedIn via Apify les fournit).",
    empty.length ? `Aucune publication de moins de ${LINKEDIN_MAX_AGE_DAYS} jours pour « ${empty.join(" », « ")} ».` : "",
    failures.length ? `Recherche en échec pour ${failures.join(" ; ")}.` : "",
  ].filter(Boolean);
  return { signals: [...byId.values()], warning: notes.join(" ") };
}

export const linkedinWebConnector: SourceConnector = {
  id: "linkedin_web",
  meta: {
    label: "LinkedIn — publications récentes (recherche web)",
    platform: "linkedin",
    free: false,
    needsKeywords: true,
    description:
      "Publications LinkedIn publiques de la semaine sur vos mots-clés, trouvées par une recherche web limitée à linkedin.com/posts (Firecrawl), avec leur date exacte de publication. Montre de quoi votre audience professionnelle parle, sans mesurer l'audience : les réactions et commentaires ne sont pas visibles par cette voie. LinkedIn ne propose aucune API publique de recherche ni de tendances.",
    envVars: ["FIRECRAWL_API_KEY"],
    setup: [
      "Créez un compte sur https://www.firecrawl.dev (une offre gratuite existe).",
      "Dans le tableau de bord Firecrawl, ouvrez API Keys et copiez votre clé (elle commence par fc-).",
      "Ajoutez FIRECRAWL_API_KEY=votre_clé dans le fichier .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
      "Saisissez vos mots-clés de niche dans le Radar : les 3 premiers sont cherchés sur LinkedIn.",
    ],
    costNote:
      "Crédits Firecrawl : environ 2 crédits par mot-clé (10 résultats), soit environ 6 crédits par analyse avec 3 mots-clés, mis en cache 1 h. Les publications sont celles que le moteur de recherche a déjà indexées : les plus récentes peuvent manquer.",
    docsUrl: "https://docs.firecrawl.dev/api-reference/endpoint/search",
    ttlMs: 60 * 60 * 1000,
  },
  isConfigured: (env) => Boolean(env.FIRECRAWL_API_KEY?.trim()),
  fetch: (ctx) => fetchLinkedinWeb(ctx, firecrawlRestSearch(ctx.env.FIRECRAWL_API_KEY?.trim() ?? "")),
};
