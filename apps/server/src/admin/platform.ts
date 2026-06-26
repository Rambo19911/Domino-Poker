/**
 * Platformas klasifikācija no user-agent virknes (Fāze 4A.2, D4 segmenti). Tīra domēna
 * funkcija — bez I/O, bez atkarībām, pilnībā testējama. Apzināti RUPJA (3 spaiņi): admin
 * analītikas pārskatam pietiek ar mobile/desktop/other; nevajag pilnu UA parsēšanu.
 */

/** Rupjš platformas spainis admin segmentam. */
export type Platform = "mobile" | "desktop" | "other";

// Android UA satur arī "Linux", tāpēc mobilo pārbauda PIRMS desktopa.
const MOBILE = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/iu;
const DESKTOP = /Windows NT|Macintosh|Mac OS X|X11|Linux|CrOS/iu;

/**
 * Klasificē user-agent → platforma. Tukšs/nezināms/cits (piem. bots, API klients) → "other".
 */
export function classifyPlatform(userAgent: string | undefined): Platform {
  if (!userAgent) {
    return "other";
  }
  if (MOBILE.test(userAgent)) {
    return "mobile";
  }
  if (DESKTOP.test(userAgent)) {
    return "desktop";
  }
  return "other";
}
