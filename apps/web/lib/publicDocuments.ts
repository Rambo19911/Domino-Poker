// Publisko, indeksējamo lapu satura kontrakts.
//
// Viena patiesības vieta metadatiem: no šejienes vēlāk tiek atvasināti
// `generateMetadata()` nosaukumi/apraksti, canonical un `hreflang` adreses, kā arī
// sitemap ieraksti. Maršruti NETIEK definēti no jauna — tie nāk no `site.ts`
// (`PUBLIC_ROUTES`), lai nevarētu rasties divi atšķirīgi maršrutu reģistri.
//
// Modulis ir tīrs un serverim drošs: bez `window`, `localStorage` un React hookiem.

import {
  INDEXED_LOCALES,
  PAGE_SLUGS,
  PUBLIC_PAGES,
  PUBLIC_ROUTES,
  SITE_URL,
  type IndexedLocale,
  type PublicPage
} from "./site";

export type PublicDocument = {
  readonly page: PublicPage;
  readonly locale: IndexedLocale;
  readonly slug: string;
  readonly path: string;
  /** Absolūtā kanoniskā adrese. Lapa kanonizējas pati uz sevi. */
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly heading: string;
  /** Valodas versiju adreses, IESKAITOT pašu (Google prasa paš-atsauci). */
  readonly alternates: Readonly<Record<IndexedLocale, string>>;
  /**
   * Tikai tad, ja to iespējams uzturēt patiesu. Šobrīd APZINĀTI nav nevienam
   * dokumentam: bez uzticama satura izmaiņas datuma sitemap `lastmod` jāizlaiž,
   * nevis katrā build jāieraksta `new Date()` (sk. plāna 6.3 un 11.2).
   */
  readonly lastModified?: string;
};

type PageContent = {
  readonly title: string;
  readonly description: string;
  readonly heading: string;
};

// `title` ir PILNS, gala lapas nosaukums, nevis veidnes fragments. Tāpēc metadatos
// to lieto kā `title.absolute`, lai `%s | Domino Poker` veidne nedublētu zīmolu.
const CONTENT: Record<IndexedLocale, Record<PublicPage, PageContent>> = {
  en: {
    home: {
      title: "Domino Poker — Free Online Trick-Taking Domino Game",
      description:
        "Play Domino Poker free in your browser: bid, take tricks and score points against AI opponents or in real-time four-player tables. No download required.",
      heading: "Domino Poker"
    },
    rules: {
      title: "Domino Poker Rules",
      description:
        "The complete rules of Domino Poker: the double-six set, seven tiles per player, bidding from 0 to 7 tricks, trick play and how points are scored.",
      heading: "Domino Poker rules"
    },
    howToPlay: {
      title: "How to Play Domino Poker",
      description:
        "A short step-by-step guide to your first game of Domino Poker, from choosing single-player or multiplayer to reading the final scoreboard.",
      heading: "How to play Domino Poker"
    },
    strategy: {
      title: "Domino Poker Strategy",
      description:
        "Practical bidding and trick-play advice: counting the tricks you are sure of, when to bid low, and how to read what the other players are doing.",
      heading: "Domino Poker strategy"
    },
    about: {
      title: "About Domino Poker",
      description:
        "About the project: a free, open-source browser game with single-player and real-time four-player modes. Gold coins are virtual and have no cash value.",
      heading: "About Domino Poker"
    }
  },
  lv: {
    home: {
      title: "Domino Poker — bezmaksas domino stiķu spēle internetā",
      description:
        "Spēlē Domino Poker bez maksas pārlūkā: solī, ņem stiķus un krāj punktus pret botiem vai reāllaika četru spēlētāju galdos. Nekas nav jālejupielādē.",
      heading: "Domino Poker"
    },
    rules: {
      title: "Domino Poker noteikumi",
      description:
        "Pilni Domino Poker noteikumi: dubultsešinieku komplekts, septiņi kauliņi katram spēlētājam, solījumi no 0 līdz 7 stiķiem, stiķu spēle un punktu skaitīšana.",
      heading: "Domino Poker noteikumi"
    },
    howToPlay: {
      title: "Kā spēlēt Domino Poker",
      description:
        "Īsa soli pa solim pamācība pirmajai Domino Poker spēlei — no režīma izvēles un solīšanas līdz gala rezultāta nolasīšanai.",
      heading: "Kā spēlēt Domino Poker"
    },
    strategy: {
      title: "Domino Poker stratēģija",
      description:
        "Praktiski solīšanas un stiķu spēles padomi: kā saskaitīt drošos stiķus, kad solīt zemu un kā nolasīt pārējo spēlētāju rīcību pie galda.",
      heading: "Domino Poker stratēģija"
    },
    about: {
      title: "Par Domino Poker",
      description:
        "Par projektu: bezmaksas atvērtā pirmkoda pārlūka spēle pret botiem un reāllaika četru spēlētāju galdiem. Zelts ir virtuāls, bez reālas naudas vērtības.",
      heading: "Par Domino Poker"
    }
  }
};

function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

function buildDocuments(): readonly PublicDocument[] {
  const documents: PublicDocument[] = [];
  for (const locale of INDEXED_LOCALES) {
    for (const page of PUBLIC_PAGES) {
      const path = PUBLIC_ROUTES[locale][page];
      const alternates = {} as Record<IndexedLocale, string>;
      for (const alternate of INDEXED_LOCALES) {
        alternates[alternate] = absoluteUrl(PUBLIC_ROUTES[alternate][page]);
      }
      documents.push({
        page,
        locale,
        slug: PAGE_SLUGS[page],
        path,
        url: absoluteUrl(path),
        ...CONTENT[locale][page],
        alternates
      });
    }
  }
  return documents;
}

export const PUBLIC_DOCUMENTS: readonly PublicDocument[] = buildDocuments();

export function findPublicDocument(
  locale: IndexedLocale,
  page: PublicPage
): PublicDocument | undefined {
  return PUBLIC_DOCUMENTS.find((doc) => doc.locale === locale && doc.page === page);
}

const MIN_DESCRIPTION = 50;
const MAX_DESCRIPTION = 160;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Satura kontrakta izpildes pārbaude. Atgriež problēmu sarakstu; tukšs saraksts
 * nozīmē derīgu reģistru.
 *
 * Tas ir IZPILDLAIKA validators ar nolūku: TypeScript `Record` gan padara nepilnu
 * valodu pāri neizsakāmu, bet plāna pieņemšanas kritērijs prasa TESTU, kas reāli
 * krīt pie nepilna pāra. Tipa garantiju nevar palaist un parādīt.
 */
export function validatePublicDocuments(documents: readonly PublicDocument[]): string[] {
  const problems: string[] = [];
  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();

  for (const doc of documents) {
    const key = `${doc.locale}:${doc.page}`;

    if (!(INDEXED_LOCALES as readonly string[]).includes(doc.locale)) {
      problems.push(`neatbalstīta valoda: ${doc.locale}`);
      continue;
    }
    if (!(PUBLIC_PAGES as readonly string[]).includes(doc.page)) {
      problems.push(`neatbalstīta lapa: ${doc.page}`);
      continue;
    }
    if (seenKeys.has(key)) {
      problems.push(`dublēts dokuments: ${key}`);
    }
    seenKeys.add(key);

    if (seenUrls.has(doc.url)) {
      problems.push(`dublēts URL: ${doc.url}`);
    }
    seenUrls.add(doc.url);

    for (const field of ["title", "description", "heading"] as const) {
      if (doc[field].trim().length === 0) {
        problems.push(`tukšs ${field}: ${key}`);
      }
    }

    const length = doc.description.trim().length;
    if (length > 0 && (length < MIN_DESCRIPTION || length > MAX_DESCRIPTION)) {
      problems.push(
        `apraksta garums ${length} ārpus ${MIN_DESCRIPTION}–${MAX_DESCRIPTION}: ${key}`
      );
    }

    const expectedPath = PUBLIC_ROUTES[doc.locale][doc.page];
    if (doc.path !== expectedPath) {
      problems.push(`ceļš neatbilst maršrutu reģistram: ${key} (${doc.path} != ${expectedPath})`);
    }

    const expectedUrl = absoluteUrl(expectedPath);
    if (doc.url !== expectedUrl) {
      problems.push(`URL neatbilst maršrutu reģistram: ${key} (${doc.url} != ${expectedUrl})`);
    }

    if (doc.slug !== PAGE_SLUGS[doc.page]) {
      problems.push(`slug neatbilst lapai: ${key} (${doc.slug} != ${PAGE_SLUGS[doc.page]})`);
    }

    const alternateLocales = Object.keys(doc.alternates).sort();
    if (alternateLocales.join(",") !== [...INDEXED_LOCALES].sort().join(",")) {
      problems.push(`nepilns valodu alternatīvu komplekts: ${key}`);
    } else {
      for (const alternate of INDEXED_LOCALES) {
        const expected = absoluteUrl(PUBLIC_ROUTES[alternate][doc.page]);
        if (doc.alternates[alternate] !== expected) {
          problems.push(`nepareiza ${alternate} alternatīva: ${key}`);
        }
      }
      if (doc.alternates[doc.locale] !== doc.url) {
        problems.push(`trūkst paš-atsauces: ${key}`);
      }
    }

    if (doc.lastModified !== undefined && !ISO_DATE.test(doc.lastModified)) {
      problems.push(`nederīgs lastModified (gaidīts YYYY-MM-DD): ${key}`);
    }
  }

  // Nepilns valodu pāris: katrai lapai jābūt visās indeksējamās valodās.
  for (const page of PUBLIC_PAGES) {
    for (const locale of INDEXED_LOCALES) {
      if (!seenKeys.has(`${locale}:${page}`)) {
        problems.push(`trūkst dokumenta: ${locale}:${page}`);
      }
    }
  }

  return problems;
}
