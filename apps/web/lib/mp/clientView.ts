import type {
  ChatMessage,
  RoomSummary,
  RoomView,
  ServerEvent,
  WelcomeEvent
} from "@domino-poker/shared";

/** Savienojuma stāvoklis (UI `ConnectionBanner` patērē). */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

/** Spēles snapshot tips izriet no `STATE_SNAPSHOT` eventa (core, caur shared). */
export type GameSnapshot = Extract<ServerEvent, { type: "STATE_SNAPSHOT" }>["snapshot"];

/** Identitāte no `WELCOME` (privātais `clientId` šeit neparādās). */
export interface ClientIdentity {
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayId: string;
  readonly reconnectToken: string;
}

export interface LobbyView {
  readonly rooms: readonly RoomSummary[];
  readonly onlineCount: number;
  readonly chat: readonly ChatMessage[];
}

export interface GameView {
  readonly snapshot: GameSnapshot | undefined;
  /** Pēdējais redzētais room-eventu seq (reconnect `REQUEST_SNAPSHOT(lastSeq)`). */
  readonly seq: number;
  /** Pēdējā `TURN_STARTED` turnId (UI to sūta atpakaļ `SUBMIT_BID`/`SUBMIT_MOVE`). */
  readonly turnId: string | undefined;
  /** Pirms-spēles atskaites beigas (servera laiks); `undefined`, kad solījumi sākušies. */
  readonly startsAt: number | undefined;
}

export interface ClientError {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
}

/**
 * Viss, ko UI renderē — atvasināts TIKAI no servera ziņojumiem. Klients nesatur
 * autoritatīvu spēles noteikumu loģiku: `game.snapshot` ir servera patiesība.
 */
export interface ClientView {
  readonly connection: ConnectionStatus;
  readonly identity: ClientIdentity | undefined;
  readonly lobby: LobbyView;
  readonly room: RoomView | undefined;
  readonly game: GameView;
  readonly lastError: ClientError | undefined;
}

/** Cik čata ziņas paturēt klienta atmiņā (serveris sūta ~50 vēsturē). */
const CHAT_VIEW_LIMIT = 100;

export const initialClientView: ClientView = {
  connection: "connecting",
  identity: undefined,
  lobby: { rooms: [], onlineCount: 0, chat: [] },
  room: undefined,
  game: { snapshot: undefined, seq: 0, turnId: undefined, startsAt: undefined },
  lastError: undefined
};

/**
 * Tīra reducēšana: servera `ServerEvent` → jauns `ClientView`. Bez blakusefektiem,
 * bez noteikumu loģikas — tikai attēlošanai vajadzīgā transformācija.
 */
export function reduceServerEvent(view: ClientView, event: ServerEvent): ClientView {
  switch (event.type) {
    case "WELCOME":
      return { ...view, connection: "connected", identity: identityFrom(event) };
    case "ROOM_LIST":
      return { ...view, lobby: { ...view.lobby, rooms: event.rooms } };
    case "LOBBY_STATE":
      return {
        ...view,
        lobby: { ...view.lobby, rooms: event.rooms, onlineCount: event.onlineCount }
      };
    case "ROOM_CREATED":
    case "ROOM_JOINED":
    case "ROOM_VIEW":
      return { ...view, room: event.room };
    case "ROOM_LEFT": {
      // Atgriežoties lobby, notīrām jebkuru gaistošu spēles kļūdu (citādi tā paliktu
      // "iestrēgusi" lobby — piem. "does not own current turn" pēc spēles beigām).
      const room = view.room?.id === event.roomId ? undefined : view.room;
      return { ...view, room, lastError: undefined };
    }
    case "GAME_STARTING":
      // Pirms-spēles atskaite: galds jau redzams, solījumi sāksies `startsAt`.
      return { ...view, game: { ...view.game, startsAt: event.startsAt } };
    case "STATE_SNAPSHOT":
      // Snapshot satur aktīvo turnId (vajadzīgs pēc reconnect, kad nav TURN_STARTED);
      // ja nav (vecāks snapshot/tests), saglabājam pēdējo no TURN_STARTED.
      return {
        ...view,
        game: {
          ...view.game,
          snapshot: event.snapshot,
          seq: event.seq,
          turnId: event.snapshot.turnId ?? view.game.turnId
        }
      };
    case "GAME_EVENT":
      // Snapshot paliek autoritatīvs; eventi virza `seq` un izceļ aktīvo turnId.
      // TURN_STARTED beidz pirms-spēles atskaiti (solījumi sākušies).
      return {
        ...view,
        game: {
          ...view.game,
          seq: Math.max(view.game.seq, event.seq),
          turnId: event.event.type === "TURN_STARTED" ? event.event.turn.turnId : view.game.turnId,
          startsAt: event.event.type === "TURN_STARTED" ? undefined : view.game.startsAt
        }
      };
    case "CHAT_HISTORY":
      return { ...view, lobby: { ...view.lobby, chat: event.messages.slice(-CHAT_VIEW_LIMIT) } };
    case "CHAT_MESSAGE":
      return { ...view, lobby: { ...view.lobby, chat: appendChat(view.lobby.chat, event) } };
    case "ERROR":
      return { ...view, lastError: errorFrom(event) };
    case "PONG":
      return view; // latence varētu tikt izsekota vēlāk
    case "WALLET_UPDATED":
      // Fāze 3 (serveris): zelta bilances push pēc maksas darbības. Live bilances UI
      // (auth state atjauninājums) tiek pieslēgts Fāzē 4 (MP UI); šeit pagaidām
      // neglabājam — bilance jau atspoguļojas, atgriežoties lobby (/auth/me + WELCOME).
      return view;
    default:
      // Forward-compat (F12): nezināmu servera notikumu IGNORĒJAM (atgriežam `view`
      // nemainītu), nevis metam izņēmumu — jaunāks serveris saderīgā protokola
      // versijā nedrīkst sabojāt klienta skatu.
      return ignoreUnknownServerEvent(event, view);
  }
}

function identityFrom(event: WelcomeEvent): ClientIdentity {
  return {
    sessionId: event.sessionId,
    playerId: event.playerId,
    displayId: event.displayId,
    reconnectToken: event.reconnectToken
  };
}

function errorFrom(event: Extract<ServerEvent, { type: "ERROR" }>): ClientError {
  return {
    code: event.code,
    message: event.message,
    ...(event.requestId !== undefined ? { requestId: event.requestId } : {})
  };
}

function appendChat(
  chat: readonly ChatMessage[],
  event: Extract<ServerEvent, { type: "CHAT_MESSAGE" }>
): readonly ChatMessage[] {
  const message: ChatMessage = {
    id: event.id,
    authorDisplayId: event.authorDisplayId,
    text: event.text,
    serverNow: event.serverNow
  };
  return [...chat, message].slice(-CHAT_VIEW_LIMIT);
}

/**
 * Tipu-līmeņa izsmeļamības pārbaude: ja `shared` pievieno jaunu `ServerEvent` tipu
 * un `reduceServerEvent` to neapstrādā, `_event: never` parametrs lauž `tsc`.
 * IZPILDLAIKĀ nezināmu notikumu ignorē — atgriež `view` nemainītu (forward-compat, F12).
 */
function ignoreUnknownServerEvent(_event: never, view: ClientView): ClientView {
  return view;
}
