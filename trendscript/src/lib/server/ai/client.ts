/**
 * Claude client and shared call conventions (server-only).
 *
 * - Model `claude-opus-5-5` by default (override: ANTHROPIC_MODEL). Thinking
 *   is always adaptive on this model; depth is set with `output_config.effort`
 *   (its default is "medium", so every call sets it explicitly). No
 *   temperature / top_p / prefill: they are rejected.
 * - Server-side refusal fallback (`fallbacks: "default"`) so a classifier
 *   false positive does not become an outage.
 * - Long calls are streamed (`beta.messages.stream` + `finalMessage()`), with
 *   the size of generated text forwarded as progress.
 * - `stop_reason` is checked before reading content; Claude's JSON is
 *   re-validated with zod.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaJSONOutputFormat,
  BetaMessage,
  BetaMessageStreamParams,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";
import type { Env } from "../sources/types";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Server-side refusal fallback, "default" routing (Anthropic picks the model per refusal category). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const FALLBACKS = "default" as const;

/** Models documented as accepting `fallbacks: "default"`; other overrides run without it. */
const FALLBACK_MODELS = /^claude-(opus-5(-5)?|fable-5(-1)?|sonnet-5-5)$/;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function aiModel(env: Env = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

const clients = new Map<string, Anthropic>();

/**
 * Claude client, or null when ANTHROPIC_API_KEY is not set ("mode sans IA").
 * Only the explicit key counts: the app must not silently pick up a developer
 * profile from the machine it runs on.
 */
export function getAnthropic(env: Env = process.env): Anthropic | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({ apiKey, maxRetries: 2 });
    clients.set(apiKey, client);
  }
  return client;
}

/** `betas` + `fallbacks` request fields for models that support the default fallback. */
export function fallbackParams(model: string): Pick<BetaMessageStreamParams, "betas" | "fallbacks"> {
  return FALLBACK_MODELS.test(model) ? { betas: [FALLBACK_BETA], fallbacks: FALLBACKS } : {};
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An error whose message is already a French, user-facing sentence. */
export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

function apiMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const raw = typeof body?.error?.message === "string" ? body.error.message : error.message;
  return raw.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** French, actionable description of any error thrown while calling Claude. */
export function describeAiError(error: unknown): string {
  if (error instanceof AiError) return error.message;
  // Order matters: abort and timeout errors are subclasses of APIError.
  if (error instanceof Anthropic.APIUserAbortError) return "Génération annulée.";
  if (error instanceof Anthropic.AuthenticationError) {
    return "Clé Claude invalide ou révoquée : vérifiez ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "Accès refusé par l'API Claude (403) : la clé n'a pas accès à ce modèle ou à cette fonctionnalité (la recherche web doit être autorisée dans la console Anthropic). Vérifiez ANTHROPIC_API_KEY et ANTHROPIC_MODEL.";
  }
  if (error instanceof Anthropic.NotFoundError) {
    return "Modèle Claude introuvable : vérifiez ANTHROPIC_MODEL (ou supprimez-la pour utiliser le modèle par défaut).";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Limite de requêtes Claude atteinte : réessayez dans une minute.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `Requête refusée par l'API Claude (400) : ${apiMessage(error)}`;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "Claude n'a pas répondu à temps : réessayez.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Impossible de joindre l'API Claude (erreur réseau) : réessayez.";
  }
  if (error instanceof Anthropic.InternalServerError) {
    return `API Claude surchargée ou indisponible (${error.status}) : réessayez dans quelques instants.`;
  }
  if (error instanceof Anthropic.APIError) {
    return `Erreur de l'API Claude${error.status ? ` (${error.status})` : ""} : ${apiMessage(error)}`;
  }
  if (error instanceof Anthropic.AnthropicError) {
    return "Réponse de Claude inexploitable : réessayez.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Erreur inattendue pendant l'appel à Claude.";
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Throws a French AiError unless the message finished normally. Must run
 * before reading `content`: a refusal or a truncated answer is not usable.
 */
export function assertCompleted(message: BetaMessage, task: string, tooLongHint: string): void {
  switch (message.stop_reason) {
    case "end_turn":
    case "stop_sequence":
      return;
    case "refusal": {
      const explanation = message.stop_details?.explanation?.trim();
      throw new AiError(
        `Claude a refusé ${task}${explanation ? ` (${explanation})` : ""}. Reformulez vos consignes ou choisissez un autre sujet.`,
      );
    }
    case "max_tokens":
    case "model_context_window_exceeded":
      throw new AiError(`Réponse de Claude tronquée (limite de longueur atteinte) pendant ${task} : ${tooLongHint}`);
    default:
      throw new AiError(`Réponse de Claude incomplète pendant ${task} (arrêt « ${message.stop_reason ?? "inconnu"} ») : réessayez.`);
  }
}

/**
 * Text of the final answer. With a server-side fallback, output produced by
 * the declining model before the `fallback` block is a discarded partial:
 * only blocks after the last switch point count.
 */
export function finalText(content: BetaContentBlock[]): string {
  let start = 0;
  content.forEach((block, index) => {
    if (block.type === "fallback") start = index + 1;
  });
  return content
    .slice(start)
    .filter((block): block is Extract<BetaContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function usedFallback(message: BetaMessage): boolean {
  return message.content.some((block) => block.type === "fallback");
}

/** System prompt as one cached block (stable playbook material). */
export function cachedSystem(...texts: string[]): BetaTextBlockParam[] {
  return texts.map((text, index) =>
    index === 0 ? { type: "text", text, cache_control: { type: "ephemeral" } } : { type: "text", text },
  );
}

// ---------------------------------------------------------------------------
// Structured outputs
// ---------------------------------------------------------------------------

/** JSON-schema keywords the structured-outputs grammar does not accept. */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "maxItems",
  "uniqueItems",
  "default",
]);

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "minItems" && typeof value === "number" && value > 1) continue;
    if ((key === "properties" || key === "$defs") && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, strictify(child)]));
    } else {
      out[key] = strictify(value);
    }
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    out.required = Object.keys((out.properties as Record<string, unknown> | undefined) ?? {});
  }
  return out;
}

/**
 * `output_config.format` from a zod schema. Built with zod's own JSON-schema
 * export instead of the SDK's `betaZodOutputFormat`, whose transform (SDK
 * 0.131) demotes `enum` to a description — we want enums enforced by the
 * grammar. Numeric/length constraints are stripped (unsupported) and
 * re-checked by zod after parsing; every object is closed and fully required.
 */
export function jsonOutputFormat(schema: z.ZodType): BetaJSONOutputFormat {
  const jsonSchema = strictify(z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" })) as Record<string, unknown>;
  return { type: "json_schema", schema: jsonSchema };
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "format inattendu";
  const path = issue.path.join(".");
  return path ? `champ « ${path} » : ${issue.message}` : issue.message;
}

/** Characters of generated text between two progress events. */
const PROGRESS_STEP = 200;

export interface StructuredCall<T> {
  client: Anthropic;
  model: string;
  /** Stable part first (cached), then request-specific parts. */
  system: string[];
  user: string;
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
  signal: AbortSignal;
  /** French noun phrase used in errors: "l'écriture du script". */
  task: string;
  /** French advice when the answer is truncated. */
  tooLongHint: string;
  onProgress?: (chars: number) => void;
}

export interface StructuredResult<T> {
  data: T;
  message: BetaMessage;
  /** Model that actually produced the answer (differs after a fallback). */
  model: string;
  fellBack: boolean;
}

/** One streamed structured-output call: stop_reason check, JSON parse, zod validation. */
export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const stream = call.client.beta.messages.stream(
    {
      model: call.model,
      max_tokens: call.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: call.effort, format: jsonOutputFormat(call.schema) },
      system: cachedSystem(...call.system),
      messages: [{ role: "user", content: call.user }],
      ...fallbackParams(call.model),
    },
    { signal: call.signal },
  );

  let chars = 0;
  let reported = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    if (call.onProgress && chars - reported >= PROGRESS_STEP) {
      reported = chars;
      call.onProgress(chars);
    }
  });

  const message = await stream.finalMessage();
  if (call.onProgress && chars > reported) call.onProgress(chars);
  assertCompleted(message, call.task, call.tooLongHint);

  let json: unknown;
  try {
    json = JSON.parse(finalText(message.content));
  } catch {
    throw new AiError(`Réponse de Claude illisible (JSON invalide) pendant ${call.task} : réessayez.`);
  }
  const parsed = call.schema.safeParse(json);
  if (!parsed.success) {
    throw new AiError(`Réponse de Claude incomplète pendant ${call.task} (${describeIssue(parsed.error)}) : réessayez.`);
  }
  return { data: parsed.data, message, model: message.model, fellBack: usedFallback(message) };
}
