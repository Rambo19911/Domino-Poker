import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testus dzenam pret shared avota kodu (ne būvēto dist), lai dev cilpa paliek ātra.
export default defineConfig({
  resolve: {
    alias: {
      "@domino-poker/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url)
      )
    }
  }
});
