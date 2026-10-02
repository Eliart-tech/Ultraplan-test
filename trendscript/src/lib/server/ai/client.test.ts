import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fakeClient,
  fallbackBlock,
  jsonMessage,
  message,
  refusalMessage,
  searchCall,
  textBlock,
  textMessage,
} from "./__fixtures__/anthropic";
import {
  AiError,
  aiModel,
  assertCompleted,
  cachedSystem,
  callStructured,
  DEFAULT_MODEL,
  describeAiError,
  FALLBACK_BETA,
  fallbackParams,
  finalText,
  getAnthropic,
  jsonOutputFormat,
  usedFallback,
} from "./client";
import { scriptOutputSchema } from "./script";
import { synthesisOutputSchema } from "./synthesize";

const apiBody = (message: string) => ({ type: "error", error: { type: "invalid_request_error", message } });

describe("aiModel", () => {
  it("defaults to Claude Opus 5.5 and honours ANTHROPIC_MODEL", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(aiModel({})).toBe("claude-opus-5-5");
    expect(aiModel({ ANTHROPIC_MODEL: "  claude-sonnet-5-5 " })).toBe("claude-sonnet-5-5");
    expect(aiModel({ ANTHROPIC_MODEL: "   " })).toBe("claude-opus-5-5");
  });
});

describe("getAnthropic", () => {
  it("returns null without an explicit key (mode sans IA)", () => {
    expect(getAnthropic({})).toBeNull();
    expect(getAnthropic({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    // Other credentials on the machine must not be picked up silently.
    expect(getAnthropic({ ANTHROPIC_AUTH_TOKEN: "token" })).toBeNull();
  });

  it("reuses one client per key", () => {
    const a = getAnthropic({ ANTHROPIC_API_KEY: "sk-ant-test-1" });
    expect(a).toBeInstanceOf(Anthropic);
    expect(getAnthropic({ ANTHROPIC_API_KEY: " sk-ant-test-1 " })).toBe(a);
    expect(getAnthropic({ ANTHROPIC_API_KEY: "sk-ant-test-2" })).not.toBe(a);
  });
});

describe("fallbackParams", () => {
  it.each(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5", "claude-sonnet-5-5"])(
    "enables the default server-side fallback on %s",
    (model) => {
      expect(fallbackParams(model)).toEqual({ betas: [FALLBACK_BETA], fallbacks: "default" });
    },
  );

  it.each(["claude-haiku-4-5", "claude-opus-4-8", "claude-sonnet-5", "claude-opus-5-5-20260101", "my-proxy-model"])(
    "sends no fallback fields for %s",
    (model) => {
      expect(fallbackParams(model)).toEqual({});
    },
  );

  it("uses the header of the 'default' scalar form", () => {
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
  });
});

describe("describeAiError", () => {
  const headers = new Headers();

  it.each<[string, unknown, string | RegExp]>([
    ["AiError", new AiError("Message déjà en français."), "Message déjà en français."],
    ["user abort", new Anthropic.APIUserAbortError(), "Génération annulée."],
    ["401", new Anthropic.AuthenticationError(401, apiBody("invalid x-api-key"), undefined, headers), /^Clé Claude invalide.*ANTHROPIC_API_KEY/],
    ["403", new Anthropic.PermissionDeniedError(403, apiBody("no access"), undefined, headers), /^Accès refusé par l'API Claude \(403\)/],
    ["404", new Anthropic.NotFoundError(404, apiBody("model: x"), undefined, headers), /^Modèle Claude introuvable : vérifiez ANTHROPIC_MODEL/],
    ["429", new Anthropic.RateLimitError(429, apiBody("slow down"), undefined, headers), "Limite de requêtes Claude atteinte : réessayez dans une minute."],
    ["timeout", new Anthropic.APIConnectionTimeoutError(), "Claude n'a pas répondu à temps : réessayez."],
    ["network", new Anthropic.APIConnectionError({ message: "ECONNRESET" }), /erreur réseau/],
    ["529", new Anthropic.InternalServerError(529, apiBody("Overloaded"), undefined, headers), /^API Claude surchargée ou indisponible \(529\)/],
    ["409", new Anthropic.ConflictError(409, apiBody("conflict"), undefined, headers), "Erreur de l'API Claude (409) : conflict"],
    ["SDK parsing error", new Anthropic.AnthropicError("bad stream"), "Réponse de Claude inexploitable : réessayez."],
    ["plain Error", new Error("boom"), "boom"],
    ["non-error", "oops", "Erreur inattendue pendant l'appel à Claude."],
    ["empty Error", new Error(""), "Erreur inattendue pendant l'appel à Claude."],
  ])("maps %s to a French message", (_name, error, expected) => {
    const description = describeAiError(error);
    if (typeof expected === "string") expect(description).toBe(expected);
    else expect(description).toMatch(expected);
  });

  it("quotes the API's own message on a 400, collapsed and capped at 300 characters", () => {
    const error = new Anthropic.BadRequestError(400, apiBody(`max_tokens:\n  trop   grand ${"x".repeat(400)}`), undefined, headers);
    const description = describeAiError(error);
    expect(description.startsWith("Requête refusée par l'API Claude (400) : max_tokens: trop grand xxx")).toBe(true);
    expect(description.length).toBe("Requête refusée par l'API Claude (400) : ".length + 300);
  });

  it("falls back to the SDK message when the body has no nested error", () => {
    // The SDK prefixes its own message with the status.
    const error = new Anthropic.BadRequestError(400, undefined, "raw message", headers);
    expect(describeAiError(error)).toBe("Requête refusée par l'API Claude (400) : 400 raw message");
  });
});

describe("assertCompleted", () => {
  it("accepts a normal end", () => {
    expect(() => assertCompleted(textMessage("ok"), "la tâche", "astuce")).not.toThrow();
    expect(() => assertCompleted(textMessage("ok", "stop_sequence"), "la tâche", "astuce")).not.toThrow();
  });

  it("turns a refusal into a French error with the explanation when there is one", () => {
    expect(() => assertCompleted(refusalMessage("Catégorie cyber."), "l'écriture du script", "x")).toThrow(
      new AiError("Claude a refusé l'écriture du script (Catégorie cyber.). Reformulez vos consignes ou choisissez un autre sujet."),
    );
    expect(() => assertCompleted(refusalMessage(null), "la synthèse", "x")).toThrow(
      "Claude a refusé la synthèse. Reformulez vos consignes ou choisissez un autre sujet.",
    );
    expect(() => assertCompleted(message([], "refusal"), "la synthèse", "x")).toThrow(/^Claude a refusé la synthèse\./);
  });

  it.each(["max_tokens", "model_context_window_exceeded"] as const)("reports a truncated answer (%s) with the hint", (reason) => {
    expect(() => assertCompleted(textMessage("{", reason), "la synthèse", "demandez moins de sujets.")).toThrow(
      "Réponse de Claude tronquée (limite de longueur atteinte) pendant la synthèse : demandez moins de sujets.",
    );
  });

  it("reports any other stop reason as incomplete", () => {
    expect(() => assertCompleted(textMessage("", "pause_turn"), "la recherche", "x")).toThrow(
      "Réponse de Claude incomplète pendant la recherche (arrêt « pause_turn ») : réessayez.",
    );
    expect(() => assertCompleted(textMessage("", null), "la recherche", "x")).toThrow(/arrêt « inconnu »/);
  });

  it("throws AiError instances (already user-facing)", () => {
    expect(() => assertCompleted(refusalMessage(null), "t", "x")).toThrow(AiError);
  });
});

describe("finalText / usedFallback", () => {
  it("joins the text blocks and ignores the other blocks", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" } as const,
      textBlock("Bonjour "),
      searchCall("srv_1", "q"),
      textBlock("le monde"),
    ];
    expect(finalText(content)).toBe("Bonjour le monde");
    expect(usedFallback(message(content))).toBe(false);
  });

  it("keeps only what follows the last fallback switch point", () => {
    const content = [
      textBlock("partiel du modèle 1"),
      fallbackBlock("claude-opus-5-5", "claude-opus-5"),
      textBlock("partiel du modèle 2"),
      fallbackBlock("claude-opus-5", "claude-opus-4-8"),
      textBlock("réponse finale"),
    ];
    expect(finalText(content)).toBe("réponse finale");
    expect(usedFallback(message(content))).toBe(true);
  });

  it("returns an empty string without text", () => {
    expect(finalText([])).toBe("");
  });
});

describe("cachedSystem", () => {
  it("marks only the first (stable) block for caching", () => {
    expect(cachedSystem("stable", "variable")).toEqual([
      { type: "text", text: "stable", cache_control: { type: "ephemeral" } },
      { type: "text", text: "variable" },
    ]);
    expect(cachedSystem()).toEqual([]);
  });
});

type JsonNode = Record<string, unknown>;

/** Every JSON-schema object node, depth first. */
function objectNodes(node: unknown, out: JsonNode[] = []): JsonNode[] {
  if (Array.isArray(node)) node.forEach((child) => objectNodes(child, out));
  else if (node && typeof node === "object") {
    const record = node as JsonNode;
    if (record.type === "object") out.push(record);
    Object.values(record).forEach((child) => objectNodes(child, out));
  }
  return out;
}

const FORBIDDEN_KEYWORDS = ["minimum", "maximum", "minLength", "maxLength", "pattern", "maxItems", "multipleOf", "default", "$schema"];

function keywordsUsed(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => keywordsUsed(child, out));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && value && typeof value === "object") {
        Object.values(value).forEach((child) => keywordsUsed(child, out));
      } else {
        out.add(key);
        keywordsUsed(value, out);
      }
    }
  }
  return out;
}

describe("jsonOutputFormat", () => {
  const schema = z.object({
    title: z.string().min(3).max(70).describe("Titre"),
    score: z.number().int().min(0).max(100),
    level: z.enum(["faible", "moyenne", "elevee"]),
    url: z.string().regex(/^https?:/).nullable(),
    tags: z.array(z.string()).min(1).max(5),
    pair: z.array(z.number()).min(2),
    nested: z.object({ pattern: z.string(), default: z.boolean().default(false) }),
    note: z.string().optional(),
  });
  const format = jsonOutputFormat(schema);

  it("returns a json_schema output format", () => {
    expect(format.type).toBe("json_schema");
  });

  it("closes every object and requires every property", () => {
    const objects = objectNodes(format.schema);
    expect(objects.length).toBe(2);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties as JsonNode));
    }
    expect((format.schema.required as string[]).sort()).toEqual(
      ["level", "nested", "note", "pair", "score", "tags", "title", "url"].sort(),
    );
  });

  it("strips the constraints the grammar rejects, but not properties that share their names", () => {
    const used = keywordsUsed(format.schema);
    for (const keyword of FORBIDDEN_KEYWORDS) expect(used.has(keyword), keyword).toBe(false);
    const nested = (format.schema.properties as Record<string, JsonNode>).nested;
    expect(Object.keys(nested.properties as JsonNode)).toEqual(["pattern", "default"]);
  });

  it("keeps enums, descriptions, nullability and minItems ≤ 1", () => {
    const properties = format.schema.properties as Record<string, JsonNode>;
    expect(properties.level.enum).toEqual(["faible", "moyenne", "elevee"]);
    expect(properties.title.description).toBe("Titre");
    expect(JSON.stringify(properties.url)).toContain('"null"');
    expect(properties.tags.minItems).toBe(1);
    expect(properties.pair.minItems).toBeUndefined();
  });

  it.each([
    ["script", scriptOutputSchema],
    ["synthesis", synthesisOutputSchema],
  ])("produces a strict schema for the %s output", (_name, outputSchema) => {
    const { schema: json } = jsonOutputFormat(outputSchema);
    for (const object of objectNodes(json)) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties as JsonNode));
    }
    const used = keywordsUsed(json);
    for (const keyword of FORBIDDEN_KEYWORDS) expect(used.has(keyword), keyword).toBe(false);
  });
});

describe("callStructured", () => {
  const schema = z.object({ answer: z.string(), count: z.number() });
  const base = {
    model: "claude-opus-5-5",
    system: ["stable", "variable"],
    user: "question",
    schema,
    effort: "high" as const,
    maxTokens: 32_000,
    task: "la tâche de test",
    tooLongHint: "raccourcissez.",
  };

  it("sends one streamed request with adaptive thinking, explicit effort, a JSON format and the fallback", async () => {
    const { client, calls } = fakeClient([jsonMessage({ answer: "oui", count: 2 })]);
    const controller = new AbortController();
    const result = await callStructured({ ...base, client, signal: controller.signal });

    expect(result).toMatchObject({ data: { answer: "oui", count: 2 }, model: "claude-opus-5-5", fellBack: false });
    expect(calls).toHaveLength(1);
    const { params, options } = calls[0];
    expect(options?.signal).toBe(controller.signal);
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 32_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
      system: cachedSystem("stable", "variable"),
      messages: [{ role: "user", content: "question" }],
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    // Rejected by this model family: never sent.
    for (const key of ["temperature", "top_p", "top_k", "tools"]) expect(params).not.toHaveProperty(key);
    expect(params.thinking).not.toHaveProperty("budget_tokens");
  });

  it("omits the fallback fields for a model that does not support them", async () => {
    const { client, calls } = fakeClient([jsonMessage({ answer: "oui", count: 2 })]);
    await callStructured({ ...base, model: "claude-haiku-4-5", client, signal: new AbortController().signal });
    expect(calls[0].params).not.toHaveProperty("betas");
    expect(calls[0].params).not.toHaveProperty("fallbacks");
  });

  it("reports progress every 200 characters and once more at the end", async () => {
    const long = { answer: "x".repeat(500), count: 1 };
    const total = JSON.stringify(long).length;
    const { client } = fakeClient([jsonMessage(long)]);
    const progress: number[] = [];
    await callStructured({ ...base, client, signal: new AbortController().signal, onProgress: (n) => progress.push(n) });
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(progress.at(-1)).toBe(total);
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThan(progress[i - 1]);
    for (let i = 1; i < progress.length - 1; i++) expect(progress[i] - progress[i - 1]).toBeGreaterThanOrEqual(200);
  });

  it("parses only the answer that follows a fallback switch point and reports the serving model", async () => {
    const { client } = fakeClient([
      message(
        [textBlock('{"answer": "par'), fallbackBlock("claude-opus-5-5", "claude-opus-5"), textBlock('{"answer":"secours","count":1}')],
        "end_turn",
        { model: "claude-opus-5" },
      ),
    ]);
    const result = await callStructured({ ...base, client, signal: new AbortController().signal });
    expect(result).toMatchObject({ data: { answer: "secours", count: 1 }, model: "claude-opus-5", fellBack: true });
  });

  it("checks stop_reason before reading the content", async () => {
    const refusal = fakeClient([refusalMessage("Hors politique d'usage.")]);
    await expect(callStructured({ ...base, client: refusal.client, signal: new AbortController().signal })).rejects.toThrow(
      "Claude a refusé la tâche de test (Hors politique d'usage.).",
    );

    const truncated = fakeClient([textMessage('{"answer": "tron', "max_tokens")]);
    await expect(callStructured({ ...base, client: truncated.client, signal: new AbortController().signal })).rejects.toThrow(
      "Réponse de Claude tronquée (limite de longueur atteinte) pendant la tâche de test : raccourcissez.",
    );
  });

  it("rejects invalid JSON and JSON that does not match the schema with French errors", async () => {
    const invalid = fakeClient([textMessage("pas du JSON")]);
    await expect(callStructured({ ...base, client: invalid.client, signal: new AbortController().signal })).rejects.toThrow(
      new AiError("Réponse de Claude illisible (JSON invalide) pendant la tâche de test : réessayez."),
    );

    const wrong = fakeClient([jsonMessage({ answer: "oui", count: "deux" })]);
    await expect(callStructured({ ...base, client: wrong.client, signal: new AbortController().signal })).rejects.toThrow(
      /^Réponse de Claude incomplète pendant la tâche de test \(champ « count » : .+\) : réessayez\.$/,
    );
  });

  it("lets SDK errors through for the caller to describe", async () => {
    const error = new Anthropic.RateLimitError(429, apiBody("slow"), undefined, new Headers());
    const { client } = fakeClient([error]);
    await expect(callStructured({ ...base, client, signal: new AbortController().signal })).rejects.toBe(error);
  });
});
