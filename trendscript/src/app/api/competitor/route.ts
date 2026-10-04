import { requireAuth } from "@/lib/server/auth";
import { runCompetitorAnalysis } from "@/lib/server/competitor";
import { parseJsonBody } from "@/lib/server/request";
import { competitorRequestSchema } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import type { CompetitorEvent, CompetitorRequest } from "@/lib/types";

/**
 * POST /api/competitor — analyses a creator from their handle: fetches their
 * real recent posts, computes statistics, then (when Claude is configured)
 * the qualitative analysis, streamed as Server-Sent Events. Without Claude the
 * report comes back in "stats" mode — never with invented content. Input
 * errors are plain JSON (400/401/413) returned before the stream opens.
 */

export const runtime = "nodejs";
// Apify scrapers (up to ~2 min) + a long structured analysis by Claude.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  // Handle + focus + creator profile: a few KB at most.
  const body = await parseJsonBody(request, competitorRequestSchema, 50_000);
  if (!body.ok) return body.response;
  const competitorRequest: CompetitorRequest = body.data;

  return sseResponse<CompetitorEvent>(
    request,
    async (send, signal) => {
      let resultSent = false;
      const report = await runCompetitorAnalysis(
        competitorRequest,
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
