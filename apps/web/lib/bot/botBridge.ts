// Tilts starp lokālo "Domino Poker" spēli (packages/core, kauliņi kā {side1,side2})
// un atsevišķi apmācīto stipro botu (packages/ai_bot, kauliņi kā bitmaskas indekss 0..27).
//
// Bota `ai` + `engine` pakotnes ir tīras ESM bez Node atkarībām, tāpēc tās importējam
// tieši pārlūka pakojumā (caur npm workspace) un apejam `bot-adapter` (kas lieto Node
// worker_threads). Meklēšana notiek off-thread Web Worker-ī (sk. decideMove/decideBid).
//
// PlayerView tīrās konversijas (stiķa/vēstures rekonstrukcija, calledPip, hand mask)
// dzīvo `./playerView.ts` — VIENĪGAIS avots, ko dala GAN šis SP tilts, GAN MP builder
// (`../mp/botView.ts`). Šeit paliek tikai worker transports + core-GameState → PlayerView
// salikums + lēmumi.

import type { DominoTile, GameState } from "@domino-poker/core";

import type { Move, PlayerView, Seat, SeatTuple } from "@domino-poker/engine";
import { getTile } from "@domino-poker/engine";

import { BOT_DIFFICULTIES, type BotBehaviorChoice, type BotDifficulty } from "./difficulty";
import { assemblePlayerView, seedFor } from "./playerView";

/**
 * Uz cilvēku vērstas uzvedības payload worker-im (sk. `docs/bot-behaviors.md`). Tikai
 * ne-`inclusion` mērķiem; `targetSeat` = cilvēka sēdvieta (aprēķināta no `GameState`).
 * Tips ar string-literāļiem (bez `@domino-poker/ai` importa), lai šis modulis nepievelk botu bundle.
 */
type WorkerMoveBehavior = {
  readonly objective: "denyHuman" | "aggressiveVsHuman";
  readonly targetSeat: Seat;
  readonly weight?: number;
};

/**
 * Atrisina per-seat uzvedības izvēli uz worker payload. `inclusion` / nav izvēles / nav cilvēka
 * pie galda → `undefined` (worker uzvedas kā šobrīd). Citādi — mērķē uz cilvēka sēdvietu.
 * `targetSeat` prasa pilnu `GameState`, tāpēc to dara TIKAI šeit (NE `decideMoveFromView` hint ceļā).
 */
function resolveWorkerBehavior(
  state: GameState,
  choice: BotBehaviorChoice | undefined
): WorkerMoveBehavior | undefined {
  if (choice === undefined || choice.objective === "inclusion") {
    return undefined;
  }
  const targetSeat = state.players.findIndex((p) => !p.isAI);
  if (targetSeat < 0) {
    return undefined; // nav cilvēka (nevajadzētu SP) → drošs fallback uz inclusion
  }
  return {
    objective: choice.objective,
    targetSeat: targetSeat as Seat,
    ...(choice.weight === undefined ? {} : { weight: choice.weight })
  };
}

// Grūtības budžeti (bidSamples / moveIterations) dzīvo vieglajā `difficulty.ts`, lai lobby
// to var importēt, neievelkot šo moduli (sk. AppShell code-split komentāru). Smago meklēšanu
// (`@domino-poker/ai`) NEIMPORTĒ šeit — tā dzīvo `botWorker.ts` (off-thread, sk. zemāk).

// Drošības rezerve, ja worker neuzstartē/uzkaras (slikts URL, crash) — lēmums tiek noraidīts, un
// izsaucēja liveness tīkls pārņem. Worker pats nekad nebloķē UI; tas ir tikai "nekad uz mūžu".
const WORKER_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// PlayerView no core GameState (SP; MP ekvivalents dzīvo ../mp/botView.ts)
// ---------------------------------------------------------------------------

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

  return assemblePlayerView({
    seat,
    hand: player.hand,
    bids,
    taken,
    dealerIndex: state.dealerIndex,
    trickSource: state
  });
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
  | {
      kind: "move";
      view: PlayerView;
      moveIterations: number;
      seed: number;
      behavior?: WorkerMoveBehavior;
    };

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

/**
 * Aprēķina gājienu no JAU uzbūvēta `PlayerView` (dala SP + MP: SP būvē no core GameState,
 * MP no servera snapshot). Vienīgais worker-move ceļš — konversija atpakaļ uz {side1,side2}
 * + calledPip → declaredNumber notiek te, tāpēc abi izsaucēji dala identisku semantiku.
 */
// Vienīgais worker-move ceļš: sūta pieprasījumu (ar opcionālu uzvedību) un konvertē atbildi
// atpakaļ uz {side1,side2} + declaredNumber. `decideMoveFromView` (hint/MP) un `decideMove` (SP)
// abi šo lieto ar identisku semantiku; atšķiras tikai uzvedība (hint to nekad nepadod).
async function runMove(
  view: PlayerView,
  difficulty: BotDifficulty,
  behavior?: WorkerMoveBehavior
): Promise<BotMove> {
  const { moveIterations } = BOT_DIFFICULTIES[difficulty];
  const response = await requestFromWorker({
    kind: "move",
    view,
    moveIterations,
    seed: seedFor(view),
    ...(behavior === undefined ? {} : { behavior })
  });
  if (!response.move) throw new Error("bot worker: invalid move response");
  const tile = getTile(response.move.tile);
  return {
    tile: { side1: tile.a, side2: tile.b },
    declaredNumber: response.move.calledPip >= 0 ? response.move.calledPip : undefined
  };
}

export async function decideMoveFromView(
  view: PlayerView,
  difficulty: BotDifficulty
): Promise<BotMove> {
  // Hint / MP ceļš — NEKAD nepadod uzvedību (nav `GameState`; uzvedas kā `inclusion`).
  return runMove(view, difficulty);
}

export async function decideMove(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty,
  behavior?: BotBehaviorChoice
): Promise<BotMove> {
  return runMove(buildPlayerView(state, seat), difficulty, resolveWorkerBehavior(state, behavior));
}
