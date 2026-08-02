import { describe, expect, it } from "vitest";

import { PUBLIC_DOCUMENTS, findPublicDocument, validatePublicDocuments } from "../lib/publicDocuments";
import { INDEXED_LOCALES, PUBLIC_PAGES, type IndexedLocale, type PublicPage } from "../lib/site";

// Maināma dokumenta forma negatīvajiem scenārijiem. `lastModified` te nav vispār:
// projektā ir ieslēgts `exactOptionalPropertyTypes`, tāpēc neobligāta lauka izplešana
// (`{...doc}`) to padarītu par `string | undefined` un vairs neatbilstu kontraktam.
// Trūkstošs neobligāts lauks savukārt ir pilnīgi derīgs `PublicDocument`.
type MutableDocument = {
  page: PublicPage;
  locale: IndexedLocale;
  slug: string;
  path: string;
  url: string;
  title: string;
  description: string;
  heading: string;
  alternates: Record<IndexedLocale, string>;
};

function clone(): MutableDocument[] {
  return PUBLIC_DOCUMENTS.map((doc) => ({
    page: doc.page,
    locale: doc.locale,
    slug: doc.slug,
    path: doc.path,
    url: doc.url,
    title: doc.title,
    description: doc.description,
    heading: doc.heading,
    alternates: { ...doc.alternates }
  }));
}

/** Indeksēta piekļuve ar skaidru kļūdu (`noUncheckedIndexedAccess`). */
function at(documents: MutableDocument[], index: number): MutableDocument {
  const doc = documents[index];
  if (!doc) throw new Error(`testa fixture: nav dokumenta ar indeksu ${index}`);
  return doc;
}

describe("publisko dokumentu kontrakts", () => {
  it("reālais reģistrs ir derīgs", () => {
    expect(validatePublicDocuments(PUBLIC_DOCUMENTS)).toEqual([]);
  });

  it("aptver visu lapu x valodu reizinājumu", () => {
    expect(PUBLIC_DOCUMENTS).toHaveLength(PUBLIC_PAGES.length * INDEXED_LOCALES.length);
    for (const locale of INDEXED_LOCALES) {
      for (const page of PUBLIC_PAGES) {
        expect(findPublicDocument(locale, page)).toBeDefined();
      }
    }
  });

  it("nevienam dokumentam nav lastModified", () => {
    // Bez uzticama satura izmaiņas datuma sitemap `lastmod` jāizlaiž, nevis jāimitē.
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(doc.lastModified).toBeUndefined();
    }
  });

  it("nosaukumi un apraksti ir unikāli", () => {
    const titles = PUBLIC_DOCUMENTS.map((doc) => doc.title);
    const descriptions = PUBLIC_DOCUMENTS.map((doc) => doc.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("nosaukumos zīmols neatkārtojas divreiz", () => {
    // `title` ir gala nosaukums, tāpēc `%s | Domino Poker` veidne to nedrīkst dublēt.
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(doc.title.split("Domino Poker").length - 1).toBeLessThanOrEqual(1);
    }
  });

  it("alternatīvas ir absolūtas HTTPS adreses un satur paš-atsauci", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(doc.alternates[doc.locale]).toBe(doc.url);
      for (const locale of INDEXED_LOCALES) {
        expect(doc.alternates[locale].startsWith("https://domino-poker.com/")).toBe(true);
      }
    }
  });
});

describe("kontrakta validators krīt pie bojāta reģistra", () => {
  it("nepilns EN/LV pāris", () => {
    const broken = clone().filter((doc) => !(doc.locale === "lv" && doc.page === "rules"));
    expect(validatePublicDocuments(broken)).toContain("trūkst dokumenta: lv:rules");
  });

  it("tukšs apraksts", () => {
    const broken = clone();
    const target = at(broken, 0);
    target.description = "   ";
    expect(validatePublicDocuments(broken)).toContain(
      `tukšs description: ${target.locale}:${target.page}`
    );
  });

  it("dublēts URL", () => {
    const broken = clone();
    const first = at(broken, 0);
    at(broken, 1).url = first.url;
    expect(validatePublicDocuments(broken)).toContain(`dublēts URL: ${first.url}`);
  });

  it("neatbalstīta valoda", () => {
    const broken = clone();
    broken.push({ ...at(broken, 0), locale: "de" as IndexedLocale });
    expect(validatePublicDocuments(broken)).toContain("neatbalstīta valoda: de");
  });

  it("trūkstoša paš-atsauce alternatīvās", () => {
    const broken = clone();
    const target = at(broken, 0);
    target.alternates[target.locale] = "https://domino-poker.com/wrong";
    const problems = validatePublicDocuments(broken);
    const key = `${target.locale}:${target.page}`;
    expect(problems).toContain(`nepareiza ${target.locale} alternatīva: ${key}`);
    expect(problems).toContain(`trūkst paš-atsauces: ${key}`);
  });

  it("apraksts ārpus pieļaujamā garuma", () => {
    const broken = clone();
    at(broken, 0).description = "Par īss.";
    expect(validatePublicDocuments(broken).join(" ")).toContain("apraksta garums");
  });

  it("URL neatbilst maršrutu reģistram", () => {
    const broken = clone();
    at(broken, 0).url = "https://domino-poker.com/en/wrong";
    expect(validatePublicDocuments(broken).join(" ")).toContain("URL neatbilst maršrutu reģistram");
  });

  it("ceļš neatbilst maršrutu reģistram", () => {
    const broken = clone();
    at(broken, 0).path = "/en/wrong";
    expect(validatePublicDocuments(broken).join(" ")).toContain("ceļš neatbilst maršrutu reģistram");
  });

  it("slug neatbilst lapai", () => {
    const broken = clone();
    at(broken, 0).slug = "wrong-slug";
    expect(validatePublicDocuments(broken).join(" ")).toContain("slug neatbilst lapai");
  });
});
