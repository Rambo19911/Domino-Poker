import { describe, expect, it } from "vitest";

import { generateMetadata as aboutMetadata } from "../app/(public)/[locale]/about/page";
import { generateMetadata as howToPlayMetadata } from "../app/(public)/[locale]/how-to-play/page";
import { generateMetadata as homeMetadata } from "../app/(public)/[locale]/page";
import { generateMetadata as rulesMetadata } from "../app/(public)/[locale]/rules/page";
import { generateMetadata as strategyMetadata } from "../app/(public)/[locale]/strategy/page";
import { PUBLIC_DOCUMENTS, findPublicDocument } from "../lib/publicDocuments";
import { publicPageMetadata } from "../lib/publicPage";
import {
  GAME_PATH,
  INDEXED_LOCALES,
  PUBLIC_PAGES,
  PUBLIC_ROUTES,
  SITE_NAME,
  SITE_URL,
  X_DEFAULT_LOCALE,
  type PublicPage
} from "../lib/site";

// Metadatu slānis ir PROJEKCIJA no satura kontrakta (6.3), nevis otrs datu avots.
// Tāpēc testi salīdzina pret `PUBLIC_DOCUMENTS`/`PUBLIC_ROUTES`, nevis pret šeit
// ierakstītām adresēm — citādi tests apstiprinātu pats savu kopiju.

const HREFLANG_KEYS = [...INDEXED_LOCALES, "x-default"].sort();

/** `Metadata.alternates.languages` vērtība ir savienojums; publiskās lapas dod virknes. */
function languageHref(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`gaidīta virkne hreflang vērtībā, saņemts: ${String(value)}`);
  }
  return value;
}

describe("publisko lapu metadati", () => {
  it("nosaukums un apraksts nāk no kontrakta un ir absolūti (bez veidnes)", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const meta = publicPageMetadata(doc);
      // `title.absolute` — kontrakta nosaukumi jau ir pilni, tāpēc `%s | Domino Poker`
      // veidne tos nedrīkst apaugļot otrreiz ar zīmolu.
      expect(meta.title).toEqual({ absolute: doc.title });
      expect(meta.description).toBe(doc.description);
    }
  });

  it("nav divu lapu ar vienādu title/description pāri", () => {
    const pairs = PUBLIC_DOCUMENTS.map((doc) => {
      const meta = publicPageMetadata(doc);
      return `${JSON.stringify(meta.title)}|${String(meta.description)}`;
    });
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("katra lapa kanonizējas pati uz sevi", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const meta = publicPageMetadata(doc);
      expect(meta.alternates?.canonical).toBe(doc.url);
      // Nevis visas uz angļu versiju: LV lapas canonical satur `/lv`.
      expect(new URL(doc.url).pathname).toBe(PUBLIC_ROUTES[doc.locale][doc.page]);
    }
  });

  it("hreflang kopā ir abas valodas, paš-atsauce un x-default", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const languages = publicPageMetadata(doc).alternates?.languages;
      expect(languages).toBeDefined();
      expect(Object.keys(languages ?? {}).sort()).toEqual(HREFLANG_KEYS);

      for (const locale of INDEXED_LOCALES) {
        const href = languageHref(languages?.[locale]);
        expect(new URL(href).pathname).toBe(PUBLIC_ROUTES[locale][doc.page]);
      }
      // Paš-atsauce: `en` lapā ir gan `en`, gan `lv` ieraksts.
      expect(languageHref(languages?.[doc.locale])).toBe(doc.url);
    }
  });

  it("x-default norāda uz angļu versiju", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const languages = publicPageMetadata(doc).alternates?.languages;
      const xDefault = languageHref(languages?.["x-default"]);
      expect(xDefault).toBe(languageHref(languages?.[X_DEFAULT_LOCALE]));
      expect(new URL(xDefault).pathname).toBe(PUBLIC_ROUTES[X_DEFAULT_LOCALE][doc.page]);
    }
  });

  it("EN un LV pāris norāda viens uz otru ar vienādu kopu", () => {
    // Reciprocitāte: abas versijas izdod IDENTISKU valodu karti (D1 prasība).
    for (const doc of PUBLIC_DOCUMENTS) {
      const other = PUBLIC_DOCUMENTS.find(
        (candidate) => candidate.page === doc.page && candidate.locale !== doc.locale
      );
      expect(other).toBeDefined();
      expect(publicPageMetadata(doc).alternates?.languages).toEqual(
        publicPageMetadata(other!).alternates?.languages
      );
    }
  });

  it("spēles sakne `/` hreflang kopā neparādās", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const languages = publicPageMetadata(doc).alternates?.languages ?? {};
      for (const value of Object.values(languages)) {
        expect(new URL(languageHref(value)).pathname).not.toBe(GAME_PATH);
      }
    }
  });

  it("Open Graph adrese sakrīt ar paškanonisko", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const openGraph = publicPageMetadata(doc).openGraph;
      expect(openGraph?.url).toBe(doc.url);
      expect(openGraph?.title).toBe(doc.title);
      expect(openGraph?.description).toBe(doc.description);
      expect(openGraph?.siteName).toBe(SITE_NAME);
    }
  });

  it("visas izdotās adreses ir absolūtas produkcijas HTTPS adreses bez www", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const meta = publicPageMetadata(doc);
      const urls = [
        String(meta.alternates?.canonical),
        String(meta.openGraph?.url),
        ...Object.values(meta.alternates?.languages ?? {}).map(languageHref)
      ];
      for (const url of urls) {
        expect(new URL(url).origin).toBe(SITE_URL.origin);
        expect(url.startsWith("https://domino-poker.com/")).toBe(true);
      }
    }
  });

  it("publiskās lapas netiek slēptas no indeksēšanas", () => {
    // `robots` netiek izdots vispār -> noklusējums ir index/follow. Tests aizliedz
    // klusu `noindex` regresiju un `keywords` lauka atgriešanos (9.1 lēmums).
    for (const doc of PUBLIC_DOCUMENTS) {
      const meta = publicPageMetadata(doc);
      expect(meta.robots ?? { index: true }).toMatchObject({ index: true });
      expect(meta.keywords).toBeUndefined();
    }
  });
});

// Iepriekšējie testi pārbauda palīgfunkciju. Šie pārbauda MARŠRUTU PIEVADU: pieci
// `generateMetadata()` eksporti ir rakstīti roku darbā, tāpēc kļūda “strategy lapa
// padod "rules"” ir reāla kopēšanas kļūda, ko palīgfunkcijas testi neredz.
const ROUTE_METADATA: Readonly<
  Record<PublicPage, (props: { params: Promise<{ locale: string }> }) => Promise<unknown>>
> = {
  home: homeMetadata,
  rules: rulesMetadata,
  howToPlay: howToPlayMetadata,
  strategy: strategyMetadata,
  about: aboutMetadata
};

describe("maršrutu generateMetadata pievads", () => {
  it("katrai publiskajai lapai ir savs eksports", () => {
    for (const page of PUBLIC_PAGES) {
      expect(typeof ROUTE_METADATA[page]).toBe("function");
    }
  });

  it("katrs maršruts atgriež TIEŠI savas lapas metadatus", async () => {
    for (const page of PUBLIC_PAGES) {
      for (const locale of INDEXED_LOCALES) {
        const doc = findPublicDocument(locale, page);
        expect(doc).toBeDefined();
        const actual = await ROUTE_METADATA[page]({ params: Promise.resolve({ locale }) });
        expect(actual).toEqual(publicPageMetadata(doc!));
      }
    }
  });
});
