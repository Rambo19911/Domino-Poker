import { defineConfig } from "vitest/config";

// MP klienta loģikas testi (lib/mp/*). Tīra TS — node vide pietiek. Protokola
// runtime vērtības (piem. PROTOCOL_VERSION) izšķir caur būvēto @domino-poker/shared
// dist (tāpat kā servera testos); tipi ir type-only un tiek izdzēsti.
//
// React hook/komponentu testi lieto `.test.tsx` ar per-failu pragmu
// `// @vitest-environment happy-dom` (sk. useLobbyTransientErrors.test.tsx).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"]
  }
});
