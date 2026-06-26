import { createRequire } from "node:module";

import { UNKNOWN_COUNTRY, type CountryResolver } from "./CountryResolver.js";

/** `geoip-lite` `lookup` atbildes minimālā forma (mums vajag tikai `country`). */
interface GeoipModule {
  lookup(ip: string): { readonly country?: string } | null;
}

/**
 * Produkcijas `CountryResolver`, kas balstās uz `geoip-lite` (bundlē GeoLite2; sinhrons in-memory
 * lookup; bez API atslēgas). Bibliotēka ir CommonJS — ielādēta caur `createRequire`, lai šis ESM
 * modulis NEpievelk GeoIP datus tikai ar importu; konstruē TIKAI admin-enabled zarā (`index.ts`).
 * DB ielāde notiek konstruktorā (boot-laika kļūme, NE pirmā pieprasījuma latentums — Codex).
 */
export class GeoipCountryResolver implements CountryResolver {
  private readonly geoip: GeoipModule;

  constructor() {
    const require = createRequire(import.meta.url);
    this.geoip = require("geoip-lite") as GeoipModule;
  }

  resolve(ip: string | undefined): string {
    if (!ip) {
      return UNKNOWN_COUNTRY;
    }
    try {
      const country = this.geoip.lookup(ip)?.country;
      return country && country.length > 0 ? country : UNKNOWN_COUNTRY;
    } catch {
      // Nekad nelogo jēlu IP (privātums); jebkura kļūda → nezināma valsts.
      return UNKNOWN_COUNTRY;
    }
  }
}
