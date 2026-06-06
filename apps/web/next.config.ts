import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

// Vienota spēles versija no repo saknes VERSION faila (single source of truth).
// deploy.sh ceļ to +0.1 katrā izvietošanā; šeit to eksponējam build laikā gan
// dev, gan produkcijā, lai About sadaļa vienmēr rāda aktuālo versiju.
const appVersion = readFileSync(join(configDir, "../../VERSION"), "utf8").trim();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  transpilePackages: ["@domino-poker/core"],
  turbopack: {
    root: join(configDir, "../..")
  }
};

export default nextConfig;
