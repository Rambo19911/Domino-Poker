import { describe, expect, it } from "vitest";

import type { DominoTile } from "../../src/types";
import {
  applyCommand,
  createPlayerSnapshot,
  createPublicSnapshot,
  type MultiplayerGameState
} from "../../src/multiplayer";

const seed = "snapshot-seed";

function createGame(): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-create",
    seed
  });

  if (!result.nextState) {
    throw new Error("Expected multiplayer game to be created.");
  }

  return result.nextState;
}

function startTurn(state: MultiplayerGameState, now: number): MultiplayerGameState {
  const result = applyCommand(state, {
    type: "START_TURN",
    gameId: state.gameId,
    requestId: "request-start",
    turnId: "turn-1",
    now
  });

  if (!result.nextState) {
    throw new Error("Expected turn to start.");
  }

  return result.nextState;
}

/** Sakārto kauliņa puses, lai "0-3" un "3-0" sakristu. */
function tileKey(tile: DominoTile): string {
  const [low, high] = [tile.side1, tile.side2].sort((a, b) => a - b);
  return `${low}-${high}`;
}

function looksLikeTile(value: unknown): value is DominoTile {
  return (
    typeof value === "object" &&
    value !== null &&
    "side1" in value &&
    "side2" in value &&
    typeof (value as DominoTile).side1 === "number" &&
    typeof (value as DominoTile).side2 === "number"
  );
}

/** Rekursīvi savāc visus kauliņveida objektus no patvaļīgas struktūras. */
function collectTiles(value: unknown, found: DominoTile[] = []): DominoTile[] {
  if (looksLikeTile(value)) {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTiles(item, found));
  } else if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((item) => collectTiles(item, found));
  }
  return found;
}

describe("multiplayer snapshots", () => {
  it("public snapshot never contains any player's secret hand tiles", () => {
    const game = createGame();

    // Drošības pārbaude: svaigā spēlē visi 28 kauliņi ir rokās, neviens nav nospēlēts.
    const totalHandTiles = game.coreState.players.reduce(
      (sum, player) => sum + player.hand.length,
      0
    );
    expect(totalHandTiles).toBe(28);

    const snapshot = createPublicSnapshot(game);

    // Neviens kauliņveida objekts nedrīkst parādīties publiskajā skatā.
    expect(collectTiles(snapshot)).toHaveLength(0);

    // Katram spēlētājam ir tikai skaits, ne pati roka.
    snapshot.players.forEach((player) => {
      expect(player).not.toHaveProperty("hand");
      expect(player.handCount).toBe(7);
    });
  });

  it("covers all four seats including AI bot seats", () => {
    const game = createGame();
    const snapshot = createPublicSnapshot(game);

    expect(snapshot.players).toHaveLength(4);
    expect(snapshot.players.map((player) => player.isAI)).toEqual([
      false,
      true,
      true,
      true
    ]);
    expect(snapshot.players.map((player) => player.status)).toEqual([
      "active",
      "bot",
      "bot",
      "bot"
    ]);
    expect(snapshot.players.map((player) => player.seatIndex)).toEqual([0, 1, 2, 3]);
  });

  it("player snapshot exposes only the viewer's own hand for every seat", () => {
    const game = createGame();

    game.coreState.players.forEach((viewer) => {
      const snapshot = createPlayerSnapshot(game, viewer.id);

      // Skatītāja roka sakrīt ar viņa īsto roku.
      expect(snapshot.hand.map(tileKey).sort()).toEqual(
        viewer.hand.map(tileKey).sort()
      );

      // Visi snapshot atrastie kauliņi pieder tikai skatītājam.
      const allowedKeys = new Set(viewer.hand.map(tileKey));
      const leakedKeys = collectTiles(snapshot)
        .map(tileKey)
        .filter((key) => !allowedKeys.has(key));
      expect(leakedKeys).toEqual([]);
    });
  });

  it("never leaks opponents' tiles across the full four-player game", () => {
    const game = createGame();

    game.coreState.players.forEach((viewer) => {
      const opponentKeys = new Set(
        game.coreState.players
          .filter((player) => player.id !== viewer.id)
          .flatMap((player) => player.hand.map(tileKey))
      );

      const snapshot = createPlayerSnapshot(game, viewer.id);
      const snapshotKeys = collectTiles(snapshot).map(tileKey);

      snapshotKeys.forEach((key) => {
        expect(opponentKeys.has(key)).toBe(false);
      });
    });
  });

  it("includes the active turn deadline in snapshots", () => {
    const game = startTurn(createGame(), 5_000);

    expect(createPublicSnapshot(game).deadlineAt).toBe(15_000);
    expect(createPlayerSnapshot(game, "1").deadlineAt).toBe(15_000);
  });

  it("omits the deadline when no turn is active", () => {
    const game = createGame();

    expect(createPublicSnapshot(game).deadlineAt).toBeUndefined();
  });

  it("includes the active turnId (for reconnect submit) and omits it without a turn", () => {
    const withTurn = startTurn(createGame(), 5_000);
    expect(createPublicSnapshot(withTurn).turnId).toBe("turn-1");
    expect(createPlayerSnapshot(withTurn, "1").turnId).toBe("turn-1");

    expect(createPublicSnapshot(createGame()).turnId).toBeUndefined();
  });

  it("throws for an unknown viewer playerId", () => {
    const game = createGame();

    expect(() => createPlayerSnapshot(game, "does-not-exist")).toThrow(
      "unknown playerId"
    );
  });
});
