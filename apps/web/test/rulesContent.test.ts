import { describe, expect, it } from "vitest";

import { en } from "../lib/locales/en";
import { lv } from "../lib/locales/lv";
import { getSpRulesSections, type SpRuleSection } from "../lib/rulesContent";
import type { AppStrings } from "../lib/i18n";

/** Indeksēta piekļuve ar skaidru kļūdu (`noUncheckedIndexedAccess`). */
function sectionAt(sections: readonly SpRuleSection[], index: number): SpRuleSection {
  const section = sections[index];
  if (!section) throw new Error(`nav sekcijas ar indeksu ${index}`);
  return section;
}

const LOCALES: readonly (readonly [string, AppStrings])[] = [
  ["en", en],
  ["lv", lv]
];

// Spēles invarianti, kas noteikumos ir jāatspoguļo. Šie skaitļi nav testa izdomāti —
// tie nāk no noteikumu teksta (`lib/locales/*.ts`) un no spēles uzbūves.
const INVARIANTS = {
  players: 4,
  tilesPerPlayer: 7,
  tilesTotal: 28,
  minBid: 0,
  maxBid: 7,
  exactTrickPoints: 15,
  overTrickPoints: 5,
  underTrickPenalty: -5,
  sevenBonus: 50
} as const;

// Vārdiskās vērtības noteikumu tekstā ir lokalizētas, tāpēc tās jānorāda per-locale.
// Ja kāds pārraksta noteikumu formulējumu, šis tests krīt — un tam TĀ ir jābūt:
// noteikumu teksta maiņa ir apzināts lēmums, ne blakusefekts.
const SETUP_TOKENS: Record<string, readonly string[]> = {
  en: ["Four players", "double-six", "seven tiles"],
  lv: ["četri spēlētāji", "dubulto sešinieku", "septiņus kauliņus"]
};

describe("SP noteikumu dokuments", () => {
  it("skaitliskie invarianti ir savstarpēji saskanīgi", () => {
    // Dubultsešinieku komplekts = 28 kauliņi; četri spēlētāji pa septiņiem izdala visus.
    expect(INVARIANTS.players * INVARIANTS.tilesPerPlayer).toBe(INVARIANTS.tilesTotal);
    // Solījums nedrīkst pārsniegt stiķu skaitu raundā.
    expect(INVARIANTS.maxBid).toBe(INVARIANTS.tilesPerPlayer);
  });

  for (const [code, labels] of LOCALES) {
    describe(code, () => {
      const sections = getSpRulesSections(labels);

      it("satur tieši deviņas sekcijas noteiktā secībā", () => {
        expect(sections.map((section) => section.title)).toEqual([
          labels.rulesObjectiveTitle,
          labels.rulesSetupTitle,
          labels.rulesRoundFlowTitle,
          labels.rulesBiddingTitle,
          labels.rulesTileRanksTitle,
          labels.rulesPlayTitle,
          labels.rulesWinTitle,
          labels.rulesCoinsTitle,
          labels.rulesStatsTitle
        ]);
      });

      it("rindkopas nāk no AppStrings nemainītā secībā", () => {
        // Pilns kartējums: pierāda, ka izcelšana no dialoga neko nezaudēja un nepārkārtoja.
        expect(sections.map((section) => section.body)).toEqual([
          [labels.rulesObjectiveBody],
          [labels.rulesSetupBody],
          [labels.rulesRoundFlowBody],
          [
            labels.rulesBiddingBody,
            labels.rulesBiddingExact,
            labels.rulesBiddingOver,
            labels.rulesBiddingUnder,
            labels.rulesBiddingSeven
          ],
          [labels.rulesTrumpsBody, labels.rulesAcesBody, labels.rulesRegularTilesBody],
          [
            labels.rulesPlayLeadBody,
            labels.rulesPlayTrumpBody,
            labels.rulesPlayAceBody,
            labels.rulesPlayRegularBody
          ],
          [labels.rulesWinBody],
          [labels.rulesCoinsIntro, labels.rulesCoinsSpBody, labels.rulesCoinsMpBody],
          [labels.rulesStatsBody]
        ]);
      });

      it("nevienā sekcijā nav tukša virsraksta vai rindkopas", () => {
        for (const section of sections) {
          expect(section.title.trim().length).toBeGreaterThan(0);
          expect(section.body.length).toBeGreaterThan(0);
          for (const paragraph of section.body) {
            expect(paragraph.trim().length).toBeGreaterThan(0);
          }
        }
      });

      it("virsraksti ir unikāli (dialogs tos lieto kā React key)", () => {
        const titles = sections.map((section) => section.title);
        expect(new Set(titles).size).toBe(titles.length);
      });

      it("sagatavošanās sekcija nosauc 4 spēlētājus, komplektu un 7 kauliņus", () => {
        const text = sectionAt(sections, 1).body.join(" ");
        for (const token of SETUP_TOKENS[code] ?? []) {
          expect(text).toContain(token);
        }
      });

      it("solīšanas sekcija satur diapazonu 0..7 un punktu vērtības", () => {
        // Cipari ir vienādi visās valodās, tāpēc šī pārbaude nav atkarīga no formulējuma.
        // Katra vērtība tiek meklēta SAVĀ rindkopā un ar vārda robežām: pretējā gadījumā
        // "0" trāpītu "50" iekšienē un "5" — "15" vai "-50" iekšienē, un tests būtu tukšs.
        const [range, exact, over, under, seven] = sectionAt(sections, 3).body;

        expect(range).toMatch(new RegExp(`\\b${INVARIANTS.minBid}\\b`));
        expect(range).toMatch(new RegExp(`\\b${INVARIANTS.maxBid}\\b`));
        expect(exact).toMatch(new RegExp(`\\b${INVARIANTS.exactTrickPoints}\\b`));
        expect(over).toMatch(new RegExp(`\\b${INVARIANTS.overTrickPoints}\\b`));
        expect(under).toMatch(new RegExp(`${INVARIANTS.underTrickPenalty}\\b`));
        expect(seven).toMatch(new RegExp(`\\b${INVARIANTS.maxBid}\\b`));
        expect(seven).toContain(`+${INVARIANTS.sevenBonus}`);
        expect(seven).toContain(`-${INVARIANTS.sevenBonus}`);
      });
    });
  }
});
