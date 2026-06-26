/**
 * Valsts atrisinātāja PORTS (Fāze 4A.2, D4). Atvasina ISO valsts kodu no IP LASĪŠANAS laikā
 * (bez shēmas izmaiņas — IP jau glabāts `login_attempts`). Abstrahēts aiz interfeisa, lai GeoIP
 * infrastruktūra (`geoip-lite`) būtu izolēta un `AdminAnalyticsService` paliktu testējams bez
 * bibliotēkas. Produkcijas implementācija: `geoipCountryResolver.ts`.
 */

/** Spaiņa atslēga nezināmai/privātai valstij. */
export const UNKNOWN_COUNTRY = "Unknown";

export interface CountryResolver {
  /** ISO 3166-1 alpha-2 valsts kods (piem. "LV") vai `UNKNOWN_COUNTRY` (nezināms/privāts/null IP). */
  resolve(ip: string | undefined): string;
}
