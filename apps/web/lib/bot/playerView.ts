// Tīrās konversijas no "Domino Poker" spēles state uz atsevišķi apmācītā stiprā bota
// (packages/ai_bot) `PlayerView`. VIENĪGAIS avots šīm konversijām — dala GAN vienspēlētāja
// tilts (`botBridge.ts`, core `GameState`), GAN daudzspēlētāja builder (`../mp/botView.ts`,
// servera `PlayerSnapshot`). Nedublēt stiķa/vēstures rekonstrukciju vai calledPip loģiku (D10).
//
// Verificētie invarianti (validēti references projektā, baitu-precīzi pret bota paša
// createPlayerView): abi dzinēji lieto IDENTISKU trumpju/dūžu kopu → kauliņa indekss <->
// {side1,side2} ir bezzudumu; kārta un stiķa rotācija nāk TIKAI no trick (vedējs +
// plays.length); history saturs vada tikai void izsecināšanu; firstSeat = dealerIndex (sēdvieta
// ar reālo vešanas priekšrocību, ko bota solīšanas modelis cenšas notvert).

import type { DominoTile, PlayedTile } from "@domino-poker/core";

import type { Move, PlayerView, PlayEvent, Seat, SeatTuple, TrickState } from "@domino-poker/engine";
import {
  appendTrickMove,
  createEmptyTrick,
  isTrump as tileIsTrump,
  tileBit,
  tileIndex
} from "@domino-poker/engine";

/**
 * Minimālais strukturālais avots stiķa/vēstures rekonstrukcijai. Apzināti šaurs, lai to
 * apmierinātu GAN core `GameState` (SP), GAN MP `PlayerSnapshot` (abiem ir tieši šie trīs
 * lauki ar identisku `PlayedTile` formu) — tā abi ceļi dala vienu konversiju bez dublēšanas.
 */
export interface TrickSourceState {
  readonly currentTrick: readonly PlayedTile[];
  readonly completedTricks: readonly (readonly PlayedTile[])[];
  readonly currentPlayerIndex: number;
}

export function toTileIndex(tile: DominoTile): number {
  return tileIndex(tile.side1, tile.side2);
}

// Viens autoritatīvs avots izspēlētā kauliņa calledPip vērtībai (void izsecināšanas
// korektuma riska punkts):
//   - trumpja vedums          -> -1
//   - non-trump vedums        -> pieteiktais pips, vai non-trump dūsim tā vienīgais pips
//   - sekošana (apstrādā izsaucējs) -> -1
export function leadCalledPip(tile: DominoTile, declaredNumber: number | undefined): number {
  if (tileIsTrump(toTileIndex(tile))) return -1;
  if (declaredNumber !== undefined) return declaredNumber;
  // Non-trump dūsim (piem. 5-5) ir tikai viens pips; jebkura puse ir pieteiktais pips.
  return tile.side1;
}

export function toBotMove(play: PlayedTile, isLead: boolean): Move {
  return {
    tile: toTileIndex(play.tile),
    calledPip: isLead ? leadCalledPip(play.tile, play.declaredNumber) : -1
  };
}

export function handToMask(hand: readonly DominoTile[]): number {
  let mask = 0;
  for (const tile of hand) {
    mask |= tileBit(toTileIndex(tile));
  }
  return mask;
}

export function clampSeat(index: number): Seat {
  return (index & 3) as Seat;
}

export function clampPos(index: number): 0 | 1 | 2 | 3 {
  return (index & 3) as 0 | 1 | 2 | 3;
}

// Rekonstruē pašreizējo stiķi caur pašu dzinēju (createEmptyTrick + appendTrickMove), lai
// katrs atvasinātais lauks (calledPip, leadIsTrump, maxTrumpRank, anyTrumpPlayed) tiek
// aprēķināts ar bota paša noteikumiem, nevis dublēts šeit. Vedējs ir sēdvieta, kas šajā
// stiķī izgāja pirmā, vai — tukšam stiķim — tas, kurš tūlīt vedīs (currentPlayerIndex).
export function buildTrick(state: TrickSourceState): TrickState {
  const leader: Seat =
    state.currentTrick.length > 0
      ? clampSeat(state.currentTrick[0]!.playerIndex)
      : clampSeat(state.currentPlayerIndex);

  let trick = createEmptyTrick(leader);
  state.currentTrick.forEach((play, index) => {
    trick = appendTrickMove(trick, clampSeat(play.playerIndex), toBotMove(play, index === 0));
  });
  return trick;
}

// Bota izsecināšana grupē vēsturi pēc event.trickNo / event.posInTrick (NEVIS masīva
// secības), tāpēc abi jāiestata precīzi. Pašreizējā (nepabeigtā) stiķa gājieni parādās
// GAN history, GAN trick — tieši kā dzinēja paša reprezentācijā.
export function buildHistory(state: TrickSourceState): PlayEvent[] {
  const events: PlayEvent[] = [];

  state.completedTricks.forEach((trick, trickNo) => {
    trick.forEach((play, pos) => {
      events.push({
        seat: clampSeat(play.playerIndex),
        move: toBotMove(play, pos === 0),
        trickNo,
        posInTrick: clampPos(pos)
      });
    });
  });

  const currentTrickNo = state.completedTricks.length;
  state.currentTrick.forEach((play, pos) => {
    events.push({
      seat: clampSeat(play.playerIndex),
      move: toBotMove(play, pos === 0),
      trickNo: currentTrickNo,
      posInTrick: clampPos(pos)
    });
  });

  return events;
}

/**
 * Salikuma palīgs (dala SP + MP builderi): uzbūvē `PlayerView` no jau atrisinātām daļām.
 * Solītāji/paņemtie ir SĒDVIETU secībā (indekss = sēdvieta); `hand` ir SKATĪTĀJA roka.
 */
export function assemblePlayerView(parts: {
  readonly seat: number;
  readonly hand: readonly DominoTile[];
  readonly bids: SeatTuple<number>;
  readonly taken: SeatTuple<number>;
  readonly dealerIndex: number;
  readonly trickSource: TrickSourceState;
}): PlayerView {
  return {
    seat: clampSeat(parts.seat),
    hand: handToMask(parts.hand),
    bids: parts.bids,
    taken: parts.taken,
    firstSeat: clampSeat(parts.dealerIndex), // pirmā-stiķa-vedējs (sk. galvenes piezīmi)
    trick: buildTrick(parts.trickSource),
    history: buildHistory(parts.trickSource)
  };
}

/**
 * Deterministisks-bet-pozīciju-mainīgs seed. Izvairās no Math.random (reproducējami
 * rezultāti), vienlaikus dodot katrai atšķirīgai pozīcijai savu RNG plūsmu.
 */
export function seedFor(view: PlayerView): number {
  let seed = Math.imul(view.seat + 1, 0x9e3779b1) >>> 0;
  seed = (seed ^ Math.imul(view.history.length + 1, 0x85ebca77)) >>> 0;
  seed = (seed ^ Math.imul(view.hand | 1, 0xc2b2ae35)) >>> 0;
  return seed >>> 0;
}
