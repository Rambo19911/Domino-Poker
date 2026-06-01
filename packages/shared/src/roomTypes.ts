/**
 * Publiskie istabu DTO (transporta līgumi), ko serveris ražo un klients patērē.
 * Šeit ir **tikai** publiskie skati — bez iekšējā `playerId`. Servera iekšējais
 * `Room`/`Seat` (ar `playerId`) paliek `apps/server` (LobbyManager).
 */

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
}

export interface RoomView extends RoomSummary {
  readonly seats: readonly RoomSeatView[];
}
