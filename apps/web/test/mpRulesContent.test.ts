import { describe, expect, it } from "vitest";

import { getMpRulesDoc, type MpRulesDoc } from "../lib/mpRulesContent";

// Obligātās MP noteikumu sekcijas kā EN/LV pāri, dokumenta secībā.
//
// Sekcijām nav valodneitrālu ID — virsraksts ir vienīgais identifikators (to lieto arī
// kā React `key` MP noteikumu dialogā). Tāpēc pāri jānorāda tieši. Šeit dublējas TIKAI
// virsraksti, nevis noteikumu teksts: pilns teksts paliek vienā vietā `mpRulesContent.ts`.
//
// Ja sekcija tiek pārsaukta, izņemta vai pārkārtota tikai vienā valodā, šis tests krīt.
// Tas ir mērķis: publiskā EN un LV noteikumu lapa nedrīkst laika gaitā izšķirties.
const REQUIRED_SECTIONS: readonly (readonly [string, string])[] = [
  ["Public and Private Rooms", "Publiskās un privātās istabas"],
  ["Room Seats and Host Controls", "Istabas vietas un saimnieka vadība"],
  ["Gold Coins and Paid Rooms", "Zelta monētas un maksas istabas"],
  ["One Room at a Time", "Viena istaba vienlaikus"],
  ["Room Lifetime and TTL", "Istabas dzīves ilgums un TTL"],
  ["Starting the Game", "Spēles sākšana"],
  ["The 10-Second Turn Timer", "10 sekunžu gājiena taimeris"],
  ["Disconnects and Reconnects", "Atvienošanās un atkārtota pieslēgšanās"],
  ["Bidding and Gameplay", "Solīšana un spēles gaita"],
  ["Tile Rules", "Kauliņu noteikumi"],
  ["Scoring", "Punktu skaitīšana"],
  ["Privacy and Fairness", "Privātums un godīgums"],
  ["Statistics", "Statistika"]
];

const enDoc = getMpRulesDoc("en");
const lvDoc = getMpRulesDoc("lv");

const DOCS: readonly (readonly [string, MpRulesDoc, number])[] = [
  ["en", enDoc, 0],
  ["lv", lvDoc, 1]
];

describe("MP noteikumu dokuments", () => {
  it("EN un LV satur vienu un to pašu obligāto sekciju kopu", () => {
    for (const [code, doc, column] of DOCS) {
      const expected = REQUIRED_SECTIONS.map((pair) => pair[column]);
      expect(doc.sections.map((section) => section.title), code).toEqual(expected);
    }
  });

  it("abās valodās ir vienāds sekciju skaits", () => {
    expect(lvDoc.sections).toHaveLength(enDoc.sections.length);
    expect(enDoc.sections).toHaveLength(REQUIRED_SECTIONS.length);
  });

  it("pāru tabula nav deģenerēta — LV virsraksti nav EN kopijas", () => {
    // Sargs pret to, ka kāds iekopē EN virsrakstus LV kolonnā un tests kļūst tukšs.
    for (const [enTitle, lvTitle] of REQUIRED_SECTIONS) {
      expect(lvTitle, enTitle).not.toBe(enTitle);
    }
  });

  for (const [code, doc] of DOCS) {
    describe(code, () => {
      it("ievadam ir vismaz viena rindkopa un tās nav tukšas", () => {
        expect(doc.intro.length).toBeGreaterThan(0);
        for (const paragraph of doc.intro) {
          expect(paragraph.trim().length).toBeGreaterThan(0);
        }
      });

      it("virsraksti ir unikāli (dialogs tos lieto kā React key)", () => {
        const titles = doc.sections.map((section) => section.title);
        expect(new Set(titles).size).toBe(titles.length);
      });

      it("nevienai sekcijai nav tukšu bloku", () => {
        for (const section of doc.sections) {
          expect(section.blocks.length, section.title).toBeGreaterThan(0);
          for (const block of section.blocks) {
            if (typeof block === "string") {
              expect(block.trim().length, section.title).toBeGreaterThan(0);
            } else {
              expect(block.list.length, section.title).toBeGreaterThan(0);
              for (const item of block.list) {
                expect(item.trim().length, section.title).toBeGreaterThan(0);
              }
            }
          }
        }
      });
    });
  }

  it("nezināma valoda grimst uz EN", () => {
    // Publiskā lapa padod tikai `en`/`lv`, bet getter ir kopīgs ar 21 valodas UI.
    expect(getMpRulesDoc("zz")).toBe(getMpRulesDoc("en"));
    expect(getMpRulesDoc("lv")).not.toBe(getMpRulesDoc("en"));
  });
});
