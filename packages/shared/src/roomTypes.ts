/**
 * Publiskie istabu DTO (transporta līgumi), ko serveris ražo un klients patērē.
 * Šeit ir **tikai** publiskie skati — bez iekšējā `playerId`. Servera iekšējais
 * `Room`/`Seat` (ar `playerId`) paliek `apps/server` (LobbyManager).
 */

import type { RankBadgeId } from "./leaderboard.js";
import type { TitleId } from "./titles.js";

export type RoomStatus =
  | "WAITING"
  | "STARTING"
  | "IN_GAME"
  | "FINISHED"
  | "DESTROYED";

export type RoomVisibility = "public" | "private";

export type SeatKind = "empty" | "human" | "bot";

export const minRoomNumberOfRounds = 1;
export const maxRoomNumberOfRounds = 50;
export const defaultRoomNumberOfRounds = 7;

export interface RoomSeatView {
  readonly index: number;
  readonly kind: SeatKind;
  readonly displayId: string | undefined;
  readonly isHost: boolean;
  readonly isAI: boolean;
  /**
   * Reģistrēta (ielogota) spēlētāja profila avatara `id` (sk. `avatarCatalog`) un
   * MP tituls (Fāze 4). `undefined` botiem un anonīmiem. Serveris atrisina no
   * sesijas publiskā profila keša (pārdzīvo disconnect). Klients to rāda gan
   * waiting-room, gan spēles galda sēdvietās.
   */
  readonly avatar?: string | undefined;
  readonly title?: TitleId | undefined;
  /**
   * Globālā ranga badge (Leaderboard fāze): atvasināts no spēlētāja vietas topā
   * caur `rankToBadge`. `undefined`, ja spēlētājs nav badge-piešķirošā rangā (31+),
   * bots vai anonīms. Serveris to aizpilda no LeaderboardService keša (F4). Klients
   * rāda kā badge pārklājumu uz sēdvietas avatara (waiting-room + spēles galds).
   */
  readonly rankBadge?: RankBadgeId | undefined;
}

export interface RoomSummary {
  readonly id: string;
  readonly code: string;
  readonly visibility: RoomVisibility;
  readonly isPrivate: boolean;
  readonly status: RoomStatus;
  readonly seatsFilled: number;
  readonly seatsTotal: number;
  readonly hostDisplayId: string | undefined;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly numberOfRounds: number;
  /**
   * Zelta monētu dalības maksa (Fāze 3). `0` = bezmaksas istaba (esošā uzvedība
   * nemainās). `> 0` = maksas istaba: katrs cilvēks maksā šo, ieņemot sēdvietu;
   * pods (`pot`) tiek sadalīts uzvarētājiem. Klients rāda monētas nozīmi sarakstā,
   * ja `> 0`. Aizpildīts vienmēr (aditīvs lauks; vecs klients to ignorē).
   */
  readonly entryFee: number;
}

export interface RoomView extends RoomSummary {
  readonly seats: readonly RoomSeatView[];
  /**
   * Faktiski savāktais zelta monētu pods (Fāze 3) = `entryFee` × samaksājušo cilvēku
   * skaits. `0` bezmaksas istabās. Spēles laikā rāda galda skatā (mobilais pretī
   * round skaitlim; web zem punktu tabulas). Sadala uzvarētājiem spēles beigās.
   */
  readonly pot: number;
}
