import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LOGIN_FAILURE_DELAY_MS,
  SESSION_COOKIE,
  checkPassword,
  clearLoginFailures,
  clientKey,
  createSessionToken,
  isAuthEnabled,
  isLoginThrottled,
  recordLoginFailure,
  sessionCookieOptions,
} from "@/lib/server/auth";
import { jsonError, parseJsonBody } from "@/lib/server/request";

/**
 * POST /api/auth/login { password } — opens a 30-day session cookie when the
 * password matches APP_PASSWORD. Public route (excluded from the proxy gate).
 */

export const runtime = "nodejs";

const loginSchema = z.object({
  password: z.string().min(1, "Mot de passe requis").max(500),
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    // Nothing to log into: the app is open (APP_PASSWORD unset).
    return Response.json({ ok: true, authEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const key = clientKey(request);
  if (isLoginThrottled(key)) {
    return jsonError("Trop de tentatives de connexion. Réessayez dans 15 minutes.", 429);
  }

  const body = await parseJsonBody(request, loginSchema, 10_000);
  if (!body.ok) return body.response;

  if (!(await checkPassword(body.data.password))) {
    recordLoginFailure(key);
    await wait(LOGIN_FAILURE_DELAY_MS);
    return jsonError("Mot de passe incorrect.", 401);
  }

  clearLoginFailures(key);
  const session = await createSessionToken();
  const response = NextResponse.json({ ok: true, authEnabled: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, session.value, sessionCookieOptions(process.env, session.maxAge));
  return response;
}
