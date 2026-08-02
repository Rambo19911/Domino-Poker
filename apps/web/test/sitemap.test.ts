import { describe, expect, it } from "vitest";

import { metadata as gameMetadata } from "../app/(game)/page";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { PUBLIC_DOCUMENTS } from "../lib/publicDocuments";
import { publicPageMetadata } from "../lib/publicPage";
import { SITE_URL } from "../lib/site";

const ENTRIES = sitemap();

/**
 * Indeksējamo adrešu kopa, ierakstīta VERBĀLI. Tas ir neatkarīgs enkurs: ja kāds pievieno
 * lapu vai nomaina slug, sitemap tests krīt un liek to apzināti apstiprināt, nevis klusi
 * pieņem jebko, ko reģistrs izdod.
 *
 * Sakne ir `https://domino-poker.com/` ar beigu slīpsvītru — tā `new URL()` serializē
 * tukšu ceļu. Ne-saknes adresēm beigu slīpsvītras NAV: `/en` un `/en/` ir dažādi URL.
 */
const EXPECTED_URLS = [
  "https://domino-poker.com/",
  "https://domino-poker.com/en",
  "https://domino-poker.com/en/rules",
  "https://domino-poker.com/en/how-to-play",
  "https://domino-poker.com/en/strategy",
  "https://domino-poker.com/en/about",
  "https://domino-poker.com/lv",
  "https://domino-poker.com/lv/rules",
  "https://domino-poker.com/lv/how-to-play",
  "https://domino-poker.com/lv/strategy",
  "https://domino-poker.com/lv/about"
];

/**
 * Normalizē TIKAI tukšu saknes ceļu (`https://domino-poker.com` → `.../`), ko `new URL()`
 * dara pats. Beigu slīpsvītra ne-saknes ceļiem NETIEK ignorēta (9.1).
 */
function normalize(url: string): string {
  return new URL(url).href;
}

describe("sitemap.xml", () => {
  it("satur tieši indeksējamās adreses, bez dublikātiem", () => {
    const urls = ENTRIES.map((entry) => entry.url);
    expect([...urls].sort()).toEqual([...EXPECTED_URLS].sort());
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("adrešu kopa sakrīt ar canonical kopu (11.3)", () => {
    // Divas ATSEVIŠĶAS IZVADES projekcijas: metadatu slānis (`canonical`) un sitemap.
    // Godīgi par sarga robežu: abas galu galā lasa `doc.url`, tāpēc šis nav neatkarīgs
    // adrešu avots — to dod `EXPECTED_URLS` enkurs augšā. Šis tests sedz to, ko enkurs
    // nesedz: ka abi slāņi ir SAVIENOTI un neviens no tiem nav klusi izlaidis vai
    // pārveidojis kādu adresi.
    const canonicals = [
      // `/` canonical ir relatīvs (`GAME_PATH`) un HTML atrisinās pret `metadataBase`.
      String(gameMetadata.alternates?.canonical),
      ...PUBLIC_DOCUMENTS.map((doc) => String(publicPageMetadata(doc).alternates?.canonical))
    ].map((canonical) => new URL(canonical, SITE_URL).href);

    expect([...ENTRIES.map((entry) => entry.url)].sort()).toEqual([...canonicals].sort());
  });

  it("visas adreses ir absolūtas production HTTPS adreses bez query un fragmenta", () => {
    for (const entry of ENTRIES) {
      const url = new URL(entry.url);
      expect(url.href, `neabsolūta adrese: ${entry.url}`).toBe(normalize(entry.url));
      expect(url.origin, `svešs origin: ${entry.url}`).toBe(SITE_URL.origin);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("domino-poker.com");
      expect(url.search, `query variants sitemap: ${entry.url}`).toBe("");
      expect(url.hash, `fragments sitemap: ${entry.url}`).toBe("");
    }
  });

  it("ierakstos nav hreflang, priority vai changeFrequency", () => {
    for (const entry of ENTRIES) {
      // Atslēgu pārbaude, nevis `toBeUndefined()`: tikai tā pamana lauku, kas pievienots
      // ar `undefined` vērtību, un jebkuru citu nesankcionētu lauku.
      expect(Object.keys(entry).sort(), `lieki lauki: ${entry.url}`).toEqual(["url"]);
    }
  });

  it("lastModified parādās tikai no satura kontrakta, nevis no build laika", () => {
    // Šobrīd nevienam dokumentam datuma NAV, tāpēc izvadā to nedrīkst būt nevienam.
    expect(PUBLIC_DOCUMENTS.filter((doc) => doc.lastModified !== undefined)).toHaveLength(0);
    expect(ENTRIES.filter((entry) => entry.lastModified !== undefined)).toHaveLength(0);
  });

  it("neviena sitemap adrese nav liegta robots.txt", () => {
    // Sitemap, kas uzskaita robots.txt liegtu adresi, ir tieša pretruna un Search Console
    // kļūda. Vienkāršota prefiksa pārbaude pietiek: `*` grupā vienīgais `Allow` ir `/`,
    // tāpēc jebkura `Disallow` sakritība šeit jau nozīmētu liegumu.
    const wildcard = robots().rules;
    const group = (Array.isArray(wildcard) ? wildcard : [wildcard]).find((rule) =>
      (Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]).includes("*")
    );
    const disallow = group?.disallow ?? [];
    const patterns = Array.isArray(disallow) ? disallow : [disallow];

    for (const entry of ENTRIES) {
      const path = new URL(entry.url).pathname;
      const blocked = patterns.filter((pattern) => path.startsWith(pattern));
      expect(blocked, `robots.txt liedz sitemap adresi ${path}`).toEqual([]);
    }
  });
});
