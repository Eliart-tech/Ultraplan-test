import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import {
  apifyError,
  apifyMaxChargeUsd,
  buildApifyRunInit,
  buildApifyRunUrl,
  runApifyActor,
  runApifyActorDetailed,
  splitApifyItems,
} from "./apify";

const TOKEN = "apify_api_TESTTOKEN123";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return typeof response === "function" ? response() : response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildApifyRunUrl / buildApifyRunInit", () => {
  it("targets the run-sync endpoint with timeout, cost cap and fields — and no token", () => {
    const url = new URL(
      buildApifyRunUrl("apify~instagram-hashtag-scraper", { timeoutSecs: 120, maxChargeUsd: 0.5, fields: ["id", "url"] }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://api.apify.com/v2/actors/apify~instagram-hashtag-scraper/run-sync-get-dataset-items",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      timeout: "120",
      maxTotalChargeUsd: "0.5",
      format: "json",
      clean: "true",
      fields: "id,url",
    });
    expect(url.toString()).not.toContain("token");
  });

  it("sends the input as JSON with a Bearer token", () => {
    const init = buildApifyRunInit({ hashtags: ["a"] }, TOKEN);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
    expect(init.body).toBe('{"hashtags":["a"]}');
  });

  it("reads APIFY_MAX_CHARGE_USD with a 0.5 default", () => {
    expect(apifyMaxChargeUsd({})).toBe(0.5);
    expect(apifyMaxChargeUsd({ APIFY_MAX_CHARGE_USD: "1,25" })).toBe(1.25);
    expect(apifyMaxChargeUsd({ APIFY_MAX_CHARGE_USD: "-3" })).toBe(0.5);
    expect(apifyMaxChargeUsd({ APIFY_MAX_CHARGE_USD: "abc" })).toBe(0.5);
  });
});

describe("splitApifyItems", () => {
  it("drops rows carrying an error and keeps their description", () => {
    const { items, errorRows } = splitApifyItems<{ id: string }>([
      { id: "1" },
      { inputUrl: "https://www.instagram.com/explore/tags/vide", error: "no_items", errorDescription: "Empty or private data" },
      { id: "2", error: null },
      "garbage",
      null,
    ]);
    expect(items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(errorRows).toEqual([
      { error: "no_items", errorDescription: "Empty or private data", input: "https://www.instagram.com/explore/tags/vide" },
    ]);
  });
});

describe("runApifyActor", () => {
  it("POSTs to the run-sync URL with the Bearer header and returns items without error rows", async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: "a" }, { error: "not_found", url: "x" }, { id: "b" }], 201));
    const items = await runApifyActor<{ id: string }>("clockworks~tiktok-scraper", { searchQueries: ["ia"] }, {
      token: TOKEN,
      maxChargeUsd: 0.75,
    });
    expect(items).toEqual([{ id: "a" }, { id: "b" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.apify.com/v2/actors/clockworks~tiktok-scraper/run-sync-get-dataset-items?timeout=120&maxTotalChargeUsd=0.75&format=json&clean=true",
    );
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init?.body).toBe('{"searchQueries":["ia"]}');
  });

  it("reports error rows separately in the detailed variant", async () => {
    stubFetch(jsonResponse([{ id: "a" }, { error: "No results found", input: "budget" }], 201));
    const result = await runApifyActorDetailed("x~y", {}, { token: TOKEN });
    expect(result.items).toHaveLength(1);
    expect(result.errorRows[0]).toMatchObject({ error: "No results found", input: "budget" });
  });

  it("refuses to run without a token (no network call)", async () => {
    const fetchMock = stubFetch(jsonResponse([], 201));
    await expect(runApifyActor("x~y", {}, { token: "" })).rejects.toThrow(/APIFY_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: { type: "user-or-token-not-found", message: "User was not found or authentication token is not valid" } }, /Jeton Apify invalide.*APIFY_TOKEN/, false],
    [402, { error: { type: "not-enough-usage-to-run-paid-actor", message: "Not enough usage" } }, /Crédit Apify épuisé/, false],
    [402, { error: { type: "x402-payment-required", message: "Request not authenticated." } }, /Jeton Apify manquant/, false],
    [408, { error: { type: "run-timeout-exceeded", message: "Actor run exceeded the timeout of 300 seconds for this API endpoint" } }, /n'a pas répondu à temps/, true],
    [429, { error: { type: "rate-limit-exceeded", message: "You have exceeded the rate limit." } }, /Trop de requêtes vers Apify/, true],
    [404, { error: { type: "record-not-found", message: "Actor was not found" } }, /Acteur Apify introuvable : clockworks\/tiktok-scraper/, false],
    [400, { error: { type: "max-total-charge-usd-below-minimum", message: "Max total charge too low" } }, /APIFY_MAX_CHARGE_USD/, false],
    [400, { error: { type: "run-failed", message: "Actor run did not succeed (run ID: abc, status: FAILED)" } }, /a échoué/, true],
    [400, { error: { type: "run-failed", message: "Actor run did not succeed (run ID: abc, status: TIMED-OUT)" } }, /dépassé son délai/, true],
    [503, { error: { type: "internal-server-error", message: "boom" } }, /momentanément indisponible \(503\)/, true],
  ])("maps HTTP %i (%o) to a French SourceError", async (status, body, pattern, retryable) => {
    stubFetch(jsonResponse(body, status));
    const error = await runApifyActor("clockworks~tiktok-scraper", {}, { token: TOKEN }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).message).toMatch(pattern);
    expect((error as SourceError).status).toBe(status);
    expect((error as SourceError).retryable).toBe(retryable);
  });

  it("never echoes a token found in an upstream error message", () => {
    const error = apifyError(400, JSON.stringify({ error: { type: "invalid-input", message: `bad input token=${TOKEN} Bearer ${TOKEN}` } }), "x~y");
    expect(error.message).not.toContain("TESTTOKEN");
    expect(error.message).toMatch(/Apify a refusé les paramètres envoyés à x\/y/);
  });

  it("rejects a non-array dataset and invalid JSON", async () => {
    stubFetch(jsonResponse({ data: [] }, 201));
    await expect(runApifyActor("x~y", {}, { token: TOKEN })).rejects.toThrow(/format inattendu/);
    stubFetch(new Response("<html>", { status: 201 }));
    await expect(runApifyActor("x~y", {}, { token: TOKEN })).rejects.toThrow(/JSON invalide/);
  });

  it("wraps network failures with the actor name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const error = await runApifyActor("apify~instagram-hashtag-scraper", {}, { token: TOKEN }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).message).toMatch(/^Apify \(apify\/instagram-hashtag-scraper\) : Erreur réseau/);
    expect((error as SourceError).retryable).toBe(true);
  });
});
