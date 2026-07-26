export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DominoId = string & { readonly __brand: "DominoId" };

export type MajorSymbol = "VASE" | "SCROLL" | "BOOK" | "SCARAB";
export type SpecialSymbol = MajorSymbol | "WILD" | "WILD_FULL" | "JACKPOT";
export type SymbolId = DominoId | SpecialSymbol;

const DOMINO_ID_PATTERN = /^[0-6]-[0-6]$/;

export function createDominoId(a: number, b: number): DominoId {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) {
    throw new Error(`Invalid domino pips: ${a}, ${b}`);
  }
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return `${low}-${high}` as DominoId;
}

export function isDomino(symbol: SymbolId): symbol is DominoId {
  return DOMINO_ID_PATTERN.test(symbol);
}

export function isMajor(symbol: SymbolId): symbol is MajorSymbol {
  return symbol === "VASE" || symbol === "SCROLL" || symbol === "BOOK" || symbol === "SCARAB";
}

export function isWild(symbol: SymbolId): boolean {
  return symbol === "WILD" || symbol === "WILD_FULL";
}
