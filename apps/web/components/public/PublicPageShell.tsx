import type { ReactNode } from "react";

import { JsonLd } from "../JsonLd";
import type { PublicDocument } from "../../lib/publicDocuments";
import { getPublicChrome } from "../../lib/publicNav";
import { publicPageStructuredData } from "../../lib/publicPage";
import { GAME_PATH, INDEXED_LOCALES, PUBLIC_PAGES, PUBLIC_ROUTES, SITE_NAME } from "../../lib/site";

/**
 * Publisko lapu kopīgā čaula: `header` + navigācija, `main` ar vienīgo `h1`, `footer`.
 *
 * Server Component bez klienta direktīvas — visas saites ir parasti `<a href>`, tāpēc
 * lapas strādā arī bez JavaScript un ir rāpojamas. Apzināti NEIZMANTO `next/link`:
 * tas dotu klienta navigāciju un prefetch starp publiskajām lapām, bet šīs ir statiska
 * teksta lapas, kur apmaiņā pret papildu klienta JS ieguvums ir mazs. Pāreja uz `/`
 * tāpat ir pilna pārlāde (cita root sakne). Apzināts minimāla-JS kompromiss.
 *
 * Tā ir VIENA neliela čaula piecām lapām, nevis vispārīga komponentu sistēma (plāna 8.2).
 */
export function PublicPageShell({
  doc,
  children
}: {
  readonly doc: PublicDocument;
  readonly children: ReactNode;
}) {
  // Valoda, lapa un virsraksts nāk no VIENA dokumenta, nevis no trim atsevišķām
  // propertijām: tā navigācija, virsraksts un JSON-LD nevar aprakstīt dažādas lapas.
  const { locale, page, heading } = doc;
  const chrome = getPublicChrome(locale);
  // Indeksējamās valodas ir tieši divas (D2), tāpēc "otra" ir viennozīmīga.
  const otherLocale = INDEXED_LOCALES.find((code) => code !== locale) ?? locale;

  return (
    <div className="publicPage">
      {/* Lapas `WebPage` mezgls dzīvo ČAULĀ, nevis katrā lapā: tā katra publiskā lapa to
          saņem tieši vienu reizi, un jauna lapa to nevar aizmirst. */}
      <JsonLd data={publicPageStructuredData(doc)} />
      <header className="publicHeader">
        <a className="publicBrand" href={GAME_PATH}>
          {SITE_NAME}
        </a>
        <nav className="publicNav" aria-label={chrome.navLabel}>
          <ul>
            {PUBLIC_PAGES.map((item) => (
              <li key={item}>
                <a
                  href={PUBLIC_ROUTES[locale][item]}
                  aria-current={item === page ? "page" : undefined}
                >
                  {chrome.nav[item]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          className="publicLangLink"
          href={PUBLIC_ROUTES[otherLocale][page]}
          hrefLang={otherLocale}
          lang={otherLocale}
        >
          {chrome.otherLanguageName}
        </a>
      </header>

      <main className="publicMain">
        <h1>{heading}</h1>
        {children}
        <p className="publicPlayCta">
          <a href={GAME_PATH}>{chrome.playCta}</a>
        </p>
      </main>

      <footer className="publicFooter">
        <p>{chrome.footerNote}</p>
      </footer>
    </div>
  );
}
