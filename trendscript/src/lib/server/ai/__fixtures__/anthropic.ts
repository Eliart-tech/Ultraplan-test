/**
 * Test fixtures only — never imported by app code. A scripted stand-in for
 * the Anthropic client: `beta.messages.stream()` returns the next queued
 * message (or throws the next queued error) and records every request, so
 * the Claude pipelines can be tested without network or API key.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
  BetaRefusalStopDetails,
  BetaStopReason,
  BetaTextBlock,
  BetaTextCitation,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages";

export function textBlock(text: string, citations: BetaTextCitation[] | null = null): BetaTextBlock {
  return { type: "text", text, citations };
}

export function citation(url: string, title: string | null = "Titre cité"): BetaTextCitation {
  return { type: "web_search_result_location", url, title, cited_text: "…", encrypted_index: "idx" };
}

export function searchCall(id: string, query: string): BetaContentBlock {
  return { type: "server_tool_use", id, name: "web_search", input: { query } } as BetaContentBlock;
}

export function searchResults(toolUseId: string, results: { url: string; title?: string }[]): BetaContentBlock {
  return {
    type: "web_search_tool_result",
    tool_use_id: toolUseId,
    content: results.map((r) => ({
      type: "web_search_result",
      url: r.url,
      title: r.title ?? "",
      encrypted_content: "enc",
      page_age: null,
    })),
  };
}

export function searchError(toolUseId: string, errorCode: string): BetaContentBlock {
  return {
    type: "web_search_tool_result",
    tool_use_id: toolUseId,
    content: { type: "web_search_tool_result_error", error_code: errorCode },
  } as BetaContentBlock;
}

export function fallbackBlock(from: string, to: string): BetaContentBlock {
  return { type: "fallback", from: { model: from }, to: { model: to }, trigger: { type: "refusal", category: "cyber" } };
}

const USAGE = {
  cache_creation: null,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  fallback_credit: null,
  inference_geo: null,
  input_tokens: 100,
  iterations: null,
  output_tokens: 50,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: "standard",
} satisfies BetaUsage;

export function message(
  content: BetaContentBlock[],
  stopReason: BetaStopReason | null = "end_turn",
  extra: Partial<BetaMessage> = {},
): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    container: null,
    context_management: null,
    diagnostics: null,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: USAGE,
    ...extra,
  };
}

export function textMessage(text: string, stopReason: BetaStopReason | null = "end_turn"): BetaMessage {
  return message([textBlock(text)], stopReason);
}

export function jsonMessage(data: unknown): BetaMessage {
  return textMessage(JSON.stringify(data));
}

export function refusalMessage(explanation: string | null): BetaMessage {
  const details = { type: "refusal", category: "cyber", explanation } as BetaRefusalStopDetails;
  return message([], "refusal", { stop_details: details });
}

export interface FakeCall {
  /** Shallow copy taken at call time (`messages` is copied: callers may push to it afterwards). */
  params: BetaMessageStreamParams;
  options?: { signal?: AbortSignal };
}

export type FakeTurn = BetaMessage | Error;

/** Size of the text deltas the fake stream emits. */
const DELTA = 64;

export function fakeClient(turns: FakeTurn[]): { client: Anthropic; calls: FakeCall[] } {
  const queue = [...turns];
  const calls: FakeCall[] = [];
  const stream = (params: BetaMessageStreamParams, options?: { signal?: AbortSignal }) => {
    calls.push({ params: { ...params, messages: [...params.messages] }, options });
    const turn = queue.shift();
    const listeners: ((delta: string, snapshot: string) => void)[] = [];
    return {
      on(event: string, listener: (delta: string, snapshot: string) => void) {
        if (event === "text") listeners.push(listener);
        return this;
      },
      async finalMessage(): Promise<BetaMessage> {
        if (!turn) throw new Error("fakeClient: no response queued for this call");
        if (turn instanceof Error) throw turn;
        let snapshot = "";
        for (const block of turn.content) {
          if (block.type !== "text") continue;
          for (let i = 0; i < block.text.length; i += DELTA) {
            const delta = block.text.slice(i, i + DELTA);
            snapshot += delta;
            for (const listener of listeners) listener(delta, snapshot);
          }
        }
        return turn;
      },
    };
  };
  const client = { beta: { messages: { stream } } } as unknown as Anthropic;
  return { client, calls };
}
