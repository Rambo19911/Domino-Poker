import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Admin paneļa Next.js konfigurācija (sk. docs/TODO/admin-panel-plan.md, Fāze 0). Atsevišķa
 * lietotne uz porta 3001; runā ar serveri (port 4000) caur `/admin/*` API. Turbopack root
 * = repo sakne (kā apps/web), lai monorepo node_modules atrisinās korekti.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: join(configDir, "../..")
  }
};

export default nextConfig;
