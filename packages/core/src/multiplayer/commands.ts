import type { DominoTile } from "../types";

/**
 * MP komandu kontrakts. UZMANĪBU (m3): NE visas šeit deklarētās komandas apstrādā
 * core `applyCommand` — sekojošās ar nodomu paliek augstāka slāņa ziņā un `applyCommand`
 * tām atgriež `command_not_implemented`:
 *   • `ADD_PLAYER`, `ADD_BOT`, `FILL_SEATS_WITH_BOTS`, `START_GAME` — lobby/sēdvietu
 *     operācijas PIRMS spēles; tās izpilda serveris (`RoomManager`/`LobbyManager`),
 *     nevis spēles dzinējs, kas darbojas tikai ar jau aktīvu spēli.
 *   • `ENABLE_AUTO_PLAY` — auto-play dzinējā ieslēdzas NETIEŠI (pie disconnect/timeout);
 *     tikai `DISABLE_AUTO_PLAY` ir tieša dzinēja komanda (pie resume/reconnect).
 * Tipi paliek union daļa kā pilns protokola vārdnīcas apraksts (un augšējo slāņu tipu
 * drošībai), bet to klātbūtne NENOZĪMĒ, ka `applyCommand` tās realizē.
 */
export const multiplayerCommandTypes = [
  "CREATE_GAME",
  "ADD_PLAYER",
  "ADD_BOT",
  "FILL_SEATS_WITH_BOTS",
  "START_GAME",
  "START_NEXT_ROUND",
  "START_TURN",
  "SUBMIT_BID",
  "SUBMIT_MOVE",
  "TURN_TIMEOUT",
  "ENABLE_AUTO_PLAY",
  "DISABLE_AUTO_PLAY",
  "PLAYER_DISCONNECT",
  "PLAYER_RESUME",
  "PLAYER_FORFEIT",
  "REQUEST_SNAPSHOT"
] as const;

export type MultiplayerCommandType = (typeof multiplayerCommandTypes)[number];

interface MultiplayerCommandBase<TType extends MultiplayerCommandType> {
  readonly type: TType;
  readonly gameId: string;
  readonly requestId: string;
}

export interface CreateGameCommand extends MultiplayerCommandBase<"CREATE_GAME"> {
  readonly seed?: string | undefined;
  readonly playerName?: string | undefined;
  readonly numberOfRounds?: number | undefined;
  /** Sēdvietu indeksi (0-bāzes), kuros sēž cilvēki; pārējie ir boti. */
  readonly humanSeatIndices?: readonly number[] | undefined;
  /**
   * Turna ilgums (ms) — pēc tā tiek aprēķināts `deadlineAt`. Ja izlaists, noklusējums
   * ir 10000. Konfigurējams (Fāze 12.1, `TURN_DURATION_MS`); NEIETEKMĒ maisīšanu/
   * izdali (tās atkarīgas tikai no `seed`), tāpēc determinisms paliek nemainīgs.
   */
  readonly turnDurationMs?: number | undefined;
}

export interface AddPlayerCommand extends MultiplayerCommandBase<"ADD_PLAYER"> {
  readonly playerId: string;
  readonly name: string;
  readonly seatIndex?: number | undefined;
}

export interface AddBotCommand extends MultiplayerCommandBase<"ADD_BOT"> {
  readonly playerId?: string | undefined;
  readonly name?: string | undefined;
  readonly seatIndex?: number | undefined;
}

export interface FillSeatsWithBotsCommand
  extends MultiplayerCommandBase<"FILL_SEATS_WITH_BOTS"> {}

export interface StartGameCommand extends MultiplayerCommandBase<"START_GAME"> {}

export interface StartNextRoundCommand
  extends MultiplayerCommandBase<"START_NEXT_ROUND"> {}

export interface StartTurnCommand extends MultiplayerCommandBase<"START_TURN"> {
  readonly turnId: string;
  readonly now: number;
}

export interface SubmitBidCommand extends MultiplayerCommandBase<"SUBMIT_BID"> {
  readonly playerId: string;
  readonly turnId: string;
  readonly now: number;
  readonly bid: number;
}

export interface SubmitMoveCommand extends MultiplayerCommandBase<"SUBMIT_MOVE"> {
  readonly playerId: string;
  readonly turnId: string;
  readonly now: number;
  readonly tile: DominoTile;
  readonly declaredNumber?: number | undefined;
}

export interface TurnTimeoutCommand extends MultiplayerCommandBase<"TURN_TIMEOUT"> {
  readonly turnId: string;
  readonly now: number;
}

export interface EnableAutoPlayCommand
  extends MultiplayerCommandBase<"ENABLE_AUTO_PLAY"> {
  readonly playerId: string;
}

export interface DisableAutoPlayCommand
  extends MultiplayerCommandBase<"DISABLE_AUTO_PLAY"> {
  readonly playerId: string;
}

export interface PlayerDisconnectCommand
  extends MultiplayerCommandBase<"PLAYER_DISCONNECT"> {
  readonly playerId: string;
  readonly connectionId?: string | undefined;
}

export interface PlayerResumeCommand extends MultiplayerCommandBase<"PLAYER_RESUME"> {
  readonly playerId: string;
  readonly connectionId?: string | undefined;
}

export interface PlayerForfeitCommand
  extends MultiplayerCommandBase<"PLAYER_FORFEIT"> {
  /** Spēlētājs apzināti pamet spēli; viņa sēdvieta kļūst par botu (auto-spēlē). */
  readonly playerId: string;
}

export interface RequestSnapshotCommand
  extends MultiplayerCommandBase<"REQUEST_SNAPSHOT"> {
  readonly playerId: string;
}

export type MultiplayerCommand =
  | CreateGameCommand
  | AddPlayerCommand
  | AddBotCommand
  | FillSeatsWithBotsCommand
  | StartGameCommand
  | StartNextRoundCommand
  | StartTurnCommand
  | SubmitBidCommand
  | SubmitMoveCommand
  | TurnTimeoutCommand
  | EnableAutoPlayCommand
  | DisableAutoPlayCommand
  | PlayerDisconnectCommand
  | PlayerResumeCommand
  | PlayerForfeitCommand
  | RequestSnapshotCommand;
