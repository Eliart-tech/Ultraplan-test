/**
 * Optional single-tenant password gate. When `APP_PASSWORD` is set, the
 * whole app (pages + API) requires a session cookie; when it is unset the app
 * is open (fine locally, flagged in the UI in production).
 *
 * Sessions are stateless: `${expiresAtEpochSeconds}.${base64url(HMAC)}`,
 * signed with Web Crypto so the same code runs in the proxy, in route
 * handlers and in tests. No database, no dependency.
 */

import type { Env } from "./sources/types";

export const SESSION_COOKIE = "ts_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Domain separation: this key only ever signs session expiries. */
const SESSION_CONTEXT = "ts-session:";
/** Slows down password guessing without hurting a human who mistyped. */
export const LOGIN_FAILURE_DELAY_MS = 750;

const encoder = new TextEncoder();

export function isAuthEnabled(env: Env = process.env): boolean {
  return Boolean(env.APP_PASSWORD?.trim());
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/**
 * Compares two byte arrays in time that depends only on their length, so a
 * response time never reveals how many leading bytes matched.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * HMAC key: `AUTH_SECRET` when set (recommended: a long random value), else
 * SHA-256(APP_PASSWORD) — changing the password then logs every session out.
 */
async function sessionKey(env: Env): Promise<CryptoKey | null> {
  const password = env.APP_PASSWORD;
  if (!password?.trim()) return null;
  const secret = env.AUTH_SECRET?.trim();
  const material = secret ? encoder.encode(secret) : await sha256(password);
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signature(key: CryptoKey, expiresAt: number): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${SESSION_CONTEXT}${expiresAt}`));
  return base64Url(new Uint8Array(mac));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionToken {
  value: string;
  /** Seconds, for the cookie's Max-Age. */
  maxAge: number;
}

export async function createSessionToken(env: Env = process.env, now = Date.now()): Promise<SessionToken> {
  const key = await sessionKey(env);
  if (!key) throw new Error("APP_PASSWORD n'est pas défini : aucune session à créer.");
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  return { value: `${expiresAt}.${await signature(key, expiresAt)}`, maxAge: SESSION_MAX_AGE_SECONDS };
}

const TOKEN_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

export async function verifySessionToken(
  value: string | undefined | null,
  env: Env = process.env,
  now = Date.now(),
): Promise<boolean> {
  const match = TOKEN_PATTERN.exec(value ?? "");
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const nowSec = Math.floor(now / 1000);
  // Expired, or further in the future than we ever issue (e.g. after the TTL was shortened).
  if (expiresAt <= nowSec || expiresAt > nowSec + SESSION_MAX_AGE_SECONDS + 60) return false;
  const key = await sessionKey(env);
  if (!key) return false;
  const expected = await signature(key, expiresAt);
  return timingSafeEqual(encoder.encode(match[2]), encoder.encode(expected));
}

/** Constant-time password check (both sides hashed first so lengths don't leak). */
export async function checkPassword(candidate: string, env: Env = process.env): Promise<boolean> {
  const expected = env.APP_PASSWORD;
  if (!expected?.trim()) return false;
  const [a, b] = await Promise.all([sha256(candidate), sha256(expected)]);
  return timingSafeEqual(a, b);
}

export function sessionCookieOptions(env: Env = process.env, maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ---------------------------------------------------------------------------
// Request helpers (route handlers re-check the session: the proxy is only an
// optimistic gate, and a matcher change must never expose an API route)
// ---------------------------------------------------------------------------

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export async function isAuthorized(request: Request, env: Env = process.env): Promise<boolean> {
  if (!isAuthEnabled(env)) return true;
  return verifySessionToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE), env);
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: "Session absente ou expirée : reconnectez-vous avec le mot de passe de l'application." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

/** `null` when the request may proceed, otherwise the 401 response to return. */
export async function requireAuth(request: Request, env: Env = process.env): Promise<Response | null> {
  return (await isAuthorized(request, env)) ? null : unauthorizedResponse();
}

// ---------------------------------------------------------------------------
// Login throttling — per server instance, best effort (serverless instances
// don't share memory); the fixed failure delay is the main brake.
// ---------------------------------------------------------------------------

const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "inconnu"
  );
}

export function isLoginThrottled(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
  return recent.length >= MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const recent = (failures.get(key) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
  recent.push(now);
  failures.set(key, recent);
  if (failures.size > 5_000) {
    for (const [entry, times] of failures) {
      if (times.every((at) => now - at >= FAILURE_WINDOW_MS)) failures.delete(entry);
    }
  }
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

// ---------------------------------------------------------------------------
// Paths (shared by the proxy and the login page)
// ---------------------------------------------------------------------------

const PUBLIC_FILES = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);
/** File-based metadata images: /icon, /icon.png, /icon/abc, /apple-icon1, /opengraph-image… */
const METADATA_IMAGE = /^\/(?:icon|apple-icon|opengraph-image|twitter-image)\d*(?:\.\w+)?(?:\/[^/]+)?$/;

/** Paths reachable without a session even when the password gate is on. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  // Build assets and Next.js dev tooling; never user data.
  if (pathname.startsWith("/_next/") || pathname.startsWith("/__nextjs")) return true;
  return PUBLIC_FILES.has(pathname) || METADATA_IMAGE.test(pathname);
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

const PLACEHOLDER_ORIGIN = "http://trendscript.invalid";

/**
 * Where to go after login: only a same-origin relative path, never
 * `//evil.com`, `/\evil.com`, `https://…` or the login page itself.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // Browsers drop tabs/newlines inside URLs ("/\n/evil.com" → "//evil.com").
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return "/";
  if (url.pathname === "/login" || isApiPath(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
