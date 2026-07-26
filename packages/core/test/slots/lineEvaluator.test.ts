import { describe, expect, it } from "vitest";

import {
  collectCandidates,
  createDominoId,
  evaluateLine,
  evaluateLineWin,
  selectWinner,
  type Line,
  type SymbolId
} from "../../src/slots/index";

const d = (a: number, b: number): SymbolId => createDominoId(a, b);
const line = (...symbols: SymbolId[]): Line => symbols as unknown as Line;

describe("exact match (docs/01 section 5.3, math v3)", () => {
  it("WILD, 0-0, 0-0 is a royal trump exact 3", () => {
    const win = evaluateLineWin(line("WILD", d(0, 0), d(0, 0), d(0, 2), "JACKPOT"));
    expect(win).toMatchObject({
      category: "EXACT",
      startColumn: 0,
      length: 3,
      multiplierHundredths: 270
    });
    expect(win?.targetSymbol).toBe(d(0, 0));
  });

  it("an exact pair extends through substitutes and gets boosted", () => {
    // 1-6 pair + WILD + VASE: exact high trump 5 = 2760 x 2 (VASE+VASE = +100%).
    const win = evaluateLineWin(line(d(1, 6), d(1, 6), "WILD", "VASE", "VASE"));
    expect(win).toMatchObject({
      category: "EXACT",
      startColumn: 0,
      length: 5,
      multiplierHundredths: 5520
    });
  });

  it("a single domino padded by substitutes never pays", () => {
    expect(evaluateLineWin(line("BOOK", "WILD_FULL", "BOOK", "BOOK", d(2, 3)))).toBeNull();
  });

  it("0-4, WILD, 0-4, 0-4, 0-4 is a low regular exact 5", () => {
    const win = evaluateLineWin(line(d(0, 4), "WILD", d(0, 4), d(0, 4), d(0, 4)));
    expect(win).toMatchObject({ category: "EXACT", length: 5, multiplierHundredths: 280 });
  });

  it("majors alone never pay (they only boost domino runs)", () => {
    expect(evaluateLineWin(line("VASE", "VASE", "VASE", "VASE", "VASE"))).toBeNull();
    expect(evaluateLineWin(line("SCARAB", "SCARAB", "SCARAB", "JACKPOT", "VASE"))).toBeNull();
  });

  it("jackpot breaks every window that contains it", () => {
    // The pair sits in columns 3-4; every 3+ window with column 2 is dead.
    expect(evaluateLineWin(line(d(2, 3), d(2, 3), "JACKPOT", d(0, 2), "VASE"))).toBeNull();
  });
});

describe("floating runs (math v3: a run may start on any column)", () => {
  it("a trump combo in columns 1-3 pays even when column 0 breaks it", () => {
    const win = evaluateLineWin(line(d(0, 5), d(1, 6), d(1, 5), d(1, 4), d(0, 5)));
    expect(win).toMatchObject({
      category: "TRUMP_COMBO",
      startColumn: 1,
      length: 3,
      multiplierHundredths: 90
    });
  });

  it("a major extends the run and boosts it instead of breaking it", () => {
    // SCROLL + three trumps: trump combo 4 = 360 x 2 (SCROLL = +100%).
    const win = evaluateLineWin(line("SCROLL", d(1, 6), d(1, 5), d(1, 4), "JACKPOT"));
    expect(win).toMatchObject({
      category: "TRUMP_COMBO",
      startColumn: 0,
      length: 4,
      multiplierHundredths: 720
    });
  });

  it("a scarab boosts a royal pair by +200%", () => {
    const win = evaluateLineWin(line(d(0, 0), d(0, 0), "SCARAB", "JACKPOT", d(0, 2)));
    expect(win).toMatchObject({
      category: "EXACT",
      startColumn: 0,
      length: 3,
      multiplierHundredths: 810
    });
  });
});

describe("group combos need at least 3 dominoes (docs/01 section 5.5)", () => {
  it("two mixed trumps plus a wild pay nothing", () => {
    expect(evaluateLineWin(line(d(1, 6), d(1, 5), "WILD", "VASE", "VASE"))).toBeNull();
  });

  it("three mixed aces pay the ace combo and grow through substitutes", () => {
    // Columns 0-3: three aces -> ace combo 4 = 260; with VASE: 860 x 1.5.
    const win = evaluateLineWin(line(d(6, 6), d(2, 2), "WILD", d(0, 6), "VASE"));
    expect(win).toMatchObject({
      category: "ACE_COMBO",
      startColumn: 0,
      length: 5,
      multiplierHundredths: 1290
    });
  });

  it("0-2, 0-3, 0-4 is a low regular tier combo that grows with boosters", () => {
    const win = evaluateLineWin(line(d(0, 2), d(0, 3), d(0, 4), "VASE", "VASE"));
    expect(win).toMatchObject({
      category: "LOW_REGULAR_COMBO",
      startColumn: 0,
      length: 5,
      multiplierHundredths: 420 // 210 x 2 (two VASE boosters)
    });
  });

  it("mixed regular tiers pay nothing (2-3, 3-4 are mid; 4-5 is high)", () => {
    expect(evaluateLineWin(line(d(2, 3), d(3, 4), d(4, 5), "JACKPOT", "VASE"))).toBeNull();
  });

  it("all five high regulars pay the tier combo 5", () => {
    const win = evaluateLineWin(line(d(5, 6), d(4, 6), d(3, 6), d(4, 5), d(2, 6)));
    expect(win).toMatchObject({
      category: "HIGH_REGULAR_COMBO",
      length: 5,
      multiplierHundredths: 550
    });
  });

  it("an exact pair outpays the same-window tier combo", () => {
    // 2-3, 2-3, 2-4: mid tier combo 3 (30) vs mid exact on the pair windows.
    const win = evaluateLineWin(line(d(2, 3), d(2, 3), d(2, 4), "JACKPOT", "VASE"));
    expect(win?.category).toBe("MID_REGULAR_COMBO");
    expect(win?.multiplierHundredths).toBe(30);
    const pair = evaluateLineWin(line(d(2, 3), d(2, 3), "WILD", "JACKPOT", "VASE"));
    expect(pair).toMatchObject({ category: "EXACT", multiplierHundredths: 40 });
  });
});

describe("all wild (docs/01 section 5.2)", () => {
  it("a pure wild run pays all wild; majors do not join it", () => {
    const win = evaluateLineWin(line("WILD", "WILD_FULL", "WILD", "VASE", d(2, 3)));
    expect(win).toMatchObject({
      category: "ALL_WILD",
      startColumn: 0,
      length: 3,
      multiplierHundredths: 330
    });
  });

  it("five wilds pay the top all wild", () => {
    const win = evaluateLineWin(line("WILD_FULL", "WILD", "WILD", "WILD_FULL", "WILD"));
    expect(win).toMatchObject({ category: "ALL_WILD", length: 5, multiplierHundredths: 11260 });
  });
});

describe("evaluateLine money", () => {
  it("boosted low regular tier combo pays 420 coins at line bet 100", () => {
    const outcome = evaluateLine(line(d(0, 2), d(0, 3), d(0, 4), "VASE", "VASE"), 0, 100);
    expect(outcome.winCoins).toBe(420n);
    expect(outcome.lineIndex).toBe(0);
  });

  it("boosted exact stays integer at the maximum allowed bet", () => {
    // 270 x 3 = 810 hundredths; at bet 200 the win is 1620 coins.
    const outcome = evaluateLine(line(d(0, 0), d(0, 0), "SCARAB", "JACKPOT", d(0, 2)), 4, 200);
    expect(outcome.winCoins).toBe(1620n);
  });

  it("boosted exact stays integer at the minimum allowed bet", () => {
    // The 5x rescale's tightest case: 810 hundredths at bet 20 is 162 coins.
    const outcome = evaluateLine(line(d(0, 0), d(0, 0), "SCARAB", "JACKPOT", d(0, 2)), 4, 20);
    expect(outcome.winCoins).toBe(162n);
  });

  it("no win returns a zero outcome", () => {
    const outcome = evaluateLine(line("VASE", "SCROLL", "BOOK", "SCARAB", "VASE"), 2, 200);
    expect(outcome).toMatchObject({ category: null, length: 0, winCoins: 0n });
  });
});

describe("winner ordering (docs/01 5.1: pay, length, leftmost, category)", () => {
  const candidate = (
    pay: number,
    length: 3 | 4 | 5,
    startColumn: 0 | 1 | 2,
    category: "EXACT" | "TRUMP_COMBO" | "LOW_REGULAR_COMBO" = "EXACT"
  ) => ({
    category,
    startColumn,
    length,
    targetSymbol: null,
    multiplierHundredths: pay
  });

  it("a higher payout beats a longer run", () => {
    expect(selectWinner([candidate(400, 5, 0), candidate(500, 3, 2)])).toMatchObject({
      multiplierHundredths: 500,
      length: 3
    });
  });

  it("at equal payout the longer run wins", () => {
    expect(selectWinner([candidate(500, 3, 0), candidate(500, 4, 1)])).toMatchObject({
      length: 4
    });
  });

  it("at equal payout and length the leftmost run wins", () => {
    expect(selectWinner([candidate(500, 3, 2), candidate(500, 3, 0)])).toMatchObject({
      startColumn: 0
    });
  });

  it("at a full tie the stronger category wins", () => {
    expect(
      selectWinner([candidate(500, 3, 0, "LOW_REGULAR_COMBO"), candidate(500, 3, 0, "EXACT")])
    ).toMatchObject({ category: "EXACT" });
  });
});

describe("fast evaluator agrees with the candidate specification", () => {
  it("matches selectWinner(collectCandidates(...)) on a deterministic sample", () => {
    const symbols: SymbolId[] = [
      d(0, 0),
      d(0, 1),
      d(0, 6),
      d(1, 2),
      d(2, 2),
      d(2, 3),
      d(2, 6),
      d(3, 4),
      d(5, 6),
      d(0, 2),
      "VASE",
      "SCROLL",
      "BOOK",
      "SCARAB",
      "WILD",
      "WILD_FULL",
      "JACKPOT"
    ];
    // Deterministic LCG so the sample is reproducible.
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let i = 0; i < 20000; i++) {
      const sample = line(
        symbols[next() % symbols.length] as SymbolId,
        symbols[next() % symbols.length] as SymbolId,
        symbols[next() % symbols.length] as SymbolId,
        symbols[next() % symbols.length] as SymbolId,
        symbols[next() % symbols.length] as SymbolId
      );
      const fast = evaluateLineWin(sample);
      const reference = selectWinner(collectCandidates(sample));
      if (reference === null) {
        expect(fast).toBeNull();
      } else {
        expect(fast).toEqual(reference);
      }
    }
  });
});
