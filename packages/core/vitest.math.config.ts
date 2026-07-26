import { defineConfig } from "vitest/config";

/** Slow, on-demand slot RTP audit only. See vitest.config.ts for the rationale. */
export default defineConfig({
  test: {
    include: ["**/*.math.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000
  }
});
