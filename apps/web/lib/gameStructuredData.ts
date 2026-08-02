// Spēles entītijas strukturētie dati (JSON-LD).
//
// Modulis ir TĪRS un serverim drošs: tikai dati, bez `window` un React. Katrs lauks ir
// APGALVOJUMS par entītiju, tāpēc šeit drīkst būt tikai tas, kas ir patiess un ko var
// pārbaudīt kodā vai lapā redzamajā saturā. Nepatiess lauks ir sliktāks par trūkstošu.
//
// FAKTU AVOTI: nosaukums un adreses — `site.ts`; apraksts — lapā REDZAMAIS ievads
// (`publicContent.ts`); attēli — tie paši ekrānattēli, kas lapā.

import { getHome, getScreenshots } from "./publicContent";
import { GAME_PATH, GITHUB_REPO_URL, SITE_NAME, SITE_URL, type IndexedLocale } from "./site";

export type GameStructuredData = {
  readonly "@context": "https://schema.org";
  readonly "@type": readonly ["VideoGame", "WebApplication"];
  readonly "@id": string;
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly image: readonly string[];
  readonly applicationCategory: "GameApplication";
  readonly operatingSystem: "Any";
  readonly playMode: readonly string[];
  readonly isAccessibleForFree: true;
  readonly offers: {
    readonly "@type": "Offer";
    readonly price: "0";
    readonly priceCurrency: string;
  };
  readonly sameAs: readonly string[];
};

/**
 * Entītijas stabilais identifikators. VIENS abām valodu versijām: tas ir tas, kas ļauj
 * sistēmām saprast, ka `/en` un `/lv` apraksta to pašu spēli. Ja `@id` būtu lapas
 * canonical, entītija sašķeltos divās.
 *
 * Fragments (`#game`) atšķir entītiju no pašas lapas — spēle nav dokuments.
 */
export const GAME_ENTITY_ID = new URL(`${GAME_PATH}#game`, SITE_URL).href;

// Kanoniskie `GamePlayMode` locekļi. Spēlei ir gan viena spēlētāja režīms pret botiem,
// gan reāllaika četru spēlētāju galdi — abi ir redzami publiskajā saturā.
const PLAY_MODES = ["https://schema.org/SinglePlayer", "https://schema.org/MultiPlayer"] as const;

// Monētas ir virtuālas un nav nopērkamas; spēle nemaksā neko. `price` bez `priceCurrency`
// ir validācijas kļūda, tāpēc valūta ir obligāta arī nullei.
const PRICE_CURRENCY = "EUR";

function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}

export function gameStructuredData(locale: IndexedLocale): GameStructuredData {
  return {
    "@context": "https://schema.org",
    "@type": ["VideoGame", "WebApplication"],
    "@id": GAME_ENTITY_ID,
    name: SITE_NAME,
    // Entītija ir SPĒLE, tāpēc adrese ir spēles čaula, nevis publiskā prezentācijas lapa.
    url: absolute(GAME_PATH),
    // Lokalizēts un lapā redzams teksts, nevis meta apraksts.
    description: getHome(locale).intro,
    image: getScreenshots(locale).map((image) => absolute(`/images/${image.slug}-1440.webp`)),
    applicationCategory: "GameApplication",
    // “web browser” NAV operētājsistēma — spēle darbojas jebkurā modernā pārlūkā.
    operatingSystem: "Any",
    playMode: [...PLAY_MODES],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: PRICE_CURRENCY },
    // Tikai oficiālais entītijas profils. `sameAs` ir IDENTITĀTES saite (disambiguācija),
    // nevis satura apgalvojums, tāpēc uz to neattiecas prasība par segumu tajā pašā lapā —
    // repozitorijs ir redzams About faktos un sasniedzams no katras lapas caur navigāciju.
    // Prasība tā vietā ir stingrāka pēc būtības: profilam jābūt OFICIĀLI šīs entītijas.
    sameAs: [GITHUB_REPO_URL]

    // TRĪS APZINĀTI IZLAISTI LAUKI. Kritērijs ir šis: lauks drīkst būt tikai tad, ja tas
    // ir gan patiess, GAN atbalstīts lapā redzamajā saturā. Nepatiess vai neatbalstīts
    // lauks ir sliktāks par trūkstošu.
    //
    // 1. `aggregateRating`/`review` — bez īstām, lietotājam redzamām atsauksmēm tie būtu
    //    izdomāti dati. Sekas: Google `SoftwareApplication` rich result prasības nav
    //    pilnībā izpildītas. Tas ir pieņemts; vērtējumu izdomāt NEDRĪKST (plāna 10.1).
    // 2. `subjectOf` ar YouTube video — video ir patiess, bet pašlaik nav saistīts ne no
    //    vienas redzamas lapas. Pievieno TIKAI kopā ar redzamu saiti šajā pašā lapā.
    // 3. `inLanguage` ar 21 `GAME_LANGUAGES` valodu — patiess par spēli, bet publiskajās
    //    lapās nekur nav redzams. Pievieno TIKAI tad, kad lapa to arī parāda; `["en","lv"]`
    //    nav aizvietotājs, jo tas jauktu lapas valodas ar spēles valodām.
  };
}
