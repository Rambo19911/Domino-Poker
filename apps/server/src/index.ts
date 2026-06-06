import { randomUUID } from "node:crypto";

import { LobbyChat } from "./chat/LobbyChat.js";
import { loadServerConfig } from "./config.js";
import { createHealthHttpServer } from "./httpServer.js";
import { DisplayIdRegistry } from "./identity/DisplayIdRegistry.js";
import { CoreMessageRouter } from "./net/messageRouter.js";
import { PostgresEventBus } from "./net/PostgresEventBus.js";
import { WebSocketGateway } from "./net/WebSocketGateway.js";
import { attachWebSocketGateway } from "./net/wsTransport.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { isRoomLeaseStore, LeaseBackedRoomOwnershipGuard } from "./rooms/RoomOwnershipGuard.js";
import { MatchPersistence } from "./storage/MatchPersistence.js";
import { PostgresStorage } from "./storage/PostgresStorage.js";
import { openStorage } from "./storage/index.js";
import { SystemTurnTimerScheduler } from "./timers/SystemTurnTimerScheduler.js";

const config = loadServerConfig();
const clock: () => number = () => Date.now();

// Fāze 10/12.3: persistence aiz StoragePort (SQLite lokāli, PostgreSQL pēc URL).
// Koordinators ir fire-and-forget — DB kļūda nedrīkst aizkavēt vai salauzt spēles plūsmu.
const storage = await openStorage(config.databaseUrl, config.pg);
const persistence = new MatchPersistence({ storage, clock });
const instanceId = randomUUID();
const roomOwnership = isRoomLeaseStore(storage)
  ? new LeaseBackedRoomOwnershipGuard({
      store: storage,
      ownerInstanceId: instanceId,
      ttlMs: 30_000,
      clock
    })
  : undefined;
roomOwnership?.startRenewing();
const eventBus =
  storage instanceof PostgresStorage
    ? await PostgresEventBus.open({
        connectionString: config.databaseUrl,
        instanceId,
        poolOptions: config.pg
      })
    : undefined;

// Kopīgs DisplayIdRegistry: gateway (WELCOME) un RoomManager (sēdvietas) rāda
// vienu un to pašu publisko `displayId`.
const displayIds = new DisplayIdRegistry();
// Fāze 7: katrai istabai īsts setTimeout-bāzēts turn timeris.
const rooms = new RoomManager({
  clock,
  displayIds,
  createTurnScheduler: () => new SystemTurnTimerScheduler({ clock }),
  // Fāze 12.1: konfigurējams turna ilgums (countdown) no TURN_DURATION_MS.
  turnDurationMs: config.turnDurationMs,
  // Fāze 10.3: partijas sākums + visi room eventi → persistence (blakusefekts).
  onMatchStarted: (record) => persistence.matchStarted(record),
  onMatchEvents: (events) => persistence.events(events),
  // Pirms-spēles 10s atskaite uz galda, lai lēnāki klienti paspēj ielādēt galdu
  // pirms sākas solījumi (sk. RoomManager.startGame / GAME_STARTING).
  preGameDelayMs: 10_000,
  // Botu gājienus izspēlē PA VIENAM ar aizturi (secīga plūsma + cilvēka 10s
  // deadline sākas tikai tad, kad boti nospēlējuši). trickPauseMs ≥ klienta aizture.
  botPaceMs: 800,
  trickPauseMs: 1700,
  // Ja VISI cilvēki atvienojas (IN_GAME), istabu iznīcina pēc 30s grace — tas dod
  // laiku refresh/reconnect atgriezties pirms iznīcināšanas (9.3-b).
  abandonGraceMs: 30_000
});
// Cik čata ziņas paturēt atmiņā / ielādēt no DB startā (čats pārdzīvo restartu).
const CHAT_HISTORY_LIMIT = 50;
const chat = new LobbyChat({
  clock,
  historyLimit: CHAT_HISTORY_LIMIT,
  // Fāze 10.3: pieņemtā ziņa → DB (fire-and-forget).
  onMessage: (message) => persistence.chatMessage(message)
});
// Hidratācija startā: ielādējam pēdējās ziņas no DB, lai CHAT_HISTORY jaunam
// dalībniekam iekļautu pirms-restarta ziņas. Top-level await (ESM modulis).
try {
  chat.hydrate(await storage.loadRecentChatMessages(CHAT_HISTORY_LIMIT));
} catch (error) {
  console.error("[persistence] chat hydrate failed:", error);
}
// Produkcijā koalescējam LOBBY_STATE broadcastus (200ms), lai pie liela klientu
// skaita (1000+) istabu izmaiņu plūsma neveidotu fanout pārslodzi.
const router = new CoreMessageRouter({
  rooms,
  chat,
  lobbyStateDebounceMs: 200,
  ...(roomOwnership ? { roomOwnership } : {})
});
const gateway = new WebSocketGateway({
  clock,
  displayIds,
  router,
  ...(storage instanceof PostgresStorage ? { durableSessionStore: storage } : {}),
  ...(eventBus ? { eventBus } : {})
});
await eventBus?.start((message) => {
  if (message.kind === "broadcast") {
    gateway.deliverRemoteBroadcast(message.event);
    return;
  }
  if (message.kind === "supersede") {
    gateway.closeRemoteSupersededPlayer(message.playerId);
    return;
  }
  gateway.deliverRemoteToPlayer(message.playerId, message.event);
});

// Servera-iniciēti (pacētā izspēle / turn timeout) atjauninājumi → piegāde
// sēdošajiem cilvēkiem; GAME_OVER pie šī ceļa iznīcina pabeigto istabu (router).
rooms.setGameUpdateSink((roomId, events) =>
  router.deliverServerGameUpdate(gateway, roomId, events, clock())
);
// M3: kad spēlētājs zaudē istabas dalību (pamet / forfeit / istabu iznīcina) un
// nav tiešsaistē, atbrīvojam viņa durable sesiju (token + displayId), lai
// `tokens`/displayId neaugtu neierobežoti.
rooms.setMemberDepartedHandler((clientId) => {
  const released = gateway.releaseSession(clientId);
  if (released !== undefined && typeof released.then === "function") {
    void released.catch((error: unknown) => {
      console.error(`[sessions] failed to release session for ${clientId}:`, error);
    });
  }
});

// `/metrics` ziņo aktīvo savienojumu skaitu (slodzes testam + VPS uzraudzībai);
// PG režīmā pievieno DB veselību (SELECT 1 latency + pool piesātinājums).
const server = createHealthHttpServer({
  connectionCount: () => gateway.onlineCount(),
  ...(storage instanceof PostgresStorage ? { dbHealth: () => storage.healthCheck() } : {})
});
// Decision B: WebSocket uz tā paša HTTP servera/porta caur `upgrade`.
attachWebSocketGateway(server, gateway);

server.listen(config.httpPort, config.serverHost, () => {
  console.log(
    `Domino Poker multiplayer server listening on ${config.serverHost}:${config.httpPort} ` +
      `(HTTP /health + /metrics, WS /ws) [${config.nodeEnv}]`
  );
});

// Graceful shutdown: aizver DB (izskalo WAL), lai dati nepazustu pie restarta.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  server.close();
  roomOwnership?.stopRenewing();
  try {
    await eventBus?.close();
  } catch (error) {
    console.error("[fanout] close failed:", error);
  }
  try {
    await storage.close();
  } catch (error) {
    console.error("[persistence] close failed:", error);
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
