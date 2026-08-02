// Publiskās sadaļas navigācijas un čaulas etiķetes.
//
// Atsevišķi no `publicContent.ts` APZINĀTI: šīs etiķetes importē arī spēles lobijs
// (klienta komponents), un `publicContent.ts` satur visu publisko lapu prozu. Kopā
// tās riskētu ievilkt spēles bundlē vairākus kilobaitus teksta, ko lobijs nekad nerāda.
//
// Tīrs, serverim un klientam drošs modulis: tikai konstantes.

import type { IndexedLocale, PublicPage } from "./site";

export interface PublicChrome {
  readonly navLabel: string;
  readonly nav: Readonly<Record<PublicPage, string>>;
  readonly playCta: string;
  readonly otherLanguageName: string;
  readonly footerNote: string;
  readonly contentsLabel: string;
  readonly rulesSinglePlayer: string;
  readonly rulesMultiplayer: string;
  /** Lobija informācijas bloka virsraksts (saites uz publisko sadaļu). */
  readonly lobbyLinksLabel: string;
}

const CHROME: Record<IndexedLocale, PublicChrome> = {
  en: {
    navLabel: "Domino Poker information",
    nav: {
      home: "Overview",
      rules: "Rules",
      howToPlay: "How to play",
      strategy: "Strategy",
      about: "About"
    },
    playCta: "Play Domino Poker",
    otherLanguageName: "Latviski",
    footerNote: "Domino Poker is a free, open-source browser game.",
    contentsLabel: "Contents",
    rulesSinglePlayer: "Single-player rules",
    rulesMultiplayer: "Multiplayer rules",
    lobbyLinksLabel: "Learn more"
  },
  lv: {
    navLabel: "Domino Poker informācija",
    nav: {
      home: "Pārskats",
      rules: "Noteikumi",
      howToPlay: "Kā spēlēt",
      strategy: "Stratēģija",
      about: "Par spēli"
    },
    playCta: "Spēlēt Domino Poker",
    otherLanguageName: "English",
    footerNote: "Domino Poker ir bezmaksas, atvērtā pirmkoda pārlūka spēle.",
    contentsLabel: "Saturs",
    rulesSinglePlayer: "Viena spēlētāja noteikumi",
    rulesMultiplayer: "Daudzspēlētāju noteikumi",
    lobbyLinksLabel: "Uzzināt vairāk"
  }
};

export function getPublicChrome(locale: IndexedLocale): PublicChrome {
  return CHROME[locale];
}
