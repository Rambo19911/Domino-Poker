import { canPlayTile, isTrump, tileKey, trumpPriority } from "@domino-poker/core";
import type { DominoTile, Player } from "@domino-poker/core";
import type { RoomView } from "@domino-poker/shared";

import type { GameSnapshot } from "./clientView";

/**
 * 8.4 — Tīrs prezentācijas view-model MP spēles galdam.
 *
 * Zelta noteikums: klients **nesatur** autoritatīvu noteikumu loģiku. Šis modulis
 * tikai TRANSFORMĒ servera `STATE_SNAPSHOT` (+ publisko `RoomView`, kur glabājas
 * spēlētāju `displayId`) attēlojamā formā. Tas:
 *   • pagriež sēdvietas tā, ka skatītājs vienmēr ir apakšā (vizuālā vieta 0);
 *   • vārdus ņem no `RoomView.displayId` (snapshot `name` ir SP noklusējums);
 *   • atvasina, vai ir skatītāja kārta un kāda darbība atļauta (solījums/gājiens);
 *   • norāda `deadlineAt` countdown avotu un aktīvo `turnId` sūtīšanai atpakaļ.
 *
 * Te NEKAD netiek izvērtēta gājiena legalitāte — to dara serveris.
 */

/** Vizuālā sēdvieta: 0 = apakša (skatītājs), 1 = kreisā, 2 = augša, 3 = labā. */
export type VisualSeat = 0 | 1 | 2 | 3;

/** Kāda darbība skatītājam šobrīd ir pieejama (ja vispār). */
export type MpTurnAction = "bid" | "move" | "none";

type SnapshotPlayer = GameSnapshot["players"][number];

export interface MpTableSeat {
  /** Sēdvietas indekss snapshot/RoomView terminos (0..3). */
  readonly gameSeatIndex: number;
  /** Pozīcija pie galda pēc pagriešanas (skatītājs = 0). */
  readonly visualSeat: VisualSeat;
  /** Cilvēka `displayId` (#?????); botiem/tukšām vietām `undefined`. */
  readonly displayId: string | undefined;
  readonly isViewer: boolean;
  readonly isAI: boolean;
  readonly isHost: boolean;
  /** `currentPlayerIndex` — kura kārta tagad. */
  readonly isActive: boolean;
  readonly isDealer: boolean;
  readonly handCount: number;
  readonly bid: number;
  readonly tricksWon: number;
  readonly totalScore: number;
  readonly connectionState: SnapshotPlayer["connectionState"];
  readonly status: SnapshotPlayer["status"];
}

export interface MpTrickPlay {
  readonly gameSeatIndex: number;
  readonly visualSeat: VisualSeat;
  readonly displayId: string | undefined;
  readonly isAI: boolean;
  readonly tile: DominoTile;
  readonly declaredNumber: number | undefined;
}

export interface MpGameTableView {
  readonly phase: GameSnapshot["phase"];
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly completedTrickCount: number;
  /** Sēdvietas sakārtotas pēc vizuālās pozīcijas (0..3). */
  readonly seats: readonly MpTableSeat[];
  readonly viewerSeat: MpTableSeat | undefined;
  readonly viewerHand: readonly DominoTile[];
  /**
   * Derīgo kauliņu atslēgas (`tileKey`) skatītāja gājiena kārtā — **tikai
   * attēlošanai** (izcelšana/atspējošana, kā SP). Serveris paliek autoritāte:
   * nelegāls gājiens tiek noraidīts. Tukšs, ja nav skatītāja gājiena kārta.
   */
  readonly viewerValidTileKeys: readonly string[];
  readonly trick: readonly MpTrickPlay[];
  /** Pēdējais pabeigtais triks (4 kauliņi) — UI to īslaicīgi aiztur (skat. #1). */
  readonly lastCompletedTrick: readonly MpTrickPlay[] | undefined;
  /** Pēdējā pabeigtā trika uzvarētāja sēdvieta (attēlošanai). */
  readonly lastTrickWinnerSeatIndex: number | undefined;
  readonly leadTile: DominoTile | undefined;
  readonly requiredNumber: number | undefined;
  readonly isTrumpLead: boolean;
  readonly isAceLead: boolean;
  readonly isViewerTurn: boolean;
  readonly turnAction: MpTurnAction;
  /** Countdown avots (servera autoritatīvais deadline); klients tikai rāda. */
  readonly deadlineAt: number | undefined;
  /** Aktīvais turnId — UI to nodod `SUBMIT_BID`/`SUBMIT_MOVE` (caur klientu). */
  readonly turnId: string | undefined;
  /**
   * Pirms-spēles atskaites beigas (servera laiks), kamēr solījumi vēl nav sākušies;
   * `undefined`, kad pirmais turns ir sācies. UI rāda "Spēle sākas pēc Ns".
   */
  readonly preGameStartsAt: number | undefined;
  /** Tikai `gameEnd`: sēdvieta ar augstāko `totalScore` (attēlošanai). */
  readonly winnerSeatIndex: number | undefined;
}

/** Pārvērš spēles sēdvietas indeksu vizuālā pozīcijā ar skatītāju apakšā. */
export function toVisualSeat(gameSeatIndex: number, viewerSeatIndex: number): VisualSeat {
  return (((gameSeatIndex - viewerSeatIndex) % 4) + 4) % 4 as VisualSeat;
}

/**
 * Apvieno autoritatīvo spēles `snapshot` ar publisko `room` (displayId avots) un
 * pašreizējo `turnId` vienā attēlojamā galda skatā. Atgriež `undefined`, ja nav
 * snapshot (galds vēl nav jārenderē).
 */
export function toGameTableView(
  snapshot: GameSnapshot | undefined,
  room: RoomView | undefined,
  turnId: string | undefined,
  startsAt?: number | undefined
): MpGameTableView | undefined {
  if (!snapshot) return undefined;

  const viewerSeatIndex = snapshot.players.find(
    (player) => player.playerId === snapshot.viewerPlayerId
  )?.seatIndex ?? 0;

  const displayIdBySeat = new Map<number, string | undefined>();
  const hostSeats = new Set<number>();
  for (const seat of room?.seats ?? []) {
    displayIdBySeat.set(seat.index, seat.displayId);
    if (seat.isHost) hostSeats.add(seat.index);
  }

  const seats = snapshot.players
    .map<MpTableSeat>((player) => ({
      gameSeatIndex: player.seatIndex,
      visualSeat: toVisualSeat(player.seatIndex, viewerSeatIndex),
      displayId: player.isAI ? undefined : displayIdBySeat.get(player.seatIndex),
      isViewer: player.playerId === snapshot.viewerPlayerId,
      isAI: player.isAI,
      isHost: hostSeats.has(player.seatIndex),
      isActive: player.seatIndex === snapshot.currentPlayerIndex,
      isDealer: player.seatIndex === snapshot.dealerIndex,
      handCount: player.handCount,
      bid: player.bid,
      tricksWon: player.tricksWon,
      totalScore: player.totalScore,
      connectionState: player.connectionState,
      status: player.status
    }))
    .sort((a, b) => a.visualSeat - b.visualSeat);

  const mapTrick = (plays: GameSnapshot["currentTrick"]): MpTrickPlay[] =>
    plays.map((play) => {
      const player = snapshot.players[play.playerIndex];
      return {
        gameSeatIndex: play.playerIndex,
        visualSeat: toVisualSeat(play.playerIndex, viewerSeatIndex),
        displayId: player?.isAI ? undefined : displayIdBySeat.get(play.playerIndex),
        isAI: player?.isAI ?? false,
        tile: play.tile,
        declaredNumber: play.declaredNumber
      };
    });

  const trick = mapTrick(snapshot.currentTrick);
  const lastCompleted = snapshot.completedTricks[snapshot.completedTricks.length - 1];

  const currentPlayer = snapshot.players[snapshot.currentPlayerIndex];
  const isPlayablePhase = snapshot.phase === "bidding" || snapshot.phase === "playing";
  const isViewerTurn =
    isPlayablePhase &&
    turnId !== undefined &&
    currentPlayer?.playerId === snapshot.viewerPlayerId;
  const turnAction: MpTurnAction = !isViewerTurn
    ? "none"
    : snapshot.phase === "bidding"
      ? "bid"
      : "move";

  return {
    phase: snapshot.phase,
    currentRound: snapshot.currentRound,
    totalRounds: snapshot.totalRounds,
    completedTrickCount: snapshot.completedTricks.length,
    seats,
    viewerSeat: seats.find((seat) => seat.isViewer),
    viewerHand: snapshot.hand,
    viewerValidTileKeys: turnAction === "move" ? viewerValidTileKeys(snapshot) : [],
    trick,
    lastCompletedTrick: lastCompleted ? mapTrick(lastCompleted) : undefined,
    lastTrickWinnerSeatIndex: snapshot.trickWinners[snapshot.trickWinners.length - 1],
    leadTile: snapshot.leadTile,
    requiredNumber: snapshot.requiredNumber,
    isTrumpLead: snapshot.isTrumpLead,
    isAceLead: snapshot.isAceLead,
    isViewerTurn,
    turnAction,
    deadlineAt: snapshot.deadlineAt,
    turnId,
    preGameStartsAt: startsAt !== undefined && turnId === undefined ? startsAt : undefined,
    winnerSeatIndex: snapshot.phase === "gameEnd" ? highestScoreSeatIndex(snapshot.players) : undefined
  };
}

/**
 * Derīgie kauliņi skatītāja gājienam — **tikai attēlošanai** (izcelšana/atspējošana).
 * Atspoguļo to pašu noteikumu pārbaudi, ko serveris (`canPlayTile`), bet NAV
 * autoritatīva: serveris joprojām validē un noraida nelegālu gājienu. Vadot
 * (tukšs triks) jebkurš kauliņš ir derīgs (skaitļa izvēli rāda dialogs).
 */
function viewerValidTileKeys(snapshot: GameSnapshot): readonly string[] {
  if (snapshot.phase !== "playing") return [];
  const hand = snapshot.hand;
  if (snapshot.currentTrick.length === 0) {
    return hand.map(tileKey);
  }
  // canPlayTile lasa tikai `player.hand`; minimāls objekts ir pietiekams un drošs.
  const viewer = { hand } as Player;
  const highestTrump = highestTrumpPriorityInTrick(snapshot.currentTrick);
  return hand
    .filter((tile) =>
      canPlayTile(viewer, tile, {
        leadTile: snapshot.leadTile,
        requiredNumber: snapshot.requiredNumber,
        isTrumpLead: snapshot.isTrumpLead,
        isAceLead: snapshot.isAceLead,
        highestTrumpPriorityInTrick: highestTrump
      })
    )
    .map(tileKey);
}

/** Augstākā (mazākā prioritāte = stiprākais) trumpja prioritāte trikā; core loģikas atspulgs. */
function highestTrumpPriorityInTrick(trick: GameSnapshot["currentTrick"]): number | undefined {
  let best: number | undefined;
  for (const play of trick) {
    if (isTrump(play.tile)) {
      const priority = trumpPriority(play.tile);
      if (best === undefined || priority < best) best = priority;
    }
  }
  return best;
}

/** Sēdvieta ar augstāko `totalScore` (vienādības gadījumā mazākais indekss). */
function highestScoreSeatIndex(players: readonly SnapshotPlayer[]): number | undefined {
  let best: SnapshotPlayer | undefined;
  for (const player of players) {
    if (!best || player.totalScore > best.totalScore) {
      best = player;
    }
  }
  return best?.seatIndex;
}
