import { getAnthropic } from "@/lib/server/ai/client";
import { generateScript } from "@/lib/server/ai/script";
import { requireAuth } from "@/lib/server/auth";
import { jsonError, parseJsonBody } from "@/lib/server/request";
import { scriptRequestSchema } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import type { ScriptEvent, ScriptRequest } from "@/lib/types";

/**
 * POST /api/script — writes (or refines) a short-video script with Claude and
 * streams research / writing progress, then the script, as Server-Sent
 * Events. Needs ANTHROPIC_API_KEY: there is no fake fallback.
 */

export const runtime = "nodejs";
// Optional web research + a long structured generation.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  if (!getAnthropic()) {
    return jsonError(
      "Génération de script indisponible : aucune clé Claude configurée. Ajoutez ANTHROPIC_API_KEY dans les variables d'environnement (voir Réglages), puis redémarrez l'application.",
      503,
    );
  }

  // Up to 100 evidence signals + a previous draft when refining.
  const body = await parseJsonBody(request, scriptRequestSchema, 2_000_000);
  if (!body.ok) return body.response;
  // The schema mirrors ScriptRequest; zod widens a few literal unions (durationSec).
  const scriptRequest = body.data as ScriptRequest;

  return sseResponse<ScriptEvent>(
    request,
    async (send, signal) => {
      let resultSent = false;
      const script = await generateScript(
        scriptRequest,
        (event) => {
          if (event.type === "result") resultSent = true;
          send(event);
        },
        signal,
      );
      // Whether or not the generator emitted it, the client gets exactly one result.
      if (!resultSent && !signal.aborted) send({ type: "result", script });
    },
    (message) => ({ type: "error", message }),
  );
}
