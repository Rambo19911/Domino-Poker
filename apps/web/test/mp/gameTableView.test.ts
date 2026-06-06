import { tileKey } from "@domino-poker/core";
import type { RoomSeatView, RoomView } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import type { GameSnapshot } from "../../lib/mp/clientView";
import { toGameTableView, toVisualSeat } from "../../lib/mp/gameTableView";

type SnapshotPlayer = GameSnapshot["players"][number];

function player(seatIndex: number, overrides: Partial<SnapshotPlayer> = {}): SnapshotPlayer {
  return {
    playerId: String(seatIndex + 1),
    name: `Player ${seatIndex + 1}`,
    seatIndex,
    isAI: false,
    status: "active",
    connectionState: "connected",
    inactiveScore: 0,
    autoPlayEnabled: false,
    bid: -1,
    tricksWon: 0,
    totalScore: 0,
    handCount: 7,
    ...overrides
  };
}

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    gameId: "r1",
    phase: "playing",
    currentRound: 1,
    totalRounds: 7,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    trickLeaderIndex: 0,
    requiredNumber: undefined,
    leadTile: undefined,
    isTrumpLead: false,
    isAceLead: false,
    lastRoundWinnerIndex: undefined,
    currentTrick: [],
    completedTricks: [],
    trickWinners: [],
    trickValidations: [],
    players: [player(0), player(1, { isAI: true }), player(2, { isAI: true }), player(3, { isAI: true })],
    eventSeq: 1,
    deadlineAt: undefined,
    // Aktīvs servera turns (no `currentTurn`); `undefined` = sprauga starp turniem
    // / pirms-spēle (tad neviens nedrīkst darboties).
    turnId: "t1",
    viewerPlayerId: "1",
    hand: [{ side1: 6, side2: 6 }, { side1: 3, side2: 4 }],
    ...overrides
  };
}

function seat(index: number, overrides: Partial<RoomSeatView> = {}): RoomSeatView {
  return {
    index,
    kind: index === 0 ? "human" : "bot",
    displayId: index === 0 ? `#0000${index + 1}` : undefined,
    isHost: index === 0,
    isAI: index !== 0,
    ...overrides
  };
}

function room(seats: readonly RoomSeatView[]): RoomView {
  return {
    id: "r1",
    code: "ABC123",
    visibility: "public",
    isPrivate: false,
    status: "IN_GAME",
    seatsFilled: 4,
    seatsTotal: 4,
    hostDisplayId: "#00001",
    createdAt: 0,
    expiresAt: 0,
    numberOfRounds: 7,
    seats
  };
}

describe("toVisualSeat", () => {
  it("places the viewer at the bottom (visual 0) and rotates clockwise", () => {
    // Skatītājs sēdvietā 2 → 2 kļūst par apakšu; 3→1, 0→2, 1→3.
    expect(toVisualSeat(2, 2)).toBe(0);
    expect(toVisualSeat(3, 2)).toBe(1);
    expect(toVisualSeat(0, 2)).toBe(2);
    expect(toVisualSeat(1, 2)).toBe(3);
  });

  it("is identity when the viewer is in seat 0", () => {
    expect([0, 1, 2, 3].map((i) => toVisualSeat(i, 0))).toEqual([0, 1, 2, 3]);
  });
});

describe("toGameTableView", () => {
  it("returns undefined when there is no snapshot", () => {
    expect(toGameTableView(undefined, undefined, undefined)).toBeUndefined();
  });

  it("resolves human names from RoomView displayId, never the snapshot default name", () => {
    const view = toGameTableView(
      snapshot(),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    const viewerSeat = view?.viewerSeat;
    expect(viewerSeat?.displayId).toBe("#00001");
    expect(viewerSeat?.isViewer).toBe(true);
    // Boti neuzrāda displayId (komponents rādīs AI etiķeti).
    expect(view?.seats.find((s) => s.gameSeatIndex === 1)?.displayId).toBeUndefined();
  });

  it("rotates so the viewer is visual seat 0 when seated elsewhere", () => {
    const players = [
      player(0, { isAI: true }),
      player(1, { isAI: true }),
      player(2),
      player(3, { isAI: true })
    ];
    const view = toGameTableView(
      snapshot({ players, viewerPlayerId: "3", currentPlayerIndex: 2 }),
      room([seat(0), seat(1), seat(2, { kind: "human", isAI: false, displayId: "#00009", isHost: false }), seat(3)]),
      "t1"
    );
    expect(view?.viewerSeat?.visualSeat).toBe(0);
    expect(view?.viewerSeat?.gameSeatIndex).toBe(2);
    expect(view?.viewerSeat?.displayId).toBe("#00009");
    expect(view?.seats.map((s) => s.visualSeat)).toEqual([0, 1, 2, 3]);
  });

  it("marks the viewer's turn and bid action during bidding", () => {
    const view = toGameTableView(
      snapshot({ phase: "bidding", currentPlayerIndex: 0 }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.isViewerTurn).toBe(true);
    expect(view?.turnAction).toBe("bid");
  });

  it("marks the move action during playing on the viewer's turn", () => {
    const view = toGameTableView(snapshot({ currentPlayerIndex: 0 }), room([seat(0), seat(1), seat(2), seat(3)]), "t1");
    expect(view?.turnAction).toBe("move");
  });

  it("never reports the viewer's turn when it is another seat", () => {
    const view = toGameTableView(snapshot({ currentPlayerIndex: 1 }), room([seat(0), seat(1), seat(2), seat(3)]), "t1");
    expect(view?.isViewerTurn).toBe(false);
    expect(view?.turnAction).toBe("none");
  });

  it("does not report the viewer's turn in the gap before the server starts it (snapshot has no active turnId)", () => {
    // Regresija: pēc bota gājiena `currentPlayerIndex` jau rāda cilvēku, bet servera
    // turns vēl nav izveidots (`snapshot.turnId` undefined). Pat ar vecu (stale)
    // sekoto turnId klients NEDRĪKST ieslēgt gājienu, citādi serveris to noraida.
    const view = toGameTableView(
      snapshot({ currentPlayerIndex: 0, turnId: undefined }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t-stale"
    );
    expect(view?.isViewerTurn).toBe(false);
    expect(view?.turnAction).toBe("none");
  });

  it("never reports an action outside bidding/playing", () => {
    const view = toGameTableView(snapshot({ phase: "roundEnd", currentPlayerIndex: 0 }), room([seat(0)]), "t1");
    expect(view?.isViewerTurn).toBe(false);
    expect(view?.turnAction).toBe("none");
  });

  it("exposes deadline, turnId and viewer hand verbatim from the snapshot", () => {
    const view = toGameTableView(
      snapshot({ deadlineAt: 12_345 }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t9"
    );
    expect(view?.deadlineAt).toBe(12_345);
    expect(view?.turnId).toBe("t9");
    expect(view?.viewerHand).toEqual([{ side1: 6, side2: 6 }, { side1: 3, side2: 4 }]);
  });

  it("maps the current trick with rotated seats and declared numbers", () => {
    const view = toGameTableView(
      snapshot({
        currentPlayerIndex: 1,
        leadTile: { side1: 3, side2: 4 },
        requiredNumber: 3,
        currentTrick: [{ tile: { side1: 3, side2: 4 }, playerIndex: 0, declaredNumber: 3 }]
      }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.trick).toHaveLength(1);
    expect(view?.trick[0]).toMatchObject({
      gameSeatIndex: 0,
      visualSeat: 0,
      displayId: "#00001",
      declaredNumber: 3,
      tile: { side1: 3, side2: 4 }
    });
    expect(view?.requiredNumber).toBe(3);
    expect(view?.leadTile).toEqual({ side1: 3, side2: 4 });
  });

  it("derives the winner seat (highest total score) at game end", () => {
    const players = [
      player(0, { totalScore: 10 }),
      player(1, { isAI: true, totalScore: 42 }),
      player(2, { isAI: true, totalScore: 7 }),
      player(3, { isAI: true, totalScore: 42 })
    ];
    const view = toGameTableView(snapshot({ phase: "gameEnd", players }), room([seat(0), seat(1), seat(2), seat(3)]), undefined);
    // Vienāds augstākais punktu skaits → mazākais sēdvietas indekss.
    expect(view?.winnerSeatIndex).toBe(1);
  });

  it("exposes preGameStartsAt while the first turn has not started", () => {
    const view = toGameTableView(
      snapshot({ phase: "bidding", turnId: undefined }), // vēl nav aktīva turna
      room([seat(0), seat(1), seat(2), seat(3)]),
      undefined,
      50_000
    );
    expect(view?.preGameStartsAt).toBe(50_000);
    expect(view?.isViewerTurn).toBe(false); // pirms-spēlē neviens nesola
    expect(view?.turnAction).toBe("none");
  });

  it("exposes preGameStartsAt even when a stale local turnId lingers from a prior game", () => {
    // Regresija: klientam var palikt novecojis `turnId` no iepriekšējās spēles
    // (ROOM_LEFT to neatiestata). Pre-game overlay jābalstās uz AUTORITATĪVO
    // snapshot.turnId (jaunā spēlē vēl undefined), nevis uz lokāli sekoto turnId —
    // citādi atskaiti redzētu tikai "tīrs" klients, ne tas ar veco turnId.
    const view = toGameTableView(
      snapshot({ phase: "bidding", turnId: undefined }), // jauna spēle: servera turns vēl nav
      room([seat(0), seat(1), seat(2), seat(3)]),
      "stale-turn-from-previous-game", // novecojis lokālais turnId
      50_000
    );
    expect(view?.preGameStartsAt).toBe(50_000);
  });

  it("clears preGameStartsAt once a turn is active", () => {
    const view = toGameTableView(
      snapshot({ phase: "bidding", currentPlayerIndex: 0 }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1", // turns sācies
      50_000
    );
    expect(view?.preGameStartsAt).toBeUndefined();
    expect(view?.turnAction).toBe("bid");
  });

  it("marks every hand tile valid while leading (empty trick)", () => {
    const view = toGameTableView(
      snapshot({ currentPlayerIndex: 0, currentTrick: [], hand: [{ side1: 6, side2: 6 }, { side1: 3, side2: 4 }] }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.viewerValidTileKeys).toEqual([tileKey({ side1: 6, side2: 6 }), tileKey({ side1: 3, side2: 4 })]);
  });

  it("restricts valid tiles to the required number when following", () => {
    const view = toGameTableView(
      snapshot({
        currentPlayerIndex: 0,
        requiredNumber: 3,
        leadTile: { side1: 3, side2: 4 },
        currentTrick: [{ tile: { side1: 3, side2: 4 }, playerIndex: 1, declaredNumber: 3 }],
        hand: [{ side1: 3, side2: 5 }, { side1: 6, side2: 6 }] // tikai 3-5 satur pieprasīto 3
      }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.viewerValidTileKeys).toEqual([tileKey({ side1: 3, side2: 5 })]);
  });

  it("exposes no valid tiles when it is not the viewer's move", () => {
    const view = toGameTableView(
      snapshot({ currentPlayerIndex: 1 }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.viewerValidTileKeys).toEqual([]);
  });

  it("exposes the last completed trick and its winner seat", () => {
    const completed = [
      { tile: { side1: 3, side2: 4 }, playerIndex: 1, declaredNumber: 3 },
      { tile: { side1: 3, side2: 5 }, playerIndex: 2 },
      { tile: { side1: 0, side2: 0 }, playerIndex: 3 },
      { tile: { side1: 3, side2: 6 }, playerIndex: 0 }
    ];
    const view = toGameTableView(
      snapshot({ completedTricks: [completed], trickWinners: [3], currentTrick: [] }),
      room([seat(0), seat(1), seat(2), seat(3)]),
      "t1"
    );
    expect(view?.lastCompletedTrick).toHaveLength(4);
    expect(view?.lastTrickWinnerSeatIndex).toBe(3);
    expect(view?.lastCompletedTrick?.[0]).toMatchObject({ gameSeatIndex: 1, declaredNumber: 3 });
  });

  it("falls back to undefined displayId when no RoomView is available", () => {
    const view = toGameTableView(snapshot(), undefined, "t1");
    expect(view?.viewerSeat?.displayId).toBeUndefined();
    expect(view?.viewerSeat?.isViewer).toBe(true);
  });
});
