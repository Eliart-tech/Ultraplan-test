import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Live smoke tests hit real endpoints: run them with `npm run test:live`.
    exclude: ["**/node_modules/**", "src/**/*.live.test.ts"],
  },
});
