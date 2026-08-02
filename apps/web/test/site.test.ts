import { describe, expect, it } from "vitest";

import {
  GAME_PATH,
  GITHUB_REPO_URL,
  INDEXED_LOCALES,
  PUBLIC_PAGES,
  PUBLIC_ROUTES,
  SITE_NAME,
  SITE_URL,
  X_DEFAULT_LOCALE,
  YOUTUBE_VIDEO_URL,
  publicLocaleFor
} from "../lib/site";
import { locales } from "../lib/i18n";

// D1 maršrutu modelis, ierakstīts VERBĀLI. Ja kāds nomaina slug vai valodas
// prefiksu, canonical, `hreflang` un sitemap sāktu klusi novirzīties viens no otra —
// šis saraksts ir tas, pret ko tie visi vēlāk tiks salīdzināti.
const EXPECTED_ROUTES = [
  "/en",
  "/en/rules",
  "/en/how-to-play",
  "/en/strategy",
  "/en/about",
  "/lv",
  "/lv/rules",
  "/lv/how-to-play",
  "/lv/strategy",
  "/lv/about"
];

// Faktiski ģenerētie ceļi. Invarianti jāpārbauda pret ŠO, nevis pret gaidīto sarakstu —
// citādi tests apliecinātu pats savu konstanti, nevis moduļa izvadu.
const ACTUAL_ROUTES = INDEXED_LOCALES.flatMap((locale) =>
  PUBLIC_PAGES.map((page) => PUBLIC_ROUTES[locale][page])
);

describe("site konfigurācija", () => {
  it("kanoniskais origin ir bez www un bez porta", () => {
    expect(SITE_URL.origin).toBe("https://domino-poker.com");
    expect(SITE_URL.protocol).toBe("https:");
    expect(SITE_URL.hostname).toBe("domino-poker.com");
    // `new URL(...)` serializē saknes ceļu kā "/"; canonical adreses tiek būvētas no
    // `origin`, tāpēc pati bāze nedrīkst nest papildu ceļu, query vai fragmentu.
    expect(SITE_URL.pathname).toBe("/");
    expect(SITE_URL.search).toBe("");
    expect(SITE_URL.hash).toBe("");
  });

  it("nosaukums ir stabils", () => {
    expect(SITE_NAME).toBe("Domino Poker");
  });

  it("indeksējamās valodas ir tieši en un lv", () => {
    expect([...INDEXED_LOCALES]).toEqual(["en", "lv"]);
  });

  it("x-default norāda uz indeksējamu valodu", () => {
    expect(INDEXED_LOCALES).toContain(X_DEFAULT_LOCALE);
    expect(X_DEFAULT_LOCALE).toBe("en");
  });

  it("maršrutu kartējums precīzi atbilst D1 sarakstam", () => {
    expect(ACTUAL_ROUTES).toEqual(EXPECTED_ROUTES);
  });

  it("katrai valodai ir pilns lapu komplekts", () => {
    for (const locale of INDEXED_LOCALES) {
      expect(Object.keys(PUBLIC_ROUTES[locale]).sort()).toEqual([...PUBLIC_PAGES].sort());
    }
  });

  it("ceļi ir unikāli, absolūti un bez beigu slīpsvītras", () => {
    expect(new Set(ACTUAL_ROUTES).size).toBe(ACTUAL_ROUTES.length);
    for (const path of ACTUAL_ROUTES) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.endsWith("/")).toBe(false);
      expect(path).not.toContain("//");
    }
  });

  it("spēles adrese nav publiskā satura slāņa daļa", () => {
    expect(GAME_PATH).toBe("/");
    expect(ACTUAL_ROUTES).not.toContain(GAME_PATH);
  });

  it("katra no 21 UI valodas kartējas uz indeksējamu publisko valodu", () => {
    // UI atbalsta 21 valodu, publiskās ir divas. Bez pilnas kartes saites uz publisko
    // sadaļu no, piem., poļu UI būtu nedefinētas.
    expect(locales.length).toBeGreaterThan(INDEXED_LOCALES.length);
    for (const { code } of locales) {
      const mapped = publicLocaleFor(code);
      expect(INDEXED_LOCALES, code).toContain(mapped);
      // Indeksējamās valodas kartējas pašas uz sevi; visas pārējās — uz `x-default`.
      expect(mapped, code).toBe(
        (INDEXED_LOCALES as readonly string[]).includes(code) ? code : X_DEFAULT_LOCALE
      );
    }
  });

  it("lv paliek lv, un ne-indeksējama valoda grimst uz en", () => {
    expect(publicLocaleFor("lv")).toBe("lv");
    expect(publicLocaleFor("en")).toBe("en");
    expect(publicLocaleFor("pl")).toBe("en");
    expect(publicLocaleFor("uk")).toBe("en");
    expect(publicLocaleFor("zz")).toBe("en");
  });

  it("ārējās adreses ir oficiālās un HTTPS", () => {
    expect(GITHUB_REPO_URL).toBe("https://github.com/Rambo19911/Domino-Poker");
    expect(YOUTUBE_VIDEO_URL).toBe("https://youtu.be/QoCuoa6lhTo");
    for (const url of [GITHUB_REPO_URL, YOUTUBE_VIDEO_URL]) {
      expect(new URL(url).protocol).toBe("https:");
      expect(url.endsWith("/")).toBe(false);
    }
  });
});
