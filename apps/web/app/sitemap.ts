import type { MetadataRoute } from "next";

import { PUBLIC_DOCUMENTS } from "../lib/publicDocuments";
import { GAME_PATH, SITE_URL } from "../lib/site";

/**
 * sitemap.xml (→ /sitemap.xml).
 *
 * Adreses NETIEK definētas no jauna: `/` nāk no `GAME_PATH`, bet desmit EN/LV lapas —
 * no `PUBLIC_DOCUMENTS`, kas pats atvasinās no `PUBLIC_ROUTES`. Tāpēc sitemap nevar
 * klusi atšķirties no canonical adresēm; abas ir projekcijas no viena reģistra.
 *
 * Kas šeit APZINĀTI NAV:
 *
 * - `alternates.languages` — `hreflang` dzīvo TIKAI HTML metadatos (9.2). Next.js
 *   serializē tikai tos alternatīvos ierakstus, ko pats norādi, un nepievieno
 *   paš-atsauci, kuru Google prasa; divas paralēlas deklarācijas ir lieka pretrunu
 *   virsma bez ieguvuma.
 * - `priority` un `changeFrequency` — Google tos ignorē.
 * - Izdomāts `lastModified`. Sk. disciplīnas prasību pie `PUBLIC_DOCUMENTS` kartējuma zemāk.
 *   Šobrīd nevienam dokumentam datuma nav, tāpēc `<lastmod>` izvadā nav vispār.
 *
 * Tehniskie maršruti, WebSocket, autentifikācija, privātās istabas, dialogu stāvokļi,
 * query varianti un admin adreses šeit nevar nonākt: reģistrā tādu ierakstu nav.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // `new URL("/", SITE_URL).href` dod `https://domino-poker.com/`, kamēr `/` canonical
    // HTML izdodas bez beigu slīpsvītras. Tukšs saknes ceļš ≡ `/`, tāpēc forma netiek
    // uzspiesta; salīdzinot abas kopas, normalizē TIKAI sakni (9.1).
    { url: new URL(GAME_PATH, SITE_URL).href },
    ...PUBLIC_DOCUMENTS.map((doc) => ({
      url: doc.url,
      // DISCIPLĪNAS PRASĪBA (plāna Fāze 7). `lastModified` drīkst parādīties TIKAI tad, ja
      // tas ir uzticams REĀLAS, BŪTISKAS satura izmaiņas datums, ko var uzturēt patiesu.
      // Neatjauno to par pārfrāzējumu, drukas kļūdas labojumu vai būves atkārtošanu, un
      // NEKAD nelieto `new Date()` — tas imitē svaigumu, ko neviens nevar apstiprināt, un
      // mazina lauka vērtību visai vietnei. Ja šo disciplīnu nevar uzturēt, lauku izlaid:
      // iztrūkstošs `<lastmod>` ir godīgāks par nepatiesu.
      //
      // Nosacīts izplatījums, nevis `lastModified: doc.lastModified`: `undefined` lauks
      // ierakstā liktu Next.js izlaist `<lastmod>`, bet ieraksti vairs nebūtu identiski
      // paši sev testā. Vienlaikus tas notur kontrakta lauku pieslēgtu — datuma
      // pievienošana `publicDocuments.ts` uzreiz parādās sitemap.
      ...(doc.lastModified === undefined ? {} : { lastModified: doc.lastModified })
    }))
  ];
}
