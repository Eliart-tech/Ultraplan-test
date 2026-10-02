import { runAnalysis } from "@/lib/server/analyze";
import { requireAuth } from "@/lib/server/auth";
import { parseJsonBody } from "@/lib/server/request";
import { analyzeRequestSchema } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import type { AnalyzeEvent } from "@/lib/types";

/**
 * POST /api/analyze — fetches the chosen sources and streams progress, then
 * the analysis, as Server-Sent Events. Input errors are plain JSON (400/401)
 * returned before the stream opens.
 */

export const runtime = "nodejs";
// Sources (Apify up to ~2 min) + Claude synthesis.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const body = await parseJsonBody(request, analyzeRequestSchema, 50_000);
  if (!body.ok) return body.response;

  return sseResponse<AnalyzeEvent>(
    request,
    async (send, signal) => {
      // runAnalysis emits the final `result` event itself.
      await runAnalysis(body.data, send, signal);
    },
    (message) => ({ type: "error", message }),
  );
}
