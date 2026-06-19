import type { MetadataRoute } from "next";

import { appStrings, defaultLocale } from "../lib/i18n";

/**
 * Web App Manifest (→ /manifest.webmanifest). Padara spēli instalējamu uz telefona
 * kā aplikāciju (ikona, pilnekrāns). Instalēšana prasa HTTPS (vai localhost testam).
 * `display: standalone` → bez pārlūka joslām. `orientation` neuzspiežam, jo desktop
 * izmanto ainavu, bet telefons portrētu.
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = appStrings[defaultLocale];
  return {
    name: "Domino Poker",
    short_name: "Domino Poker",
    description: t.metadataDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Sinhronizēts ar --overlay / --background (tokens.css). PWA manifests prasa
    // literālu HEX (nevar lietot CSS mainīgos) — atjaunot kopā ar tēmas tokeniem.
    background_color: "#1e2622",
    theme_color: "#1b6048",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
