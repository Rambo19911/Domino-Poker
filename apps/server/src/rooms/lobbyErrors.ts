/**
 * Strukturēti lobby/istabu kļūdu kodi (Fāze 5.6). Pirmie seši ir plānā minētie
 * publiskie kodi; pārējie ir iekšēji precizējumi tai pašai validācijai.
 */
export type LobbyErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "GAME_ALREADY_STARTED"
  | "NOT_HOST"
  | "ALREADY_IN_ROOM"
  | "FORBIDDEN"
  | "ROOM_NOT_JOINABLE"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYER_NOT_IN_ROOM";

export class LobbyError extends Error {
  readonly code: LobbyErrorCode;

  constructor(code: LobbyErrorCode, message: string) {
    super(message);
    this.name = "LobbyError";
    this.code = code;
  }
}

export function lobbyError(code: LobbyErrorCode, message: string): LobbyError {
  return new LobbyError(code, message);
}
