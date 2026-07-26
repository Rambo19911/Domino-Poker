import { configDefaults, defineConfig } from "vitest/config";

/**
 * The slot RTP audit enumerates the full 128^5 line space and runs 1M seeded
 * spins, so it is far too slow for the default suite. It is excluded here and
 * runs on demand via `npm run test:math` (vitest.math.config.ts).
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.math.test.ts"]
  }
});
