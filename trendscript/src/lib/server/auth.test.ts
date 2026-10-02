import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  checkPassword,
  clearLoginFailures,
  createSessionToken,
  isApiPath,
  isAuthEnabled,
  isAuthorized,
  isLoginThrottled,
  isPublicPath,
  readCookie,
  recordLoginFailure,
  requireAuth,
  safeNextPath,
  sessionCookieOptions,
  timingSafeEqual,
  verifySessionToken,
} from "./auth";

const env = { APP_PASSWORD: "correct horse battery staple" };
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

describe("isAuthEnabled", () => {
  it("is on only when APP_PASSWORD has a value", () => {
    expect(isAuthEnabled({})).toBe(false);
    expect(isAuthEnabled({ APP_PASSWORD: "" })).toBe(false);
    expect(isAuthEnabled({ APP_PASSWORD: "   " })).toBe(false);
    expect(isAuthEnabled(env)).toBe(true);
  });
});

describe("session tokens", () => {
  it("round-trips and has the documented shape", async () => {
    const token = await createSessionToken(env, NOW);
    expect(token.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    const [expires, mac] = token.value.split(".");
    expect(Number(expires)).toBe(Math.floor(NOW / 1000) + SESSION_MAX_AGE_SECONDS);
    expect(mac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await verifySessionToken(token.value, env, NOW)).toBe(true);
    expect(await verifySessionToken(token.value, env, NOW + 29 * 86_400_000)).toBe(true);
  });

  it("rejects expired, tampered, malformed and foreign tokens", async () => {
    const { value } = await createSessionToken(env, NOW);
    const [expires, mac] = value.split(".");
    expect(await verifySessionToken(value, env, NOW + (SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBe(false);
    // Extending the expiry invalidates the signature.
    expect(await verifySessionToken(`${Number(expires) + 60}.${mac}`, env, NOW)).toBe(false);
    const flipped = `${expires}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`;
    expect(await verifySessionToken(flipped, env, NOW)).toBe(false);
    for (const bad of [undefined, null, "", "abc", `${expires}`, `${expires}.`, `x.${mac}`, `${value}.extra`]) {
      expect(await verifySessionToken(bad, env, NOW)).toBe(false);
    }
    // Another password (or secret) signs differently.
    expect(await verifySessionToken(value, { APP_PASSWORD: "other" }, NOW)).toBe(false);
    expect(await verifySessionToken(value, { ...env, AUTH_SECRET: "a-long-random-secret" }, NOW)).toBe(false);
    // Auth disabled: no token is valid (and none is needed).
    expect(await verifySessionToken(value, {}, NOW)).toBe(false);
  });

  it("uses AUTH_SECRET when set, so the password can change without logging out", async () => {
    const withSecret = { ...env, AUTH_SECRET: "a-long-random-secret" };
    const { value } = await createSessionToken(withSecret, NOW);
    expect(await verifySessionToken(value, { ...withSecret, APP_PASSWORD: "new password" }, NOW)).toBe(true);
  });

  it("rejects expiries further than the session lifetime", async () => {
    const { value } = await createSessionToken(env, NOW + 365 * 86_400_000);
    expect(await verifySessionToken(value, env, NOW)).toBe(false);
  });

  it("refuses to create a session when auth is disabled", async () => {
    await expect(createSessionToken({}, NOW)).rejects.toThrow(/APP_PASSWORD/);
  });
});

describe("checkPassword", () => {
  it("accepts only the exact password", async () => {
    expect(await checkPassword(env.APP_PASSWORD, env)).toBe(true);
    expect(await checkPassword(`${env.APP_PASSWORD} `, env)).toBe(false);
    expect(await checkPassword("correct", env)).toBe(false);
    expect(await checkPassword("", env)).toBe(false);
    expect(await checkPassword("anything", {})).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compares bytes", () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(a, new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("request helpers", () => {
  it("reads one cookie from a Cookie header", () => {
    expect(readCookie("a=1; ts_session=123.abc; b=2", SESSION_COOKIE)).toBe("123.abc");
    expect(readCookie("xts_session=1", SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(null, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie("v=%E2%9C%93", "v")).toBe("✓");
  });

  it("lets everything through when auth is disabled", async () => {
    const request = new Request("http://localhost/api/sources");
    expect(await isAuthorized(request, {})).toBe(true);
    expect(await requireAuth(request, {})).toBeNull();
  });

  it("returns a French 401 without a valid session", async () => {
    const response = await requireAuth(new Request("http://localhost/api/sources"), env);
    expect(response?.status).toBe(401);
    expect((await response?.json()).error).toMatch(/reconnectez-vous/);
  });

  it("accepts a valid session cookie", async () => {
    const { value } = await createSessionToken(env);
    const request = new Request("http://localhost/api/sources", {
      headers: { cookie: `${SESSION_COOKIE}=${value}` },
    });
    expect(await requireAuth(request, env)).toBeNull();
  });

  it("sets Secure only in production", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" })).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    expect(sessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
  });
});

describe("login throttling", () => {
  it("blocks a client after 10 failures in 15 minutes", () => {
    const key = "203.0.113.7";
    for (let i = 0; i < 9; i++) recordLoginFailure(key, NOW);
    expect(isLoginThrottled(key, NOW)).toBe(false);
    recordLoginFailure(key, NOW);
    expect(isLoginThrottled(key, NOW)).toBe(true);
    expect(isLoginThrottled(key, NOW + 16 * 60_000)).toBe(false);
    clearLoginFailures(key);
    expect(isLoginThrottled(key, NOW)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/historique")).toBe("/historique");
    expect(safeNextPath("/reglages?onglet=sources#claude")).toBe("/reglages?onglet=sources#claude");
    expect(safeNextPath("/a/../b")).toBe("/b");
  });

  it("falls back to / for anything that could leave the site or loop", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "historique",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/\n/evil.example",
      "/login",
      "/login?next=/login",
      "/api/sources",
      `/${"a".repeat(3000)}`,
    ]) {
      expect(safeNextPath(raw)).toBe("/");
    }
  });
});

describe("path rules", () => {
  it("knows which paths stay public", () => {
    for (const path of [
      "/login",
      "/api/auth/login",
      "/api/auth/logout",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/favicon.ico",
      "/robots.txt",
      "/icon",
      "/icon.png",
      "/icon/small",
      "/apple-icon",
      "/opengraph-image",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/historique",
      "/reglages",
      "/api/analyze",
      "/api/script",
      "/api/sources",
      "/api/authx",
      "/login-old",
      "/iconography",
      "/icons/a/b",
      "/favicon.ico.bak",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("detects API paths", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/analyze")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/")).toBe(false);
  });
});
