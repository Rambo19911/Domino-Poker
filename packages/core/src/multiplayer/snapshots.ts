import type {
  DominoTile,
  GamePhase,
  PlayedTile,
  Player,
  TrickValidation
} from "../types";
import type {
  MultiplayerConnectionState,
  MultiplayerGameState,
  MultiplayerPlayerState,
  MultiplayerPlayerStatus
} from "./types";

/**
 * Publiskais (nesleptais) viena sēdekļa skats.
 *
 * Šeit apzināti **nav** `hand` lauka — kauliņu vērtības ir slepenas, tāpēc
 * privātums tiek garantēts strukturāli (allowlist, ne denylist): noplūde nav
 * iespējama, jo tipā vienkārši nav lauka, kur kauliņus glabāt. Pretinieku
 * kauliņu *skaits* (`handCount`) ir publiska informācija (redzams pie galda).
 */
export interface PublicPlayerSnapshot {
  readonly playerId: string;
  readonly name: string;
  readonly seatIndex: number;
  readonly isAI: boolean;
  readonly status: MultiplayerPlayerStatus;
  readonly connectionState: MultiplayerConnectionState;
  readonly inactiveScore: number;
  readonly autoPlayEnabled: boolean;
  readonly bid: number;
  readonly tricksWon: number;
  readonly totalScore: number;
  readonly handCount: number;
}

/**
 * Pilns publiskais spēles skats. Nesatur neviena spēlētāja slepenos kauliņus.
 * Drīkst tikt sūtīts jebkuram klientam (ieskaitot skatītājus).
 */
export interface PublicSnapshot {
  readonly gameId: string;
  readonly phase: GamePhase;
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly dealerIndex: number;
  readonly currentPlayerIndex: number;
  readonly trickLeaderIndex: number;
  readonly requiredNumber?: number | undefined;
  readonly leadTile?: DominoTile | undefined;
  readonly isTrumpLead: boolean;
  readonly isAceLead: boolean;
  readonly lastRoundWinnerIndex?: number | undefined;
  readonly currentTrick: readonly PlayedTile[];
  readonly completedTricks: readonly (readonly PlayedTile[])[];
  readonly trickWinners: readonly number[];
  readonly trickValidations: readonly TrickValidation[];
  readonly players: readonly PublicPlayerSnapshot[];
  readonly eventSeq: number;
  readonly deadlineAt?: number | undefined;
  /**
   * Aktīvā turna id (ja ir aktīvs turns). Klients to nodod atpakaļ `SUBMIT_BID`/
   * `SUBMIT_MOVE`; vajadzīgs pēc reconnect, kad klients nesaņem `TURN_STARTED`.
   */
  readonly turnId?: string | undefined;
}

/**
 * Konkrēta spēlētāja personīgais skats: publiskais state + **tikai šī**
 * spēlētāja privātā roka + aktīvā gājiena deadline. Citu spēlētāju kauliņi
 * šeit nekad neparādās.
 */
export interface PlayerSnapshot extends PublicSnapshot {
  readonly viewerPlayerId: string;
  readonly hand: readonly DominoTile[];
}

/**
 * Izveido publisku snapshotu bez neviena spēlētāja slepenajiem kauliņiem.
 */
export function createPublicSnapshot(state: MultiplayerGameState): PublicSnapshot {
  const core = state.coreState;
  const playerStatusById = indexPlayerStateById(state.players);

  return {
    gameId: state.gameId,
    phase: core.phase,
    currentRound: core.currentRound,
    totalRounds: core.totalRounds,
    dealerIndex: core.dealerIndex,
    currentPlayerIndex: core.currentPlayerIndex,
    trickLeaderIndex: core.trickLeaderIndex,
    requiredNumber: core.requiredNumber,
    leadTile: cloneOptionalTile(core.leadTile),
    isTrumpLead: core.isTrumpLead,
    isAceLead: core.isAceLead,
    lastRoundWinnerIndex: core.lastRoundWinnerIndex,
    currentTrick: cloneTrick(core.currentTrick),
    completedTricks: core.completedTricks.map(cloneTrick),
    trickWinners: [...core.trickWinners],
    trickValidations: core.trickValidations.map((validation) => ({ ...validation })),
    players: core.players.map((player, seatIndex) =>
      toPublicPlayer(player, seatIndex, playerStatusById.get(player.id))
    ),
    eventSeq: state.eventSeq,
    deadlineAt: state.currentTurn?.deadlineAt,
    turnId: state.currentTurn?.turnId
  };
}

/**
 * Izveido konkrētā spēlētāja personīgo snapshotu. Satur publisko state un
 * **tikai** šī spēlētāja roku; pretinieku kauliņi netiek atklāti.
 */
export function createPlayerSnapshot(
  state: MultiplayerGameState,
  playerId: string
): PlayerSnapshot {
  const viewer = state.coreState.players.find((player) => player.id === playerId);
  if (!viewer) {
    throw new Error(`createPlayerSnapshot: unknown playerId ${playerId}.`);
  }

  return {
    ...createPublicSnapshot(state),
    viewerPlayerId: playerId,
    hand: viewer.hand.map(cloneTile)
  };
}

function toPublicPlayer(
  player: Player,
  seatIndex: number,
  mpState: MultiplayerPlayerState | undefined
): PublicPlayerSnapshot {
  const status = mpState?.status ?? (player.isAI ? "bot" : "active");
  return {
    playerId: player.id,
    name: player.name,
    seatIndex,
    // Pamests cilvēks kļūst par botu (status "bot") → klients to rāda kā AI.
    isAI: player.isAI || status === "bot",
    status,
    connectionState:
      mpState?.connectionState ?? (player.isAI ? "disconnected" : "connected"),
    inactiveScore: mpState?.inactiveScore ?? 0,
    autoPlayEnabled: mpState?.autoPlayEnabled ?? false,
    bid: player.bid,
    tricksWon: player.tricksWon,
    totalScore: player.totalScore,
    handCount: player.hand.length
  };
}

function indexPlayerStateById(
  players: readonly MultiplayerPlayerState[]
): Map<string, MultiplayerPlayerState> {
  return new Map(players.map((player) => [player.playerId, player]));
}

function cloneTrick(trick: readonly PlayedTile[]): readonly PlayedTile[] {
  return trick.map((played) => ({
    tile: cloneTile(played.tile),
    playerIndex: played.playerIndex,
    ...(played.declaredNumber !== undefined
      ? { declaredNumber: played.declaredNumber }
      : {})
  }));
}

function cloneTile(tile: DominoTile): DominoTile {
  return { side1: tile.side1, side2: tile.side2 };
}

function cloneOptionalTile(tile: DominoTile | undefined): DominoTile | undefined {
  return tile === undefined ? undefined : cloneTile(tile);
}
