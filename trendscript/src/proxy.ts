/**
 * Optimistic password gate (Next 16 "proxy", formerly middleware). Only
 * active when APP_PASSWORD is set. Pages without a valid session are
 * redirected to /login?next=…, API calls get a 401 JSON. Every route handler
 * re-checks the session itself, so a matcher mistake can't expose data.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  isApiPath,
  isAuthEnabled,
  isPublicPath,
  safeNextPath,
  unauthorizedResponse,
  verifySessionToken,
} from "./lib/server/auth";

export async function proxy(request: NextRequest) {
  const env = process.env;
  if (!isAuthEnabled(env)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, env)) return NextResponse.next();

  if (isApiPath(pathname)) return unauthorizedResponse();

  // Keep the user's query string, minus the router's internal RSC marker.
  const params = new URLSearchParams(request.nextUrl.search);
  params.delete("_rsc");
  const query = params.toString();
  const next = safeNextPath(`${pathname}${query ? `?${query}` : ""}`);

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Static build assets skip the proxy entirely; everything else is filtered
  // by `isPublicPath` (unit-tested) so the rules live in one place.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
