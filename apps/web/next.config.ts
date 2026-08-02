import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

// Vienota spēles versija no repo saknes VERSION faila (single source of truth).
// deploy.sh ceļ to +0.1 katrā izvietošanā; šeit to eksponējam build laikā gan
// dev, gan produkcijā, lai About sadaļa vienmēr rāda aktuālo versiju.
const appVersion = readFileSync(join(configDir, "../../VERSION"), "utf8").trim();

// SW skripts un manifests NEKAD nedrīkst palikt HTTP kešā: citādi pārlūks var
// turpināt lietot veco service worker un nekad neuzzina par jaunu versiju (iestrēgst
// vecā kodā). `no-cache` liek revalidēt katru reizi → jaunu versiju pieņem uzreiz.
// Repo-iekšēji un deterministiski — neatkarīgi no priekšā esošā Caddy.
const noStoreHeaders = [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  transpilePackages: ["@domino-poker/core"],
  experimental: {
    // `app/global-not-found.tsx` prasa šo karogu (Next 16 tas joprojām ir eksperimentāls,
    // noklusējums `false`). Bez tā Turbopack komponentu gan paņem, bet Webpack ceļš to
    // ignorē — un mums tas ir obligāts: ar diviem root layout (`(game)` / `(public)`)
    // saknē nav `layout.tsx`, tāpēc 404 čaulai pašai jānes `<html>` un `<body>`.
    globalNotFound: true
  },
  turbopack: {
    root: join(configDir, "../..")
  },
  async headers() {
    return [
      { source: "/sw.js", headers: noStoreHeaders },
      { source: "/manifest.webmanifest", headers: noStoreHeaders }
    ];
  }
};

export default nextConfig;
