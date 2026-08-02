// Publiskās vietnes vienotā konfigurācija (SEO/atrodamības slānis).
//
// Šis modulis ir TĪRS un serverim drošs: tikai konstantes, bez `window`,
// `localStorage`, React hookiem vai `"use client"`. To importē gan Server
// Components (`generateMetadata`), gan `robots.ts`/`sitemap.ts`, kuriem klienta
// API nav pieejami.
//
// Kanoniskais production domēns ir viens un zināms — bez `www.` un bez beigu
// slīpsvītras. Visas pārējās formas (`http://`, `www.`, `/en/`) ir redirect avoti,
// nevis alternatīvi canonical.

export const SITE_NAME = "Domino Poker";

export const SITE_URL = new URL("https://domino-poker.com");

// Indeksējamās valodas. APZINĀTI atsevišķi no 21 UI valodas (`lib/i18n`): UI
// valoda ir lietotāja izvēle `localStorage`, šī ir publiskā satura kopa, kurai ir
// pilns tulkojums, atsevišķas URL un `hreflang`.
export const INDEXED_LOCALES = ["en", "lv"] as const;
export type IndexedLocale = (typeof INDEXED_LOCALES)[number];

// `x-default` norāda uz angļu versiju. `/` (spēles čaula) šajā kopā neietilpst,
// jo tā nav `/en`/`/lv` valodas versija.
export const X_DEFAULT_LOCALE: IndexedLocale = "en";

export function isIndexedLocale(value: string): value is IndexedLocale {
  return (INDEXED_LOCALES as readonly string[]).includes(value);
}

/**
 * Sašaurina jebkuru no 21 UI valodas uz indeksējamo publiskā satura valodu.
 *
 * UI atbalsta 21 valodu, publiskās lapas — divas. Bez šī kartējuma saites uz publisko
 * sadaļu no, piemēram, poļu UI būtu nedefinētas. Atvasināts no `INDEXED_LOCALES`, nevis
 * ierakstīts kā ternārs, lai trešās indeksējamās valodas pievienošana (D2) šo funkciju
 * atjaunotu automātiski.
 *
 * APZINĀTI atsevišķs no `i18n.emailLocale`: e-pastu valodu kopa un publiskā satura
 * valodu kopa ir divi neatkarīgi lēmumi un laika gaitā var atšķirties.
 */
export function publicLocaleFor(uiLocale: string): IndexedLocale {
  return isIndexedLocale(uiLocale) ? uiLocale : X_DEFAULT_LOCALE;
}

// Publiskās lapas un to slug. Tukšs slug = valodas sākumlapa.
export const PAGE_SLUGS = {
  home: "",
  rules: "rules",
  howToPlay: "how-to-play",
  strategy: "strategy",
  about: "about"
} as const;

export type PublicPage = keyof typeof PAGE_SLUGS;
export const PUBLIC_PAGES = Object.keys(PAGE_SLUGS) as readonly PublicPage[];

// Valodu pāru maršrutu kartējums. `Record` tips garantē, ka katrai indeksējamai
// valodai ir visas lapas — nepilns pāris nav izsakāms.
export const PUBLIC_ROUTES: Record<IndexedLocale, Record<PublicPage, string>> = {
  en: buildRoutes("en"),
  lv: buildRoutes("lv")
};

function buildRoutes(locale: IndexedLocale): Record<PublicPage, string> {
  const routes = {} as Record<PublicPage, string>;
  for (const page of PUBLIC_PAGES) {
    const slug = PAGE_SLUGS[page];
    routes[page] = slug ? `/${locale}/${slug}` : `/${locale}`;
  }
  return routes;
}

// Spēles adrese. Nav publiskā satura slāņa daļa un nesaņem valodu alternatīvas.
export const GAME_PATH = "/";

/**
 * Kopīgošanas attēls (Open Graph / Twitter). VIENS statisks fails visai vietnei.
 *
 * Salikts no REĀLIEM projekta failiem — `domino-poker-trick-play-1440.webp` spēles skata
 * un `domino_poker_logo.png` emblēmas —, nevis zīmēts no jauna. Ikona kā vienīgais lielais
 * attēls netiek lietota: kopīgošanas kartītē tā izskatītos pēc tukša kvadrāta.
 *
 * `width`/`height` ir ĪSTIE faila izmēri, nevis vēlamie; tests to salīdzina ar failu uz
 * diska, lai deklarācija nevarētu klusi atšķirties no attēla.
 */
export const OG_IMAGE = {
  path: "/images/domino-poker-open-graph.jpg",
  width: 1200,
  height: 630,
  // Apraksta to, kas attēlā REDZAMS, tiem, kas to neredz.
  alt: {
    en: "The Domino Poker table mid-round: four hands of dominoes around a green table, the trick in the centre, the round scoreboard and the Domino Poker emblem.",
    lv: "Domino Poker galds partijas vidū: četras domino rokas ap zaļo galdu, stiķis centrā, raunda rezultātu tabula un Domino Poker emblēma."
  }
} as const satisfies {
  path: string;
  width: number;
  height: number;
  alt: Record<IndexedLocale, string>;
};

// Oficiālās ārējās adreses. GitHub ir spēles repozitorijs (`git remote origin`);
// atsevišķā bota repozitorija (`Domino_Poker_MAX_BOT`) šeit neietilpst, jo tā nav
// šīs spēles entītijas profils. YouTube ir spēles video, nevis profils — JSON-LD
// tas pieder pie `subjectOf`, ne `sameAs`.
export const GITHUB_REPO_URL = "https://github.com/Rambo19911/Domino-Poker";
export const YOUTUBE_VIDEO_URL = "https://youtu.be/QoCuoa6lhTo";
