import { defineConfig } from "vitest/config";

/** Smoke tests against the real, free endpoints (network required). */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.live.test.ts"],
    testTimeout: 60_000,
  },
});
