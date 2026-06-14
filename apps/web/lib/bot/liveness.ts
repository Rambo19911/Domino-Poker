// Liveness drošības tīkls SP AI kārtai. Lietotājs apzināti izņēma veco heiristisko AI; apmācītais
// bots ir vienīgais SP AI. Šie palīgi GARANTĒ, ka kārta nekad neiestrēgst, pat ja bots negaidīti
// atgriež nelegālu gājienu (vai met kļūdu) — TĀS NAV otrais AI, tikai deterministisks "spēle iet uz
// priekšu" sargs pa dzinēja noteikumiem. Pure (bez React/UI), lai to var unit-testēt.

import { getValidTiles, isTrump, playTile } from "@domino-poker/core";
import type { DominoTile, GameState } from "@domino-poker/core";

type Player = GameState["players"][number];

export type SimpleMove = {
  readonly tile: DominoTile;
  readonly declaredNumber: number | undefined;
};

// `playTile` virza spēli legālam gājienam; NELEGĀLAM tas atgriež NEMAINĪTU stāvokli (klusi), un met
// kļūdu pie nederīga declaredNumber. Šī funkcija atgriež nākamo stāvokli, JA gājiens virza spēli,
// citādi null. Tieši šī nemainītā-stāvokļa noraide citādi liktu React efektam nepārpalaisties → stall.
export function tryAdvance(state: GameState, move: SimpleMove | null): GameState | null {
  if (!move) return null;
  try {
    const next = playTile(state, move.tile, move.declaredNumber).state;
    return next !== state ? next : null;
  } catch {
    return null;
  }
}

// Deterministisks liveness gājiens: pirmais legālais kauliņš pa dzinēja noteikumiem, ar drošu
// pieteikuma skaitli vedumam (non-trump non-double — citādi `playTile` to noraidītu kā "nav pieteikta
// skaitļa"). Atgriež null tikai tad, ja legālu kauliņu nav (nereāli derīgā kārtā).
export function safetyMove(actor: Player, state: GameState): SimpleMove | null {
  const tile = getValidTiles(actor, state)[0];
  if (!tile) return null;
  const isLead = state.currentTrick.length === 0;
  const declaredNumber =
    isLead && !isTrump(tile) && tile.side1 !== tile.side2 ? tile.side1 : undefined;
  return { tile, declaredNumber };
}

// Atgriež nākamo stāvokli pēc AI gājiena: bota gājiens, ja tas virza spēli; citādi liveness drošības
// gājiens; citādi (nereāli) nemainīts stāvoklis. Garantē, ka kārta nekad neiestrēgst.
export function resolveAiMove(state: GameState, botMove: SimpleMove | null): GameState {
  const advanced = tryAdvance(state, botMove);
  if (advanced) return advanced;
  const actor = state.players[state.currentPlayerIndex];
  const safety = actor ? safetyMove(actor, state) : null;
  return tryAdvance(state, safety) ?? state;
}
