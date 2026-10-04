/** TEST HELPER ONLY: a `fetch` stub that answers by URL pattern and records every call. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

export type Route = [pattern: RegExp, respond: (url: string, init?: RequestInit) => Response];

export function fixture(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function text(body: string, status = 200, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

/** Stubs the global fetch; unmatched URLs fail the test loudly. */
export function routeFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new Error(`Unexpected fetch in test: ${url}`);
    return route[1](url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function calledUrls(fn: ReturnType<typeof routeFetch>): string[] {
  return fn.mock.calls.map(([input]) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url));
}
