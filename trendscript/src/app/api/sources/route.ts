import { aiModel, getAnthropic } from "@/lib/server/ai/client";
import { isAuthEnabled, requireAuth } from "@/lib/server/auth";
import { creatorCapabilities } from "@/lib/server/creators";
import { getSourceStatuses } from "@/lib/server/sources";

/**
 * GET /api/sources — which sources and features this server has configured.
 * Booleans and public metadata only: never a key or token value.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  return Response.json(
    {
      sources: getSourceStatuses(process.env),
      ai: { configured: getAnthropic() !== null, model: aiModel() },
      auth: { enabled: isAuthEnabled() },
      // Competitor analysis: which platforms can be read, through what.
      creators: creatorCapabilities(process.env),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
