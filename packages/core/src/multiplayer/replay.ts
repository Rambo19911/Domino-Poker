import { completeTrick, getWinner, makeBid, playTile, startNextRound } from "../gameState";
import type { GameState } from "../types";
import { shuffleMultiplayerDominoSet } from "./determinism";
import type { MultiplayerEvent } from "./events";
import { createMultiplayerGameSetup } from "./gameSetup";

export function replayEvents(
  events: readonly MultiplayerEvent[],
  seed: string
): GameState {
  const setup = createMultiplayerGameSetup({
    gameId: events[0]?.gameId ?? "replay",
    seed
  });
  let state = setup.state;

  events.forEach((event, index) => {
    const expectedEventSeq = index + 1;
    if (event.eventSeq !== expectedEventSeq) {
      throw new Error(
        `Replay expected eventSeq ${expectedEventSeq}, received ${event.eventSeq}.`
      );
    }

    state = applyReplayEvent(state, event, seed);
  });

  return state;
}

function applyReplayEvent(
  state: GameState,
  event: MultiplayerEvent,
  seed: string
): GameState {
  switch (event.type) {
    case "TURN_STARTED":
    case "TURN_TIMEOUT":
    case "AUTO_PLAY_ENABLED":
    case "AUTO_PLAY_DISABLED":
    case "AUTO_MOVE_FALLBACK":
    case "PLAYER_JOINED":
    case "PLAYER_LEFT":
    case "PLAYER_DISCONNECTED":
    case "PLAYER_RESUMED":
      return state;

    case "BID_ACCEPTED":
      assertCurrentPlayer(state, event.playerId, event.type);
      return makeBid(state, event.bid);

    case "MOVE_ACCEPTED": {
      assertCurrentPlayer(state, event.playerId, event.type);
      const result = playTile(state, event.tile, event.declaredNumber);
      if (result.state === state) {
        throw new Error("Replay MOVE_ACCEPTED was rejected by core rules.");
      }
      return result.state;
    }

    case "TRICK_COMPLETED": {
      const completedState = completeTrick(state);
      if (completedState === state) {
        throw new Error("Replay TRICK_COMPLETED was rejected by core rules.");
      }

      const winnerIndex =
        completedState.trickWinners[completedState.trickWinners.length - 1];
      const winner = winnerIndex === undefined
        ? undefined
        : completedState.players[winnerIndex];
      if (winner?.id !== event.winnerPlayerId) {
        throw new Error(
          `Replay trick winner mismatch: expected ${event.winnerPlayerId}, received ${winner?.id ?? "none"}.`
        );
      }

      return completedState;
    }

    case "ROUND_RESULT":
      if (state.phase !== "roundEnd") {
        throw new Error("Replay ROUND_RESULT requires a finished round.");
      }
      if (state.currentRound !== event.round) {
        throw new Error(
          `Replay round mismatch: expected ${event.round}, received ${state.currentRound}.`
        );
      }
      return startNextRound(
        state,
        state.currentRound >= state.totalRounds
          ? []
          : shuffleMultiplayerDominoSet(`${seed}:round:${state.currentRound + 1}`)
      );

    case "GAME_OVER": {
      if (state.phase !== "gameEnd") {
        throw new Error("Replay GAME_OVER requires gameEnd state.");
      }

      const winner = getWinner(state);
      if (winner?.id !== event.winnerPlayerId) {
        throw new Error(
          `Replay game winner mismatch: expected ${event.winnerPlayerId ?? "none"}, received ${winner?.id ?? "none"}.`
        );
      }
      return state;
    }
  }
}

function assertCurrentPlayer(
  state: GameState,
  playerId: string,
  eventType: MultiplayerEvent["type"]
): void {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer?.id !== playerId) {
    throw new Error(
      `Replay ${eventType} expected current player ${playerId}, received ${currentPlayer?.id ?? "none"}.`
    );
  }
}
