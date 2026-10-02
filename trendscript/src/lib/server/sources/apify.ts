/**
 * Minimal Apify client shared by the Instagram and TikTok connectors.
 *
 * Uses the synchronous "run Actor and get dataset items" endpoint
 * (docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post): one POST,
 * the body is the Actor input, the 201 response is the dataset as a JSON
 * array. The token travels in the Authorization header, never in the URL.
 * Every run carries `timeout` (the run stops itself, and stops billing) and
 * `maxTotalChargeUsd` (hard cost cap), because a sync call that times out on
 * our side does not stop the run on Apify's side.
 */

import { SourceError, fetchWithTimeout } from "../http";
import { scrubSecrets } from "./social-utils";
import type { Env } from "./types";

export const APIFY_API_BASE = "https://api.apify.com/v2";
/** Actor-side run timeout. The sync endpoint itself gives up after 300 s (408). */
export const APIFY_ACTOR_TIMEOUT_SECS = 120;
/** Default cost cap per run; several Apify actors refuse anything below 0.50 $. */
export const DEFAULT_APIFY_MAX_CHARGE_USD = 0.5;

export interface ApifyRunOptions {
  token: string;
  /** Cancellation from the orchestrator. */
  signal?: AbortSignal;
  /** `maxTotalChargeUsd` — default 0.50 $. */
  maxChargeUsd?: number;
  /** Actor run timeout in seconds — default 120. */
  timeoutSecs?: number;
  /** Dataset fields to keep (trims long CDN URLs from the payload). */
  fields?: string[];
}

/** A dataset row the actor flagged as failed (`{ error, errorDescription, … }`). */
export interface ApifyErrorRow {
  error: string;
  errorDescription?: string;
  /** What the row was about (hashtag, query, URL…) when the actor says so. */
  input?: string;
}

export interface ApifyRunResult<T> {
  items: T[];
  errorRows: ApifyErrorRow[];
}

/** Cost cap from `APIFY_MAX_CHARGE_USD` (dollars), default 0.50. */
export function apifyMaxChargeUsd(env: Env): number {
  const raw = env.APIFY_MAX_CHARGE_USD?.trim().replace(",", ".");
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_APIFY_MAX_CHARGE_USD;
}

/** Pure: the exact run-sync URL (no secret in it). */
export function buildApifyRunUrl(
  actorId: string,
  { timeoutSecs = APIFY_ACTOR_TIMEOUT_SECS, maxChargeUsd = DEFAULT_APIFY_MAX_CHARGE_USD, fields }: Omit<ApifyRunOptions, "token" | "signal"> = {},
): string {
  const params = new URLSearchParams({
    timeout: String(timeoutSecs),
    maxTotalChargeUsd: String(maxChargeUsd),
    format: "json",
    clean: "true",
  });
  if (fields?.length) params.set("fields", fields.join(","));
  // `/v2/actors/` is the current prefix (`/v2/acts/` still works but is deprecated).
  return `${APIFY_API_BASE}/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?${params}`;
}

/** Pure: the exact request init (headers + JSON body). */
export function buildApifyRunInit(input: unknown, token: string): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  };
}

function actorName(actorId: string): string {
  return actorId.replace("~", "/");
}

interface ApifyErrorBody {
  error?: { type?: string; message?: string };
}

/**
 * Pure: maps an Apify error response to a French, actionable SourceError.
 * Upstream messages are scrubbed and shortened before being shown.
 */
export function apifyError(status: number, bodyText: string, actorId: string): SourceError {
  let type = "";
  let message = "";
  try {
    const body = JSON.parse(bodyText) as ApifyErrorBody;
    type = body.error?.type ?? "";
    message = body.error?.message ?? "";
  } catch {
    message = bodyText;
  }
  const detail = scrubSecrets(message.replace(/\s+/g, " ").trim()).slice(0, 200);
  const actor = actorName(actorId);

  if (type === "max-total-charge-usd-below-minimum") {
    return new SourceError(
      `L'acteur Apify ${actor} exige un plafond de coût plus élevé : augmentez APIFY_MAX_CHARGE_USD (au moins 0.5).`,
      status,
    );
  }
  if (type === "run-failed" || type === "actor-run-failed") {
    if (/TIMED-OUT/i.test(message)) {
      return new SourceError(
        `L'acteur Apify ${actor} a dépassé son délai d'exécution : réessayez avec moins de mots-clés.`,
        status,
        true,
      );
    }
    return new SourceError(
      `L'exécution de l'acteur Apify ${actor} a échoué${detail ? ` (${detail})` : ""}. Réessayez plus tard.`,
      status,
      true,
    );
  }

  switch (status) {
    case 401:
      return new SourceError(
        "Jeton Apify invalide : vérifiez APIFY_TOKEN (console Apify → Settings → API & Integrations).",
        status,
      );
    case 402:
      if (type === "x402-payment-required") {
        return new SourceError("Jeton Apify manquant : renseignez APIFY_TOKEN.", status);
      }
      return new SourceError(
        "Crédit Apify épuisé ou limite d'usage mensuelle atteinte : rechargez votre compte ou relevez la limite (console Apify → Billing).",
        status,
      );
    case 403:
      return new SourceError(
        `Le jeton Apify n'a pas le droit de lancer ${actor} : utilisez un jeton sans restriction de portée.`,
        status,
      );
    case 404:
      return new SourceError(`Acteur Apify introuvable : ${actor}.`, status);
    case 408:
      return new SourceError(
        `L'acteur Apify ${actor} n'a pas répondu à temps (limite de 300 s) : réessayez plus tard ou avec moins de mots-clés.`,
        status,
        true,
      );
    case 429:
      return new SourceError("Trop de requêtes vers Apify : réessayez dans une minute.", status, true);
    case 400:
      return new SourceError(
        `Apify a refusé les paramètres envoyés à ${actor}${detail ? ` : ${detail}` : ""}.`,
        status,
      );
    default:
      if (status >= 500) {
        return new SourceError(`Apify est momentanément indisponible (${status}) : réessayez plus tard.`, status, true);
      }
      return new SourceError(`Apify a répondu ${status}${detail ? ` : ${detail}` : ""}.`, status);
  }
}

function isErrorRow(row: Record<string, unknown>): boolean {
  const error = row.error;
  return error !== undefined && error !== null && error !== false && error !== "";
}

/** Pure: splits a dataset into usable items and actor-reported error rows. */
export function splitApifyItems<T>(rows: unknown[]): ApifyRunResult<T> {
  const items: T[] = [];
  const errorRows: ApifyErrorRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (isErrorRow(record)) {
      const input = [record.input, record.inputUrl, record.searchQuery, record.url].find(
        (value): value is string => typeof value === "string" && value.length > 0,
      );
      errorRows.push({
        error: scrubSecrets(String(record.error)).slice(0, 200),
        errorDescription:
          typeof record.errorDescription === "string" ? scrubSecrets(record.errorDescription).slice(0, 200) : undefined,
        input,
      });
      continue;
    }
    items.push(record as T);
  }
  return { items, errorRows };
}

/**
 * Runs an Actor synchronously and returns its dataset, with error rows
 * separated out so connectors can mention them in a warning.
 */
export async function runApifyActorDetailed<T>(
  actorId: string,
  input: unknown,
  { token, signal, maxChargeUsd = DEFAULT_APIFY_MAX_CHARGE_USD, timeoutSecs = APIFY_ACTOR_TIMEOUT_SECS, fields }: ApifyRunOptions,
): Promise<ApifyRunResult<T>> {
  if (!token) throw new SourceError("Jeton Apify manquant : renseignez APIFY_TOKEN.");
  const url = buildApifyRunUrl(actorId, { timeoutSecs, maxChargeUsd, fields });

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...buildApifyRunInit(input, token),
      signal,
      // A little above the actor timeout so Apify can answer with what it has.
      timeoutMs: (timeoutSecs + 30) * 1000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof SourceError ? error.retryable : true;
    throw new SourceError(`Apify (${actorName(actorId)}) : ${scrubSecrets(message)}`, undefined, retryable);
  }

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // keep the status only
    }
    throw apifyError(response.status, bodyText, actorId);
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new SourceError(`Apify (${actorName(actorId)}) a renvoyé une réponse JSON invalide.`);
  }
  if (!Array.isArray(rows)) {
    throw new SourceError(`Apify (${actorName(actorId)}) a renvoyé un format inattendu (liste attendue).`);
  }
  return splitApifyItems<T>(rows);
}

/** Runs an Actor synchronously and returns its usable dataset items (error rows dropped). */
export async function runApifyActor<T>(actorId: string, input: unknown, options: ApifyRunOptions): Promise<T[]> {
  return (await runApifyActorDetailed<T>(actorId, input, options)).items;
}
