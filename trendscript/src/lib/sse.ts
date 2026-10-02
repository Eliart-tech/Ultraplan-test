/**
 * Server-Sent Events over a plain fetch() POST: the server streams
 * `data: <json>\n\n` frames, the browser parses them with `readSse`.
 * Shared by /api/analyze and /api/script.
 */

const HEARTBEAT_MS = 15_000;

/** Server side: run `task`, streaming every event it emits. */
export function sseResponse<E extends { type: string }>(
  request: Request,
  task: (send: (event: E) => void, signal: AbortSignal) => Promise<void>,
  toErrorEvent: (message: string) => E,
): Response {
  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (event: E) => write(`data: ${JSON.stringify(event)}\n\n`);
      // Comment frames keep proxies from closing an idle connection while
      // Claude is thinking.
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      try {
        await task(send, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur inattendue";
        console.error("[sse]", error);
        send(toErrorEvent(message));
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by a client abort
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Browser side: parse an SSE response body and dispatch each JSON event. */
export async function readSse<E>(response: Response, onEvent: (event: E) => void): Promise<void> {
  if (!response.body) throw new Error("Réponse vide du serveur");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as E);
      boundary = buffer.indexOf("\n\n");
    }
  }
}
