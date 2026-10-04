import { requireAuth } from "@/lib/server/auth";
import { parseJsonBody } from "@/lib/server/request";
import { runViralAnalysis } from "@/lib/server/viral";
import { viralRequestSchema } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import type { ViralEvent, ViralRequest } from "@/lib/types";

/**
 * POST /api/viral — "Ce qui cartonne": collects the niche's recent videos on
 * the requested platforms, reads their authors' followers, scores each video
 * against its creator's audience, then (when Claude is configured) extracts
 * the winning recipes, streamed as Server-Sent Events. Without Claude the
 * report comes back in "stats" mode — never with invented content. Input
 * errors are plain JSON (400/401/413) returned before the stream opens.
 */

export const runtime = "nodejs";
// Apify scrapers (up to ~2 min) + follower lookups + a long structured analysis by Claude.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  // Keywords + niche + creator profile: a few KB at most.
  const body = await parseJsonBody(request, viralRequestSchema, 50_000);
  if (!body.ok) return body.response;
  const viralRequest: ViralRequest = body.data;

  return sseResponse<ViralEvent>(
    request,
    async (send, signal) => {
      let resultSent = false;
      const report = await runViralAnalysis(
        viralRequest,
        (event) => {
          if (event.type === "result") resultSent = true;
          send(event);
        },
        signal,
      );
      // Whether or not the analysis emitted it, the client gets exactly one result.
      if (!resultSent && !signal.aborted) send({ type: "result", report });
    },
    (message) => ({ type: "error", message }),
  );
}
