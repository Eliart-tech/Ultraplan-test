import { describe, expect, it } from "vitest";
import type { ServerStatus } from "@/lib/client/api";
import type { SourceStatus } from "@/lib/types";
import { missingEnvTemplate } from "./env-template";

function source(id: SourceStatus["id"], label: string, configured: boolean, envVars: string[]): SourceStatus {
  return {
    id,
    label,
    platform: "google",
    configured,
    free: true,
    needsKeywords: false,
    description: "",
    envVars,
    setup: [],
    costNote: "",
    docsUrl: "",
  };
}

const sources = [
  source("google_trends", "Google Trends", true, []),
  source("youtube", "YouTube (API officielle)", false, ["YOUTUBE_API_KEY"]),
  source("instagram_apify", "Instagram Reels (Apify)", false, ["APIFY_TOKEN"]),
  source("tiktok_apify", "TikTok (Apify)", false, ["APIFY_TOKEN"]),
  source("serpapi_trends", "SerpApi", true, ["SERPAPI_API_KEY"]),
];

describe("missingEnvTemplate", () => {
  it("lists every missing variable once, grouped, names only", () => {
    const text = missingEnvTemplate({
      sources,
      ai: { configured: false, model: "claude-opus-5-5" },
      auth: { enabled: false },
    } satisfies ServerStatus);
    expect(text).toContain("# Claude (Anthropic) : analyse IA et écriture des scripts\nANTHROPIC_API_KEY=");
    expect(text).toContain("# YouTube (API officielle)\nYOUTUBE_API_KEY=");
    expect(text).toContain("# Instagram Reels (Apify)\nAPIFY_TOKEN=");
    expect(text).not.toContain("# TikTok (Apify)");
    expect(text.match(/APIFY_TOKEN=/g)).toHaveLength(1);
    expect(text).not.toContain("SERPAPI_API_KEY");
    expect(text).toContain("APP_PASSWORD=\nAUTH_SECRET=");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("is empty when everything is configured", () => {
    expect(
      missingEnvTemplate({
        sources: sources.map((s) => ({ ...s, configured: true })),
        ai: { configured: true, model: "m" },
        auth: { enabled: true },
      }),
    ).toBe("");
  });
});
