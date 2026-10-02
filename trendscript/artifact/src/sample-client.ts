/**
 * The subset of the Anthropic SDK used by `callStructured` — just
 * `beta.messages.stream(params, { signal })` → `{ on("text"), finalMessage() }`
 * — answered by Claude on the viewer's claude.ai account through the
 * `sample` capability. The server pipeline (prompts, zod validation, code
 * checks) runs unchanged on top of it.
 *
 * `sample` has no system prompt and no structured-output grammar: the system
 * blocks and the user turn become one prompt, and when the request carries a
 * JSON schema the prompt ends with a French instruction to answer with only a
 * JSON object conforming to it. The JSON is then extracted from the reply.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages";
import { AiError } from "@/lib/server/ai/client";
import { getSample, updateEditionState, type SampleError, type SampleFn } from "./capabilities";
import { AI_MODEL_LABEL } from "./edition";

/** Input cap of `sample` is 256 KiB of UTF-8 text; keep a margin. */
const MAX_PROMPT_BYTES = 250_000;

type TextBlockLike = { type: string; text?: string };
type ContentLike = string | TextBlockLike[] | undefined;

interface StreamParamsLike {
  system?: ContentLike;
  messages?: { role: string; content: ContentLike }[];
  output_config?: { format?: { type?: string; schema?: unknown } | null };
}

function textOf(content: ContentLike): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
}

export function jsonInstruction(schema: unknown): string {
  return `FORMAT DE LA RÉPONSE — obligatoire. Ta réponse est lue par un programme : réponds UNIQUEMENT avec un objet JSON valide conforme au schéma JSON ci-dessous. Aucun texte avant ou après, pas de bloc de code Markdown, pas de commentaire. Toutes les propriétés du schéma sont obligatoires, aucune autre n'est admise ; pour une énumération, recopie exactement l'une des valeurs autorisées (sans ajouter d'accent) ; un champ « nullable » vaut null quand tu n'as rien.

<schema_json>
${JSON.stringify(schema)}
</schema_json>`;
}

/** System blocks + turns (+ JSON instruction) → one `sample` prompt. */
export function buildSamplePrompt(params: StreamParamsLike): string {
  const system = textOf(params.system).trim();
  const turns = (params.messages ?? []).map((message) => textOf(message.content).trim()).filter(Boolean);
  const parts: string[] = [];
  if (system) parts.push(`<consignes>\n${system}\n</consignes>`);
  parts.push(...turns);
  const format = params.output_config?.format;
  if (format?.type === "json_schema") parts.push(jsonInstruction(format.schema));
  return parts.join("\n\n");
}

/**
 * The JSON object of a reply: the whole text when it parses, else the body
 * of a ```json fence, else from the first "{" to its matching "}".
 * Returns the text unchanged when nothing parses (the caller reports it).
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const start = trimmed.indexOf("{");
  if (start !== -1) {
    const end = matchingBrace(trimmed, start);
    if (end !== -1) candidates.push(trimmed.slice(start, end + 1));
    const last = trimmed.lastIndexOf("}");
    if (last > start) candidates.push(trimmed.slice(start, last + 1));
  }
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === "object") return candidate;
    } catch {
      // try the next candidate
    }
  }
  return trimmed;
}

/** Index of the "}" closing the object opened at `start` (string-aware), or -1. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function isSampleError(value: unknown): value is SampleError {
  return Boolean(value) && typeof value === "object" && typeof (value as SampleError).code === "string";
}

/** Codes after which Claude stays unavailable for the rest of this view. */
const PERMANENT = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);

/** French, user-facing message for a `sample` rejection. */
export function describeSampleError(error: unknown): string {
  if (!isSampleError(error)) {
    return error instanceof Error && error.message ? error.message : "Erreur inattendue pendant l'appel à Claude.";
  }
  switch (error.code) {
    case "not_granted":
      return "Vous n'avez pas autorisé cette page à utiliser Claude sur votre compte claude.ai. Rechargez la page pour qu'elle vous le redemande.";
    case "sampling_disabled":
      return "Claude n'est pas disponible pour ce compte ou cette organisation claude.ai.";
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      return "Claude n'est pas disponible dans cette vue de claude.ai.";
    case "rate_limited":
      return "Limite d'utilisation de Claude atteinte sur votre compte claude.ai : réessayez dans quelques minutes.";
    case "session_expired":
      return "Votre session claude.ai a expiré : reconnectez-vous à claude.ai, puis réessayez.";
    case "refused":
      return "Claude a refusé cette demande : reformulez vos consignes ou choisissez un autre sujet.";
    case "empty_completion":
      return "Claude n'a renvoyé aucune réponse : réessayez.";
    case "prompt_too_large":
      return "Demande trop volumineuse pour Claude : sélectionnez moins de sources ou de sujets, puis réessayez.";
    case "tools_unavailable":
      return "Cette vue de claude.ai ne permet pas à Claude d'utiliser des outils : recherche web impossible.";
    case "cancelled":
      return "Génération annulée.";
    case "invalid_request":
    case "transform_error":
    case "queue_overflow":
      return `Requête refusée par claude.ai (${error.message.slice(0, 200)}).`;
    default:
      return "Claude est momentanément indisponible (erreur du service) : réessayez dans quelques instants.";
  }
}

/** Short French reason, for the banner and the script 503, once Claude is refused for this view. */
const BLOCKED_NOTES: Record<string, string> = {
  not_granted: "accès à Claude refusé pour cette page — rechargez-la pour l'autoriser",
  sampling_disabled: "Claude non disponible pour ce compte claude.ai",
};

/** Turns any `sample` rejection into a French AiError (and remembers permanent refusals). */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const message = describeSampleError(error);
  if (isSampleError(error) && PERMANENT.has(error.code)) {
    updateEditionState({ claude: "blocked", claudeNote: BLOCKED_NOTES[error.code] ?? "Claude indisponible dans cette vue" });
  }
  return new AiError(message);
}

type TextListener = (delta: string, snapshot: string) => void;

class SampleMessageStream {
  private readonly listeners = new Set<TextListener>();
  private readonly result: Promise<BetaMessage>;

  constructor(sample: SampleFn, params: StreamParamsLike, signal: AbortSignal | undefined) {
    this.result = this.run(sample, params, signal);
    // Callers always await finalMessage(); avoid an unhandled rejection if one doesn't.
    this.result.catch(() => undefined);
  }

  on(event: string, listener: TextListener): this {
    if (event === "text") this.listeners.add(listener);
    return this;
  }

  finalMessage(): Promise<BetaMessage> {
    return this.result;
  }

  private async run(sample: SampleFn, params: StreamParamsLike, signal: AbortSignal | undefined): Promise<BetaMessage> {
    const prompt = buildSamplePrompt(params);
    if (new TextEncoder().encode(prompt).byteLength > MAX_PROMPT_BYTES) {
      throw new AiError("Demande trop volumineuse pour Claude : sélectionnez moins de sources ou de sujets, puis réessayez.");
    }
    let text: string;
    let truncated: boolean;
    try {
      ({ text, truncated } = await sample(prompt, {
        onText: ({ delta, text: snapshot }) => {
          for (const listener of this.listeners) listener(delta, snapshot);
        },
        signal,
        modelTier: "complex",
        cache: false,
      }));
    } catch (error) {
      throw toAiError(error);
    }
    const wantsJson = params.output_config?.format?.type === "json_schema";
    const message = {
      id: `msg_claudeai_${Math.random().toString(36).slice(2, 12)}`,
      type: "message",
      role: "assistant",
      model: AI_MODEL_LABEL,
      content: [{ type: "text", text: wantsJson ? extractJson(text) : text, citations: null }],
      stop_reason: truncated ? "max_tokens" : "end_turn",
      stop_sequence: null,
      stop_details: null,
      container: null,
      context_management: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    return message as unknown as BetaMessage;
  }
}

/**
 * A claude.ai-backed stand-in for the Anthropic client, or null when the
 * `sample` capability is absent or was refused for this view.
 */
export async function getClaudeClient(): Promise<Anthropic | null> {
  const sample = await getSample();
  if (!sample) return null;
  const client = {
    beta: {
      messages: {
        stream(params: StreamParamsLike, options?: { signal?: AbortSignal }) {
          return new SampleMessageStream(sample, params, options?.signal);
        },
      },
    },
  };
  return client as unknown as Anthropic;
}
