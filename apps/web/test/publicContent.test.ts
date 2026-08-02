import { TRUMPS } from "@domino-poker/core";
import { describe, expect, it } from "vitest";

import { PUBLIC_DOCUMENTS } from "../lib/publicDocuments";
import { existsSync, readFileSync } from "node:fs";

import {
  getAbout,
  getHome,
  getHowToPlay,
  getScreenshots,
  getStrategy
} from "../lib/publicContent";
import { getPublicChrome } from "../lib/publicNav";
import { GITHUB_REPO_URL, INDEXED_LOCALES, PUBLIC_PAGES } from "../lib/site";

/** Visas satura virknes vienā plūsmā — ērti kopīgām pārbaudēm. */
function allStrings(locale: (typeof INDEXED_LOCALES)[number]): string[] {
  const howTo = getHowToPlay(locale);
  const strategy = getStrategy(locale);
  const about = getAbout(locale);
  const home = getHome(locale);
  const chrome = getPublicChrome(locale);
  return [
    howTo.intro,
    howTo.fullRulesNote,
    ...howTo.steps.flatMap((step) => [step.title, step.body]),
    strategy.intro,
    strategy.disclaimer,
    ...strategy.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    about.intro,
    about.coinsNote,
    ...about.facts.flatMap((fact) => [fact.label, fact.value]),
    home.intro,
    home.galleryHeading,
    ...home.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    ...getScreenshots(locale).flatMap((image) => [image.alt, image.caption]),
    chrome.navLabel,
    chrome.playCta,
    chrome.otherLanguageName,
    chrome.footerNote,
    chrome.contentsLabel,
    chrome.rulesSinglePlayer,
    chrome.rulesMultiplayer,
    ...PUBLIC_PAGES.map((page) => chrome.nav[page])
  ];
}

// Formulējumi, kas šim projektam būtu NEPATIESI. Pamatots ar koda auditu:
// monētas nav nopērkamas un nav izmaksājamas (`apps/server/src/storage/CoinStore.ts`
// virsrakstu kopa nesatur pirkuma iemeslu), maksājumu integrācijas nav, abonementu nav,
// un grūtības ir tieši trīs: Medium/Hard/Epic (`apps/web/lib/bot/difficulty.ts`).
//
// Frāzes ir apzināti tādas, kas var parādīties TIKAI apgalvojumā, ne noliegumā.
// Atsevišķi VĀRDI šeit neder: patiess noliegums “no subscriptions” satur “subscription”,
// un “nav abonementu” satur “abonement”. Tāpēc sarakstā ir tikai iegādes darbības vārdu
// savienojumi, kas noliegumā negrammatiski neparādās.
const FORBIDDEN = [
  "buy coins",
  "buy gold",
  "purchase coins",
  "coin pack",
  "cash out",
  "cashout",
  "top up your balance",
  "in-app purchase",
  "monthly subscription",
  "subscription required",
  "guaranteed win",
  "easy difficulty",
  "nopirkt monētas",
  "pirkt monētas",
  "pirkt zeltu",
  "monētu paka",
  "abonementa maksa",
  "maksas abonements",
  "garantēta uzvara",
  "izmaksa uz kontu"
];

function findForbidden(text: string): string[] {
  const lowered = text.toLowerCase();
  return FORBIDDEN.filter((phrase) => lowered.includes(phrase));
}

describe("publiskā satura sargs", () => {
  it("aizliegto frāžu meklētājs tiešām nostrādā", () => {
    // Bez šī tests varētu būt tukšs: ja meklētājs būtu salauzts, viss izskatītos tīrs.
    // Apgalvojumi JĀNOĶER (frāzes var pārklāties, tāpēc pārbaudām iekļaušanu).
    const badEn = findForbidden("You can buy coins with a Monthly Subscription.");
    expect(badEn).toContain("buy coins");
    expect(badEn).toContain("monthly subscription");

    const badLv = findForbidden("Vari nopirkt monētas, samaksājot par maksas abonements.");
    expect(badLv).toContain("nopirkt monētas");
    expect(badLv).toContain("maksas abonements");
    // Patiesi NOLIEGUMI nedrīkst trāpīt sargā — tieši tie satur bīstamos vārdus.
    expect(findForbidden("Free — no purchases, no subscriptions, no advertising")).toEqual([]);
    expect(findForbidden("Bez maksas — nav pirkumu, nav abonementu, nav reklāmu")).toEqual([]);
    expect(findForbidden("Nekas no šī negarantē uzvaru.")).toEqual([]);
    expect(findForbidden("Tās nevar nopirkt, nevar izmaksāt.")).toEqual([]);
  });

  for (const locale of INDEXED_LOCALES) {
    it(`${locale}: nesatur nevienu nepatiesu monetizācijas apgalvojumu`, () => {
      for (const text of allStrings(locale)) {
        expect(findForbidden(text), text).toEqual([]);
      }
    });

    it(`${locale}: neviena satura virkne nav tukša`, () => {
      for (const text of allStrings(locale)) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it("arī lapu metadati neapgalvo neko nepatiesu", () => {
    // Plāna 7.3 prasība attiecas uz JEBKURU apgalvojumu, tāpēc sargs sedz arī
    // `publicDocuments.ts` nosaukumus un aprakstus, ne tikai lapu pamattekstu.
    for (const doc of PUBLIC_DOCUMENTS) {
      for (const text of [doc.title, doc.description, doc.heading]) {
        expect(findForbidden(text), text).toEqual([]);
      }
    }
  });
});

describe("trumpju definīcija atbilst dzinējam", () => {
  const trumpList = TRUMPS.map((tile) => `${tile.side1}-${tile.side2}`).join(", ");

  it("dzinējā ir trumpis BEZ vieninieka, tāpēc 'katrs kauliņš ar 1' nav pilna definīcija", () => {
    // Šis ir viss testa iemesls: `0-0` ir trumpis, kurā vieninieka nav. Teksts, kas
    // saka tikai “katrs kauliņš, kurā ir viens”, klusi noklusē vienu — un stiprāko —
    // trumpi, un ir pretrunā ar blakus uzskaitītajiem astoņiem.
    const withoutOne = TRUMPS.filter((tile) => tile.side1 !== 1 && tile.side2 !== 1);
    expect(withoutOne.length).toBeGreaterThan(0);
  });

  for (const locale of INDEXED_LOCALES) {
    it(`${locale}: satur pilnu trumpju sarakstu dzinēja secībā`, () => {
      expect(allStrings(locale).join(" ")).toContain(trumpList);
    });

    it(`${locale}: katra trumpju definīcija nosauc arī 0-0`, () => {
      // Jebkurš teikums, kas trumpjus skaidro caur vieninieku, nedrīkst noklusēt 0-0.
      const definitions = allStrings(locale).filter(
        (text) => text.includes("containing a 1") || text.includes("kurā ir viens")
      );
      expect(definitions.length).toBeGreaterThan(0);
      for (const text of definitions) {
        expect(text, text).toContain("0-0");
      }
    });
  }
});

describe("How to play", () => {
  it("abās valodās ir vienāds soļu skaits", () => {
    const [first, second] = INDEXED_LOCALES;
    expect(getHowToPlay(second).steps).toHaveLength(getHowToPlay(first).steps.length);
  });

  it("ir īsa pamācība, nevis pilno noteikumu dublikāts", () => {
    for (const locale of INDEXED_LOCALES) {
      const howTo = getHowToPlay(locale);
      expect(howTo.steps.length).toBeGreaterThanOrEqual(4);
      expect(howTo.steps.length).toBeLessThanOrEqual(8);
      // Katram solim jābūt īsam: pamācība nedrīkst izaugt par otru noteikumu kopiju.
      for (const step of howTo.steps) {
        expect(step.body.length, step.title).toBeLessThan(400);
      }
    }
  });

  it("norāda uz pilnajiem noteikumiem", () => {
    for (const locale of INDEXED_LOCALES) {
      expect(getHowToPlay(locale).fullRulesNote.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Sākumlapa un čaula", () => {
  it("abās valodās ir vienāds sākumlapas sekciju skaits", () => {
    const [first, second] = INDEXED_LOCALES;
    expect(getHome(second).sections).toHaveLength(getHome(first).sections.length);
  });

  it("navigācijā ir etiķete katrai publiskajai lapai", () => {
    for (const locale of INDEXED_LOCALES) {
      const chrome = getPublicChrome(locale);
      for (const page of PUBLIC_PAGES) {
        expect(chrome.nav[page].trim().length, `${locale}:${page}`).toBeGreaterThan(0);
      }
      // Etiķetēm jābūt atšķirīgām, citādi navigācija nav lasāma.
      const labels = PUBLIC_PAGES.map((page) => chrome.nav[page]);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("valodas pārslēgs norāda uz OTRU valodu, ne uz sevi", () => {
    // `otherLanguageName` ir etiķete, ko rāda ŠAJĀ valodā, tāpēc tā nedrīkst sakrist.
    expect(getPublicChrome("en").otherLanguageName).not.toBe(
      getPublicChrome("lv").otherLanguageName
    );
  });
});

describe("Ekrānattēli", () => {
  it("abās valodās ir 2–4 attēli ar vienādu kopu", () => {
    const [first, second] = INDEXED_LOCALES;
    const a = getScreenshots(first);
    const b = getScreenshots(second);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(4);
    expect(b).toHaveLength(a.length);
    expect(b.map((i) => i.slug)).toEqual(a.map((i) => i.slug));
  });

  it("katram attēlam ir jēgpilns alt, kas NEDUBLĒ redzamo parakstu", () => {
    for (const locale of INDEXED_LOCALES) {
      for (const image of getScreenshots(locale)) {
        // Tukšs `alt` ir tikai dekoratīviem attēliem; šie nes informāciju.
        expect(image.alt.trim().length, `${locale}:${image.slug}`).toBeGreaterThan(20);
        expect(image.caption.trim().length, `${locale}:${image.slug}`).toBeGreaterThan(20);
        expect(image.alt, `${locale}:${image.slug}`).not.toBe(image.caption);
      }
    }
  });

  it("visi atsauktie faili tiešām eksistē public/images mapē", () => {
    // Bez šī trūkstošs attēls parādītos tikai produkcijā kā salauzta bilde.
    for (const image of getScreenshots("en")) {
      for (const width of [800, 1440]) {
        const path = new URL(
          `../public/images/${image.slug}-${width}.webp`,
          import.meta.url
        );
        expect(existsSync(path), `${image.slug}-${width}.webp`).toBe(true);
      }
    }
  });

  it("norādītie izmēri atbilst REĀLAJIEM failiem, nevis konstantei", () => {
    // `width`/`height` novērš izkārtojuma lēkāšanu (CLS) tikai tad, ja tie ir patiesi.
    // Tāpēc izmēri tiek nolasīti no pašu WebP failu galvenēm: ja kāds pārģenerē attēlus
    // citā izmērā un aizmirst atjaunot konstantes, šis tests krīt.
    for (const image of getScreenshots("en")) {
      const declaredRatio = image.width / image.height;

      for (const variant of [800, 1440]) {
        const path = new URL(`../public/images/${image.slug}-${variant}.webp`, import.meta.url);
        const bytes = readFileSync(path);
        const label = `${image.slug}-${variant}`;

        expect(bytes.toString("ascii", 0, 4), label).toBe("RIFF");
        expect(bytes.toString("ascii", 8, 12), label).toBe("WEBP");
        // Nolasīšanas nobīdes ir derīgas tikai VP8 (lossy) blokam, tāpēc to pārbauda.
        expect(bytes.toString("ascii", 12, 16), label).toBe("VP8 ");

        // VP8 kadra galvene: 14 bitu platums 26. baitā, augstums 28. baitā.
        const width = bytes.readUInt16LE(26) & 0x3fff;
        const height = bytes.readUInt16LE(28) & 0x3fff;
        expect(width, `${label} platums`).toBe(variant);
        // Abiem variantiem jāsaglabā tā pati proporcija, ko deklarē `width`/`height`.
        expect(Math.abs(width / height - declaredRatio), `${label} proporcija`).toBeLessThan(0.01);

        if (variant === image.width) {
          expect(height, `${label} augstums`).toBe(image.height);
        }
      }
    }
  });
});

describe("Stratēģija", () => {
  it("abās valodās ir vienāds sekciju skaits", () => {
    const [first, second] = INDEXED_LOCALES;
    expect(getStrategy(second).sections).toHaveLength(getStrategy(first).sections.length);
  });

  it("katrai sekcijai ir virsraksts un vismaz viena rindkopa", () => {
    for (const locale of INDEXED_LOCALES) {
      const strategy = getStrategy(locale);
      expect(strategy.sections.length).toBeGreaterThan(0);
      for (const section of strategy.sections) {
        expect(section.heading.trim().length).toBeGreaterThan(0);
        expect(section.paragraphs.length, section.heading).toBeGreaterThan(0);
      }
    }
  });

  it("satur skaidru atrunu, ka uzvara netiek solīta", () => {
    for (const locale of INDEXED_LOCALES) {
      expect(getStrategy(locale).disclaimer.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("About", () => {
  it("abās valodās ir vienāds faktu skaits", () => {
    const [first, second] = INDEXED_LOCALES;
    expect(getAbout(second).facts).toHaveLength(getAbout(first).facts.length);
  });

  it("satur projekta pamatfaktus", () => {
    for (const locale of INDEXED_LOCALES) {
      const values = getAbout(locale).facts.map((fact) => fact.value);
      expect(values).toContain("Rihards Laškovs");
      expect(values).toContain("Apache-2.0");
      // URL nāk no `site.ts`, nevis no otras kopijas šajā failā.
      expect(values).toContain(GITHUB_REPO_URL);
    }
  });

  it("nosauc visas trīs reālās grūtības un neizdomā ceturto", () => {
    for (const locale of INDEXED_LOCALES) {
      const text = getAbout(locale)
        .facts.map((fact) => fact.value)
        .join(" ");
      expect(text).toContain("Medium");
      expect(text).toContain("Hard");
      expect(text).toContain("Epic");
    }
  });

  it("skaidri pasaka, ka monētām nav reālas naudas vērtības", () => {
    expect(getAbout("en").coinsNote).toContain("no real-world value");
    expect(getAbout("lv").coinsNote).toContain("nav reālas naudas vērtības");
  });
});
