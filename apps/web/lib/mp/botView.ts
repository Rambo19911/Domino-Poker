// MP "supportHuman" padoma aprēķins (B daļa). Būvē stiprā bota `PlayerView` no SERVERA
// `PlayerSnapshot` (skatītāja roka + publiskā info) un palaiž epic ISMCTS lokāli.
//
// D8: padomu rēķina KLIENTS (tam ir savs skats; serveris tikai vārtē kvotu). D10: tīrās
// stiķa/vēstures/hand konversijas dala ar SP tiltu caur `../bot/playerView.ts` — NEDUBLĒT.
// Snapshot pretinieku rokas neatklāj; ISMCTS tās determinizē pats (tāpat kā SP), tāpēc
// skatītāja rokai + publiskajai vēsturei pietiek, lai atkārtotu SP epic padoma stiprumu.

import type { PlayerSnapshot } from "@domino-poker/core/multiplayer";

import type { PlayerView, SeatTuple } from "@domino-poker/engine";

import { type BotMove, decideMoveFromView } from "../bot/botBridge";
import { assemblePlayerView } from "../bot/playerView";

/** MP padoms vienmēr ir epic līmenī (D5) — augstākais ISMCTS budžets. */
const HINT_DIFFICULTY = "epic" as const;

/**
 * Būvē skatītāja `PlayerView` no MP snapshot. `snapshot.players` ir sēdvietu secībā
 * (indekss = sēdvieta), tāpēc solītāji/paņemtie tiek lasīti tieši pēc indeksa; skatītāja
 * sēdvietu atrodam pēc `viewerPlayerId`. Roka ir SKATĪTĀJA (`snapshot.hand`); pretinieku
 * kauliņi netiek atklāti — ISMCTS tos determinizē (sk. moduļa galveni).
 */
export function buildMpPlayerView(snapshot: PlayerSnapshot): PlayerView {
  const seat = snapshot.players.findIndex((player) => player.playerId === snapshot.viewerPlayerId);
  if (seat < 0) {
    throw new Error("buildMpPlayerView: viewer seat not found in snapshot.");
  }

  const bids: SeatTuple<number> = [
    snapshot.players[0]?.bid ?? -1,
    snapshot.players[1]?.bid ?? -1,
    snapshot.players[2]?.bid ?? -1,
    snapshot.players[3]?.bid ?? -1
  ];
  const taken: SeatTuple<number> = [
    snapshot.players[0]?.tricksWon ?? 0,
    snapshot.players[1]?.tricksWon ?? 0,
    snapshot.players[2]?.tricksWon ?? 0,
    snapshot.players[3]?.tricksWon ?? 0
  ];

  return assemblePlayerView({
    seat,
    hand: snapshot.hand,
    bids,
    taken,
    dealerIndex: snapshot.dealerIndex,
    trickSource: snapshot
  });
}

/**
 * Aprēķina epic padoma gājienu no MP snapshot (off-thread worker). Atgriež PILNU gājienu
 * `{tile, declaredNumber}` — izsaucējs izgaismo `tile` un rāda `declaredNumber` (ja ir).
 * Async; izsaucējam jāatceļ novecojis rezultāts, ja mainījusies kārta/roka (D11).
 */
export function computeMpHint(snapshot: PlayerSnapshot): Promise<BotMove> {
  return decideMoveFromView(buildMpPlayerView(snapshot), HINT_DIFFICULTY);
}
