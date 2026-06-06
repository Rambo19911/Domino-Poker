import { defineConfig } from "vitest/config";

// MP klienta loģikas testi (lib/mp/*). Tīra TS — node vide pietiek. Protokola
// runtime vērtības (piem. PROTOCOL_VERSION) izšķir caur būvēto @domino-poker/shared
// dist (tāpat kā servera testos); tipi ir type-only un tiek izdzēsti.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
