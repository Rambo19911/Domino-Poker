import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GAME_ENTITY_ID } from "./gameStructuredData";
import { findPublicDocument, type PublicDocument } from "./publicDocuments";
import {
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  X_DEFAULT_LOCALE,
  isIndexedLocale,
  type IndexedLocale,
  type PublicPage
} from "./site";

/**
 * Kopīgs publisko lapu ievads: atrisina Next.js 16 `params` promise, validē locale un
 * paņem attiecīgo satura kontrakta dokumentu.
 *
 * Piecas lapas citādi atkārtotu vienu un to pašu sešu rindu bloku.
 */
export async function resolvePublicPage(
  params: Promise<{ locale: string }>,
  page: PublicPage
): Promise<{ locale: IndexedLocale; doc: PublicDocument }> {
  const { locale } = await params;
  if (!isIndexedLocale(locale)) notFound();

  const doc = findPublicDocument(locale, page);
  if (!doc) notFound();

  return { locale, doc };
}

/**
 * Vienas publiskās lapas metadati. PROJEKCIJA no satura kontrakta (6.3), nevis otrs
 * datu avots: nosaukums, apraksts, canonical un valodu adreses nāk no `PublicDocument`,
 * kuru jau validē `validatePublicDocuments()`. Šeit nedrīkst parādīties neviena
 * ierakstīta adrese — citādi maršrutu reģistram būtu divi savstarpēji nesaskaņoti avoti.
 *
 * `hreflang` tiek izdots TIKAI šeit (HTML metadatos), nevis paralēli arī sitemap:
 * divas paralēlas deklarācijas ir lieka pretrunu virsma, un Google abas metodes
 * uzskata par līdzvērtīgām.
 */
export function publicPageMetadata(doc: PublicDocument): Metadata {
  return {
    // `absolute`, jo kontrakta nosaukumi jau ir pilni. Publiskajā saknē veidnes gan nav,
    // bet ar `absolute` tās vēlāka pievienošana nedublētu zīmolu klusi.
    title: { absolute: doc.title },
    description: doc.description,
    alternates: {
      // Katra valodas versija kanonizējas pati uz sevi, nevis visas uz angļu lapu.
      canonical: doc.url,
      // `doc.alternates` JAU satur paš-atsauci (Google to prasa), tāpēc te klāt nāk
      // tikai `x-default`. `/` (spēles čaula) šajā kopā neietilpst — sk. D1.
      languages: {
        ...doc.alternates,
        "x-default": doc.alternates[X_DEFAULT_LOCALE]
      }
    },
    openGraph: {
      type: "website",
      url: doc.url,
      siteName: SITE_NAME,
      title: doc.title,
      description: doc.description,
      // Absolūta adrese ar nolūku: kopīgošanas robotam relatīvs ceļš nav atrisināms.
      // `alt` ir lokalizēts, jo lapa ir lokalizēta; pats attēls ir viens un tas pats.
      images: [
        {
          url: new URL(OG_IMAGE.path, SITE_URL).href,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          alt: OG_IMAGE.alt[doc.locale]
        }
      ]
    }
  };
}

export type PublicPageStructuredData = {
  readonly "@context": "https://schema.org";
  readonly "@type": "WebPage";
  readonly "@id": string;
  readonly url: string;
  readonly name: string;
  readonly description: string;
  readonly inLanguage: IndexedLocale;
  readonly about: { readonly "@id": string };
};

/**
 * Lapas līmeņa `WebPage` mezgls. Blakus `publicPageMetadata()` ar nolūku: abi ir vienas un
 * tās pašas `PublicDocument` projekcijas, tāpēc `url` un canonical NEVAR atšķirties — tā
 * nav vienošanās, ko jāatceras uzturēt, bet viens lauks, kas izmantots divreiz.
 *
 * `BreadcrumbList` šeit APZINĀTI nav: publiskajā čaulā ir plakana brāļu-māsu navigācija,
 * nevis redzama hierarhiska taka, un marķējums bez takas būtu apgalvojums par navigāciju,
 * kuras nav. `FAQPage` tāpat nav — jautājumus, kas lapā nav redzami, izdomāt nedrīkst.
 */
export function publicPageStructuredData(doc: PublicDocument): PublicPageStructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    // Fragments atšķir LAPAS mezglu no spēles entītijas mezgla (`/#game`).
    "@id": `${doc.url}#webpage`,
    url: doc.url,
    name: doc.title,
    description: doc.description,
    // Lapas valoda ir redzama un deklarēta `<html lang>`.
    inLanguage: doc.locale,
    // Katra publiskā lapa redzami stāsta par spēli. Bez šīs saites `WebPage` tikai
    // atkārtotu to, kas HTML jau ir (`<title>`, meta apraksts, canonical).
    about: { "@id": GAME_ENTITY_ID }
  };
}
