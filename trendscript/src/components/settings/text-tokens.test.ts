import { describe, expect, it } from "vitest";
import { displayUrl, tokenizeText } from "./text-tokens";

describe("tokenizeText", () => {
  it("returns a single text token when there is nothing to format", () => {
    expect(tokenizeText("Aucune clé nécessaire.")).toEqual([{ type: "text", value: "Aucune clé nécessaire." }]);
    expect(tokenizeText("")).toEqual([]);
  });

  it("extracts URLs without the sentence punctuation", () => {
    expect(tokenizeText("Créez un compte sur https://serpapi.com (offre gratuite).")).toEqual([
      { type: "text", value: "Créez un compte sur " },
      { type: "url", value: "https://serpapi.com" },
      { type: "text", value: " (offre gratuite)." },
    ]);
    expect(tokenizeText("(https://console.apify.com), ouvrez")).toEqual([
      { type: "text", value: "(" },
      { type: "url", value: "https://console.apify.com" },
      { type: "text", value: "), ouvrez" },
    ]);
  });

  it("keeps balanced parentheses inside URLs", () => {
    expect(tokenizeText("voir https://fr.wikipedia.org/wiki/Test_(informatique).")[1]).toEqual({
      type: "url",
      value: "https://fr.wikipedia.org/wiki/Test_(informatique)",
    });
  });

  it("marks env var names, env files and npm commands as code", () => {
    expect(tokenizeText("Ajoutez SERPAPI_API_KEY=<clé> dans .env.local puis relancez npm run dev.")).toEqual([
      { type: "text", value: "Ajoutez " },
      { type: "code", value: "SERPAPI_API_KEY" },
      { type: "text", value: "=<clé> dans " },
      { type: "code", value: ".env.local" },
      { type: "text", value: " puis relancez " },
      { type: "code", value: "npm run dev" },
      { type: "text", value: "." },
    ]);
  });

  it("leaves ordinary upper-case words alone", () => {
    expect(tokenizeText("Copiez le jeton API (il commence par UC).")).toEqual([
      { type: "text", value: "Copiez le jeton API (il commence par UC)." },
    ]);
  });
});

describe("displayUrl", () => {
  it("drops the scheme, www and the trailing slash", () => {
    expect(displayUrl("https://www.example.org/")).toBe("example.org");
    expect(displayUrl("https://console.anthropic.com/settings/keys")).toBe("console.anthropic.com/settings/keys");
  });
});
