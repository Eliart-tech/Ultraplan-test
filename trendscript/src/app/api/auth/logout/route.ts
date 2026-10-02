import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/auth";

/**
 * POST /api/auth/logout — clears the session cookie. Public on purpose:
 * logging out without a session is harmless.
 */

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  // Same attributes as when it was set, expired immediately.
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(process.env, 0));
  return response;
}
