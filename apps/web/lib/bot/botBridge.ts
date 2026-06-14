// Tilts starp lokālo "Domino Poker" spēli (packages/core, kauliņi kā {side1,side2})
// un atsevišķi apmācīto stipro botu (packages/ai_bot, kauliņi kā bitmaskas indekss 0..27).
//
// Bota `ai` + `engine` pakotnes ir tīras ESM bez Node atkarībām, tāpēc tās importējam
// tieši pārlūka pakojumā (caur npm workspace) un apejam `bot-adapter` (kas lieto Node
// worker_threads). Meklēšana notiek inline ar yield-iem (sk. decideMove).
//
// Verificētie invarianti, kas padara šo tiltu uzticamu (validēts references projektā,
// 1760 skati baitu-precīzi pret bota paša createPlayerView, e2e ar nulle kļūdu):
//   - Abi dzinēji lieto IDENTISKU trumpju kopu/secību (0-0 stiprākais .. 1-0 vājākais)
//     un dūžu kopu (6-6,5-5,4-4,3-3,2-2,0-6), tāpēc kauliņa indekss <-> {side1,side2} ir
//     bezzudumu kartējums.
//   - core Player.bid noklusējums ir -1, identisks bota "vēl nav solījis" sentinelim.
//   - Gājienu meklēšanā kārta un stiķa rotācija nāk TIKAI no view.trick (vedējs +
//     plays.length); history saturs vada tikai void izsecināšanu; firstSeat netiek lietots
//     gājienu meklēšanā (bez pretinieku profiliem).
//   - Bots saplūdina "pirmo solītāju" un "pirmā stiķa vedēju" vienā firstSeat. Galvenā spēle
//     tos nodala (solīšana sākas dealer+1, pirmo stiķi ved dīleris). Kartējam
//     firstSeat = dealerIndex, jo tā ir sēdvieta ar reālo vešanas priekšrocību, ko bota
//     solīšanas modelis (+0.45 sagaidāmie stiķi vedējam) cenšas notvert.

import type { DominoTile, GameState, PlayedTile } from "@domino-poker/core";

import type {
  Move,
  PlayerView,
  PlayEvent,
  Seat,
  SeatTuple,
  TrickState
} from "@domino-poker/engine";
import {
  appendTrickMove,
  createEmptyTrick,
  getTile,
  isTrump as tileIsTrump,
  tileBit,
  tileIndex
} from "@domino-poker/engine";

import { BOT_DIFFICULTIES, type BotDifficulty } from "./difficulty";

// Grūtības budžeti (bidSamples / moveIterations) dzīvo vieglajā `difficulty.ts`, lai lobby
// to var importēt, neievelkot šo moduli (sk. AppShell code-split komentāru). Smago meklēšanu
// (`@domino-poker/ai`) NEIMPORTĒ šeit — tā dzīvo `botWorker.ts` (off-thread, sk. zemāk).

// Drošības rezerve, ja worker neuzstartē/uzkaras (slikts URL, crash) — lēmums tiek noraidīts, un
// izsaucēja liveness tīkls pārņem. Worker pats nekad nebloķē UI; tas ir tikai "nekad uz mūžu".
const WORKER_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Kauliņu + gājienu konversija (core {side1,side2} -> bota indekss/Move)
// ---------------------------------------------------------------------------

function toTileIndex(tile: DominoTile): number {
  return tileIndex(tile.side1, tile.side2);
}

// Viens autoritatīvs avots izspēlētā kauliņa calledPip vērtībai (void izsecināšanas
// korektuma riska punkts):
//   - trumpja vedums          -> -1
//   - non-trump vedums        -> pieteiktais pips, vai non-trump dūsim tā vienīgais pips
//   - sekošana (apstrādā izsaucējs) -> -1
function leadCalledPip(tile: DominoTile, declaredNumber: number | undefined): number {
  if (tileIsTrump(toTileIndex(tile))) return -1;
  if (declaredNumber !== undefined) return declaredNumber;
  // Non-trump dūsim (piem. 5-5) ir tikai viens pips; jebkura puse ir pieteiktais pips.
  return tile.side1;
}

function toBotMove(play: PlayedTile, isLead: boolean): Move {
  return {
    tile: toTileIndex(play.tile),
    calledPip: isLead ? leadCalledPip(play.tile, play.declaredNumber) : -1
  };
}

function handToMask(hand: readonly DominoTile[]): number {
  let mask = 0;
  for (const tile of hand) {
    mask |= tileBit(toTileIndex(tile));
  }
  return mask;
}

function clampSeat(index: number): Seat {
  return (index & 3) as Seat;
}

function clampPos(index: number): 0 | 1 | 2 | 3 {
  return (index & 3) as 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// PlayerView rekonstrukcija
// ---------------------------------------------------------------------------

// Rekonstruē pašreizējo stiķi caur pašu dzinēju (createEmptyTrick + appendTrickMove), lai
// katrs atvasinātais lauks (calledPip, leadIsTrump, maxTrumpRank, anyTrumpPlayed) tiek
// aprēķināts ar bota paša noteikumiem, nevis dublēts šeit. Vedējs ir sēdvieta, kas šajā
// stiķī izgāja pirmā, vai — tukšam stiķim — tas, kurš tūlīt vedīs (currentPlayerIndex).
function buildTrick(state: GameState): TrickState {
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
function buildHistory(state: GameState): PlayEvent[] {
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

export function buildPlayerView(state: GameState, seat: number): PlayerView {
  const player = state.players[seat];
  if (!player) {
    throw new Error(`buildPlayerView: no player at seat ${seat}.`);
  }

  const bids: SeatTuple<number> = [
    state.players[0]?.bid ?? -1,
    state.players[1]?.bid ?? -1,
    state.players[2]?.bid ?? -1,
    state.players[3]?.bid ?? -1
  ];
  const taken: SeatTuple<number> = [
    state.players[0]?.tricksWon ?? 0,
    state.players[1]?.tricksWon ?? 0,
    state.players[2]?.tricksWon ?? 0,
    state.players[3]?.tricksWon ?? 0
  ];

  return {
    seat: clampSeat(seat),
    hand: handToMask(player.hand),
    bids,
    taken,
    firstSeat: clampSeat(state.dealerIndex), // pirmā-stiķa-vedējs (sk. galvenes piezīmi)
    trick: buildTrick(state),
    history: buildHistory(state)
  };
}

// ---------------------------------------------------------------------------
// Lēmumi
// ---------------------------------------------------------------------------

// Deterministisks-bet-pozīciju-mainīgs seed. Izvairās no Math.random (reproducējami
// rezultāti), vienlaikus dodot katrai atšķirīgai pozīcijai savu RNG plūsmu.
function seedFor(view: PlayerView): number {
  let seed = Math.imul(view.seat + 1, 0x9e3779b1) >>> 0;
  seed = (seed ^ Math.imul(view.history.length + 1, 0x85ebca77)) >>> 0;
  seed = (seed ^ Math.imul(view.hand | 1, 0xc2b2ae35)) >>> 0;
  return seed >>> 0;
}

// ---------------------------------------------------------------------------
// Web Worker transports (bota aprēķins off-thread)
// ---------------------------------------------------------------------------

type WorkerResponse = {
  readonly id: number;
  readonly bid?: number;
  readonly move?: Move;
  readonly error?: string;
};

type PendingRequest = {
  readonly resolve: (response: WorkerResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function settle(id: number, apply: (entry: PendingRequest) => void): void {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  apply(entry);
}

// Worker crash VAI noildze: noraida visus uzdevumus darbā (izsaucēja liveness tīkls pārņem) un
// atmet worker, lai nākamais izsaukums izveido SVAIGU — citādi uzkāries worker liktu katram
// nākamajam izsaukumam gaidīt pilnu noildzi.
function recycleWorker(error: Error): void {
  for (const id of [...pending.keys()]) settle(id, (entry) => entry.reject(error));
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  // Slinki (pirmajā lēmumā, vienmēr pārlūkā — sk. botBridge izsaukuma vietu) un atkārtoti lietots.
  worker = new Worker(new URL("./botWorker.ts", import.meta.url));
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    settle(response.id, (entry) =>
      response.error ? entry.reject(new Error(response.error)) : entry.resolve(response)
    );
  };
  worker.onerror = (event) => {
    recycleWorker(new Error(event.message || "bot worker error"));
  };
  return worker;
}

// Solījuma/gājiena pieprasījums worker-im (bez `id`; to pievieno requestFromWorker).
type BotWorkerRequest =
  | { kind: "bid"; view: PlayerView; bidSamples: number; seed: number }
  | { kind: "move"; view: PlayerView; moveIterations: number; seed: number };

function requestFromWorker(message: BotWorkerRequest): Promise<WorkerResponse> {
  const id = nextRequestId++;
  const activeWorker = getWorker();
  return new Promise<WorkerResponse>((resolve, reject) => {
    const timer = setTimeout(
      // Noildze = worker, visticamāk, uzkāries: atjauno to (un noraida šo + pārējos), lai
      // nākamais izsaukums sāk ar svaigu worker, nevis atkal gaida pilnu noildzi.
      () => recycleWorker(new Error("bot worker timed out")),
      WORKER_TIMEOUT_MS
    );
    pending.set(id, { resolve, reject, timer });
    activeWorker.postMessage({ id, ...message });
  });
}

// ---------------------------------------------------------------------------
// Lēmumi (async; aprēķins notiek worker-ī)
// ---------------------------------------------------------------------------

export async function decideBid(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty
): Promise<number> {
  const view = buildPlayerView(state, seat);
  const { bidSamples } = BOT_DIFFICULTIES[difficulty];
  const response = await requestFromWorker({ kind: "bid", view, bidSamples, seed: seedFor(view) });
  if (typeof response.bid !== "number") throw new Error("bot worker: invalid bid response");
  return response.bid;
}

export type BotMove = {
  readonly tile: DominoTile;
  readonly declaredNumber: number | undefined;
};

export async function decideMove(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty
): Promise<BotMove> {
  const view = buildPlayerView(state, seat);
  const { moveIterations } = BOT_DIFFICULTIES[difficulty];
  const response = await requestFromWorker({
    kind: "move",
    view,
    moveIterations,
    seed: seedFor(view)
  });
  if (!response.move) throw new Error("bot worker: invalid move response");
  const tile = getTile(response.move.tile);
  return {
    tile: { side1: tile.a, side2: tile.b },
    declaredNumber: response.move.calledPip >= 0 ? response.move.calledPip : undefined
  };
}
