import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "./lib/server/auth";
import { config, proxy } from "./proxy";

const PASSWORD = "mot de passe de test";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

/** NextResponse.next() is signalled with this header. */
const passesThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy matcher", () => {
  it("skips static build assets and runs everywhere else", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const url of ["/_next/static/chunks/main.js", "/_next/image?url=%2Fa.png&w=64&q=75", "/favicon.ico"]) {
      expect(matches(url), url).toBe(false);
    }
    for (const url of ["/", "/historique", "/reglages", "/login", "/api/analyze", "/api/auth/login", "/icon"]) {
      expect(matches(url), url).toBe(true);
    }
  });
});

describe("proxy", () => {
  it("is a no-op when APP_PASSWORD is unset", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(passesThrough(await proxy(request("/historique")))).toBe(true);
    expect(passesThrough(await proxy(request("/api/analyze")))).toBe(true);
  });

  it("redirects pages to /login with a safe `next`", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const response = await proxy(request("/historique?q=ia&_rsc=abc"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/historique?q=ia");

    const home = await proxy(request("/"));
    expect(new URL(home.headers.get("location") ?? "").search).toBe("");
  });

  it("answers API calls with a 401 JSON instead of a redirect", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const response = await proxy(request("/api/analyze"));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect((await response.json()).error).toMatch(/reconnectez-vous/);
  });

  it("lets public paths and valid sessions through", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    expect(passesThrough(await proxy(request("/login")))).toBe(true);
    expect(passesThrough(await proxy(request("/api/auth/login")))).toBe(true);

    const { value } = await createSessionToken({ APP_PASSWORD: PASSWORD });
    expect(passesThrough(await proxy(request("/historique", value)))).toBe(true);
    expect(passesThrough(await proxy(request("/api/analyze", value)))).toBe(true);
    expect((await proxy(request("/historique", `${value}x`))).status).toBe(307);
  });
});
