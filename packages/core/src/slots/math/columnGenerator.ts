import {
  CELL_TICKETS,
  CELL_TICKET_TOTAL,
  COLUMN_TOKEN_TOTAL,
  FULL_WILD_WEIGHT
} from "../config/mathConfig";
import type { Grid, GridCell, GridRow } from "../domain/outcomes";
import type { SymbolId } from "../domain/symbols";
import { randomInt } from "./randomInt";
import type { RandomSource } from "./RandomSource";

export type Column = readonly [GridCell, GridCell, GridCell];

function drawCell(source: RandomSource): GridCell {
  const ticket = randomInt(source, CELL_TICKET_TOTAL);
  const symbol = CELL_TICKETS[ticket] as SymbolId;
  return { symbol, fromFullWildColumn: false };
}

/** One independent column: 4/128 full stacked Wild, otherwise 3 cell draws. */
export function generateColumn(source: RandomSource): Column {
  const columnToken = randomInt(source, COLUMN_TOKEN_TOTAL);
  if (columnToken < FULL_WILD_WEIGHT) {
    const cell: GridCell = { symbol: "WILD_FULL", fromFullWildColumn: true };
    return [cell, cell, cell];
  }
  return [drawCell(source), drawCell(source), drawCell(source)];
}

export function generateGrid(source: RandomSource): Grid {
  const columns = [
    generateColumn(source),
    generateColumn(source),
    generateColumn(source),
    generateColumn(source),
    generateColumn(source)
  ] as const;
  const row = (r: 0 | 1 | 2): GridRow =>
    [columns[0][r], columns[1][r], columns[2][r], columns[3][r], columns[4][r]] as const;
  return [row(0), row(1), row(2)];
}
