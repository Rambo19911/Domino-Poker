import { createNewGame } from "../gameState";
import type { DominoTile, GameState } from "../types";
import { createSeededRng, shuffleMultiplayerDominoSet } from "./determinism";

const defaultNumberOfRounds = 7;
/** Noklusējuma turna ilgums (ms), ja `CREATE_GAME` to nenorāda. */
export const DEFAULT_TURN_DURATION_MS = 10_000;
const MIN_TURN_DURATION_MS = 100;
const MAX_TURN_DURATION_MS = 600_000;

export interface MultiplayerGameMetadata {
  readonly gameId: string;
  readonly seed: string;
  readonly dealerIndex: number;
  readonly initialDeck: readonly DominoTile[];
  /** Turna ilgums (ms) — no kā tiek rēķināts `deadlineAt`. */
  readonly turnDurationMs: number;
}

export interface MultiplayerGameSetup {
  readonly state: GameState;
  readonly metadata: MultiplayerGameMetadata;
}

export interface CreateMultiplayerGameOptions {
  readonly gameId: string;
  readonly seed?: string | undefined;
  readonly createSeed?: (() => string) | undefined;
  readonly playerName?: string | undefined;
  readonly numberOfRounds?: number | undefined;
  readonly dealerIndex?: number | undefined;
  /** Turna ilgums (ms); noklusējums 10000. Validēts diapazonā [100, 600000]. */
  readonly turnDurationMs?: number | undefined;
  /**
   * Sēdvietu indeksi (0-bāzes), kuros sēž **cilvēki**; pārējie ir AI boti.
   * Ja izlaists, tiek saglabāta vēsturiskā uzvedība (sēdvieta 0 = cilvēks, 1–3 =
   * boti). Šī ir vienīgā vieta, kur lobby cilvēku/botu sastāvs nonāk dzinējā;
   * maisīšana/izdalīšana NETIEK skarta — tikai `isAI`/`playerType` pārkartēšana.
   */
  readonly humanSeatIndices?: readonly number[] | undefined;
}

export function createMultiplayerGameSetup(
  options: CreateMultiplayerGameOptions
): MultiplayerGameSetup {
  const gameId = validateNonEmpty("Multiplayer game id", options.gameId);
  const seed = validateNonEmpty(
    "Multiplayer seed",
    options.seed ?? createGeneratedSeed(options.createSeed)
  );
  const initialDeck = shuffleMultiplayerDominoSet(seed);
  const dealerIndex = options.dealerIndex ?? deriveDealerIndex(seed, 4);
  const turnDurationMs = validateTurnDuration(options.turnDurationMs);

  const baseState = createNewGame({
    playerName: options.playerName,
    numberOfRounds: options.numberOfRounds ?? defaultNumberOfRounds,
    dealerIndex,
    deck: initialDeck
  });
  const state =
    options.humanSeatIndices === undefined
      ? baseState
      : applyHumanSeats(baseState, options.humanSeatIndices);

  return {
    state,
    metadata: {
      gameId,
      seed,
      dealerIndex,
      initialDeck,
      turnDurationMs
    }
  };
}

/**
 * Validē turna ilgumu (ms). Noklusējums 10000; jābūt veselam skaitlim diapazonā
 * [100, 600000]. Tas NEIETEKMĒ maisīšanu/izdali (determinisms saglabājas).
 */
function validateTurnDuration(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TURN_DURATION_MS;
  }
  if (!Number.isInteger(value) || value < MIN_TURN_DURATION_MS || value > MAX_TURN_DURATION_MS) {
    throw new Error(
      `turnDurationMs must be an integer from ${MIN_TURN_DURATION_MS} to ${MAX_TURN_DURATION_MS}. Received ${value}.`
    );
  }
  return value;
}

/**
 * Pārkartē, kuras sēdvietas ir cilvēki vs boti, NESkarot kārtis, secību vai
 * jebkuru spēles noteikumu loģiku — tikai `isAI`/`playerType` katram spēlētājam
 * pēc sēdvietas indeksa.
 */
function applyHumanSeats(state: GameState, humanSeatIndices: readonly number[]): GameState {
  const playerCount = state.players.length;
  const humanSeats = new Set<number>();
  for (const index of humanSeatIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= playerCount) {
      throw new Error(
        `humanSeatIndices entry ${index} is out of range [0, ${playerCount - 1}].`
      );
    }
    humanSeats.add(index);
  }

  return {
    ...state,
    players: state.players.map((player, seatIndex) => {
      const isHuman = humanSeats.has(seatIndex);
      return {
        ...player,
        isAI: !isHuman,
        playerType: isHuman ? "human" : "cpu"
      };
    })
  };
}

function deriveDealerIndex(seed: string, playerCount: number): number {
  const rng = createSeededRng(`${seed}:dealer`);
  return Math.floor(rng() * playerCount);
}

function createGeneratedSeed(createSeed: (() => string) | undefined): string {
  if (createSeed) {
    return createSeed();
  }

  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error("Multiplayer seed is required when crypto.randomUUID is unavailable.");
  }

  return randomUUID.call(globalThis.crypto);
}

function validateNonEmpty(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${label} must not be empty.`);
  }

  return trimmed;
}
