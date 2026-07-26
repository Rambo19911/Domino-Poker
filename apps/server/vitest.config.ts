import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testus dzenam pret MP avota kodu (ne būvēto dist), lai nav vajadzīgs
// iepriekšējs core build un dev cilpa paliek ātra.
export default defineConfig({
  resolve: {
    alias: {
      "@domino-poker/core/multiplayer": fileURLToPath(
        new URL("../../packages/core/src/multiplayer/index.ts", import.meta.url)
      ),
      "@domino-poker/core/slots": fileURLToPath(
        new URL("../../packages/core/src/slots/index.ts", import.meta.url)
      )
    }
  }
});
