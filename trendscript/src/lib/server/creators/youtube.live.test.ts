/**
 * Live smoke test of the keyless YouTube route (public channel page +
 * official RSS feed) on real French channels.
 * Run with: npx vitest run --config vitest.live.config.mts src/lib/server/creators/youtube.live.test.ts
 * (Instagram, TikTok and LinkedIn need paid tokens and are covered by unit
 * tests on their exact requests and documented outputs.)
 */

import { describe, expect, it } from "vitest";
import { fetchCreator } from "./index";

const CHANNELS = [
  // Verified on 2026-10-04: header "20,2 millions d’abonnés" (the 5,1 M on the page is the featured Squeezie Gaming channel).
  { handle: "@Squeezie", channelId: "UCWeg2Pkate69NFdBeuRFTAw", minFollowers: 10_000_000 },
  // Verified on 2026-10-04: "3,81 millions d’abonnés", daily Shorts and long videos.
  { handle: "https://www.youtube.com/@hugodecrypteactus", channelId: "UCAcAnMF0OrCtUep3Y4M-ZPw", minFollowers: 1_000_000 },
];

describe("fetchCreator youtube (live, keyless)", () => {
  for (const channel of CHANNELS) {
    it(`reads ${channel.handle}: real followers and recent videos with views`, async () => {
      const now = Date.now();
      const data = await fetchCreator("youtube", channel.handle, {
        env: {},
        signal: AbortSignal.timeout(45_000),
        now,
        geo: "FR",
        language: "fr",
        maxPosts: 30,
      });
      const shorts = data.posts.filter((post) => post.kind === "short_video").length;
      console.info(
        `[live] ${channel.handle}: ${data.account.displayName} (@${data.account.handle}) · ${data.account.followers} abonnés · ${data.account.totalPosts} vidéos · ${data.posts.length} posts (${shorts} Shorts) · source=${data.source}`,
      );
      for (const post of data.posts.slice(0, 3)) {
        console.info(`[live]   ${post.publishedAt} | ${post.kind} | ${post.metrics.views} vues | ${post.metrics.likes} likes | ${post.title}`);
      }
      console.info(`[live]   warnings: ${data.warnings.join(" / ")}`);

      expect(data.account.url).toMatch(/^https:\/\/www\.youtube\.com\/@/);
      expect(data.account.followers).toBeGreaterThan(channel.minFollowers);
      expect(data.account.totalPosts).toBeGreaterThan(100);
      expect(data.account.displayName?.length).toBeGreaterThan(0);
      expect(data.ratiosAllowed).toBe(false);
      expect(data.posts.length).toBeGreaterThanOrEqual(10);
      expect(data.posts.length).toBeLessThanOrEqual(15);
      const times = data.posts.map((post) => Date.parse(post.publishedAt!));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      for (const post of data.posts) {
        expect(post.url).toMatch(/^https:\/\/www\.youtube\.com\/(watch\?v=|shorts\/)[\w-]{11}$/);
        expect(post.id).toMatch(/^[\w-]{11}$/);
        expect(post.title.length).toBeGreaterThan(0);
        expect(post.metrics.views).toBeGreaterThanOrEqual(0);
        expect(Date.parse(post.publishedAt!)).toBeLessThanOrEqual(now);
      }
      expect(data.posts.filter((post) => (post.metrics.views ?? 0) > 1000).length).toBeGreaterThan(data.posts.length / 2);
    });
  }

  it("says plainly when a handle does not exist", async () => {
    await expect(
      fetchCreator("youtube", "@trendscript-inexistant-9f3k", {
        env: {},
        signal: AbortSignal.timeout(30_000),
        now: Date.now(),
        geo: "FR",
        language: "fr",
        maxPosts: 30,
      }),
    ).rejects.toThrow("Compte introuvable sur YouTube : vérifiez le pseudo (@trendscript-inexistant-9f3k).");
  });
});
