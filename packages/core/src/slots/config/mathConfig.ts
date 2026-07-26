import { DOMINO_IDS } from "../domain/domino";
import type { SymbolId } from "../domain/symbols";

export const COLUMN_TOKEN_TOTAL = 128;
export const FULL_WILD_WEIGHT = 4;
export const CELL_TICKET_TOTAL = 124;
export const DOMINO_CELL_WEIGHT = 3;

export const SPECIAL_CELL_WEIGHTS: ReadonlyMap<SymbolId, number> = new Map<SymbolId, number>([
  ["VASE", 9],
  ["SCROLL", 8],
  ["BOOK", 7],
  ["SCARAB", 6],
  ["WILD", 7],
  ["JACKPOT", 3]
]);

export const CELL_SYMBOL_WEIGHTS: ReadonlyMap<SymbolId, number> = new Map<SymbolId, number>([
  ...DOMINO_IDS.map((id): [SymbolId, number] => [id, DOMINO_CELL_WEIGHT]),
  ...SPECIAL_CELL_WEIGHTS
]);

/** 124 tickets, one entry per weight unit; index = cellToken. */
export const CELL_TICKETS: readonly SymbolId[] = Object.freeze(
  [...CELL_SYMBOL_WEIGHTS.entries()].flatMap(([symbol, weight]) =>
    Array.from({ length: weight }, () => symbol)
  )
);

function validateMathConfig(): true {
  if (DOMINO_IDS.length !== 28) {
    throw new Error(`Expected 28 dominoes, received ${DOMINO_IDS.length}`);
  }
  const weightSum = [...CELL_SYMBOL_WEIGHTS.values()].reduce((a, b) => a + b, 0);
  if (weightSum !== CELL_TICKET_TOTAL) {
    throw new Error(`Cell weight sum must be ${CELL_TICKET_TOTAL}, received ${weightSum}`);
  }
  if (CELL_TICKETS.length !== CELL_TICKET_TOTAL) {
    throw new Error(`Cell ticket count must be ${CELL_TICKET_TOTAL}`);
  }
  if (FULL_WILD_WEIGHT + CELL_TICKET_TOTAL !== COLUMN_TOKEN_TOTAL) {
    throw new Error("Full wild weight plus cell tickets must equal the column token total");
  }
  return true;
}

export const MATH_CONFIG_VALID = validateMathConfig();
