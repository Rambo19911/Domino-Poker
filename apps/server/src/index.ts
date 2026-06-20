import { randomUUID } from "node:crypto";

import { AuthService } from "./auth/AuthService.js";
import { isAuthStore } from "./auth/AuthStore.js";
import { createEmailSender } from "./auth/EmailSender.js";
import { ChatTranslationService } from "./chat/ChatTranslationService.js";
import { GoogleCloudTranslator } from "./chat/GoogleCloudTranslator.js";
import { LobbyChat } from "./chat/LobbyChat.js";
import { createChatTranslateHandler } from "./chat/chatTranslateRoutes.js";
import { loadServerConfig } from "./config.js";
import { createAuthHandler } from "./http/authRoutes.js";
import { createSpRewardHandler } from "./http/spRewardRoutes.js";
import { createHealthHttpServer } from "./httpServer.js";
import { DisplayIdRegistry } from "./identity/DisplayIdRegistry.js";
import { LeaderboardService } from "./leaderboard/LeaderboardService.js";
import { CoreMessageRouter } from "./net/messageRouter.js";
import { PostgresEventBus } from "./net/PostgresEventBus.js";
import { WebSocketGateway } from "./net/WebSocketGateway.js";
import { attachWebSocketGateway } from "./net/wsTransport.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { isRoomLeaseStore, LeaseBackedRoomOwnershipGuard } from "./rooms/RoomOwnershipGuard.js";
import { MatchPersistence } from "./storage/MatchPersistence.js";
import { OutcomeRecorder } from "./storage/OutcomeRecorder.js";
import { SpRewardTokens } from "./sp/SpRewardTokens.js";
import { isCoinStore } from "./storage/CoinStore.js";
import { PostgresStorage } from "./storage/PostgresStorage.js";
import { openStorage } from "./storage/index.js";
import { SystemTurnTimerScheduler } from "./timers/SystemTurnTimerScheduler.js";
import { WalletService } from "./wallet/WalletService.js";

const config = loadServerConfig();
const clock: () => number = () => Date.now();

// Fāze 10/12.3: persistence aiz StoragePort (SQLite lokāli, PostgreSQL pēc URL).
// Koordinators ir fire-and-forget — DB kļūda nedrīkst aizkavēt vai salauzt spēles plūsmu.
const storage = await openStorage(config.databaseUrl, config.pg);
const persistence = new MatchPersistence({ storage, clock });
// Globālā Leaderboard serviss (kešots rangu momentuzņēmums; lēmums B). Pieejams
// tikai ar auth-spējīgu glabātuvi (abas to ir). Konstruēts PIRMS OutcomeRecorder,
// lai game-over → `notifyStatsChanged` (F4) varētu uz to atsaukties. Kešu atsvaidzina
// TTL (`leaderboardRefreshMs`) + stats izmaiņa (game-over/forfeit/abandon).
const leaderboard = isAuthStore(storage)
  ? new LeaderboardService({
      store: storage,
      clock,
      size: config.leaderboardSize,
      minGames: config.leaderboardMinGames,
      refreshMs: config.leaderboardRefreshMs
    })
  : undefined;
// Fāze 3: kontu MP iznākumu reģistrētājs (atsevišķs no player_stats; server-authoritative).
// Fāze 4: pēc katra jauna iznākuma ieraksta paziņo leaderboard kešam (rangu pārbūve).
const outcomes = new OutcomeRecorder({
  storage,
  clock,
  ...(leaderboard ? { onStatsChanged: () => leaderboard.notifyStatsChanged() } : {})
});
// Opcionālā autentifikācija: gan SqliteStorage, gan PostgresStorage implementē
// AuthStore, tāpēc abos režīmos pieejama. Anonīmā spēle to neizmanto.
// Fāze 5: paroles atjaunošanas e-pasta senderis (Resend prod / console dev; prod
// bez RESEND_API_KEY → undefined → reset funkcija atspējota).
const emailSender = createEmailSender({
  resendApiKey: config.email.resendApiKey,
  emailFrom: config.email.from,
  nodeEnv: config.nodeEnv
});
const authService = isAuthStore(storage)
  ? new AuthService({ store: storage, clock, emailSender, appBaseUrl: config.email.appBaseUrl })
  : undefined;
// Fāze 0: zelta monētu maks (virtuālā valūta). Gan SqliteStorage, gan PostgresStorage
// implementē CoinStore. Anonīmā spēle to neizmanto. Starta bonuss + bilance.
const wallet = isCoinStore(storage) ? new WalletService({ coins: storage, clock }) : undefined;
// Fāze 2: SP balvas vienreizējie spēles tokeni (in-memory, vienas instances anti-cheat).
const spRewardTokens =
  authService && wallet
    ? new SpRewardTokens({
        clock,
        ttlMs: 30 * 60 * 1000,
        maxPerUser: 3,
        createId: () => randomUUID()
      })
    : undefined;
const instanceId = randomUUID();
const roomOwnership = isRoomLeaseStore(storage)
  ? new LeaseBackedRoomOwnershipGuard({
      store: storage,
      ownerInstanceId: instanceId,
      ttlMs: config.roomLeaseTtlMs,
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
  // Fāze 3: partijas sākums + fināls → arī kontu iznākumu reģistrētājs.
  onMatchStarted: (record) => {
    persistence.matchStarted(record);
    outcomes.matchStarted(record);
  },
  onMatchEvents: (events) => persistence.events(events),
  onMatchFinished: (matchId, standings) => outcomes.gameOver(matchId, standings),
  onPlayerForfeited: (matchId, corePlayerId) => outcomes.playerForfeited(matchId, corePlayerId),
  onRoomAbandoned: (matchId) => outcomes.matchAbandoned(matchId),
  // Pirms-spēles atskaite uz galda, lai lēnāki klienti paspēj ielādēt galdu
  // pirms sākas solījumi (sk. RoomManager.startGame / GAME_STARTING).
  preGameDelayMs: config.preGameDelayMs,
  // Botu gājienus izspēlē PA VIENAM ar aizturi (secīga plūsma + cilvēka turn
  // deadline sākas tikai tad, kad boti nospēlējuši). trickPauseMs ≥ klienta
  // aizture (config validē apakšējo robežu).
  botPaceMs: config.botPaceMs,
  trickPauseMs: config.trickPauseMs,
  // Grace (Fāze 3 5.6): (a) per-sēdvietas auto-forfeit, ja spēlētājs paliek
  // offline, kamēr citi turpina; (b) pilnas istabas iznīcināšana, ja VISI cilvēki
  // atvienojušies. Dod laiku refresh/reconnect atgriezties pirms forfeit/iznīcināšanas.
  abandonGraceMs: config.abandonGraceMs
});
const chat = new LobbyChat({
  clock,
  // Cik čata ziņas paturēt atmiņā / ielādēt no DB startā (čats pārdzīvo restartu).
  historyLimit: config.chatHistoryLimit,
  // Fāze 10.3: pieņemtā ziņa → DB (fire-and-forget).
  onMessage: (message) => persistence.chatMessage(message)
});
const chatTranslation =
  config.translation.enabled && config.translation.projectId !== undefined
    ? new ChatTranslationService({
        translator: new GoogleCloudTranslator({
          projectId: config.translation.projectId,
          location: config.translation.location,
          credentialsFile: config.translation.credentialsFile
        }),
        clock,
        dailyCharLimit: config.translation.dailyCharLimit,
        monthlyCharLimit: config.translation.monthlyCharLimit,
        cacheMaxEntries: config.translation.cacheMaxEntries
      })
    : undefined;
// Hidratācija startā: ielādējam pēdējās ziņas no DB, lai CHAT_HISTORY jaunam
// dalībniekam iekļautu pirms-restarta ziņas. Top-level await (ESM modulis).
try {
  chat.hydrate(await storage.loadRecentChatMessages(config.chatHistoryLimit));
} catch (error) {
  console.error("[persistence] chat hydrate failed:", error);
}
// Produkcijā koalescējam LOBBY_STATE broadcastus, lai pie liela klientu
// skaita (1000+) istabu izmaiņu plūsma neveidotu fanout pārslodzi.
const router = new CoreMessageRouter({
  rooms,
  chat,
  lobbyStateDebounceMs: config.lobbyStateDebounceMs,
  ...(roomOwnership ? { roomOwnership } : {})
});
const gateway = new WebSocketGateway({
  clock,
  displayIds,
  router,
  ...(storage instanceof PostgresStorage ? { durableSessionStore: storage } : {}),
  ...(eventBus ? { eventBus } : {}),
  // Opcionālā autentifikācija: HELLO authToken → lietotājs (username pārraksta displayId).
  ...(authService
    ? {
        // Fāze 0: WELCOME nes goldBalance ielogotam — atrisinām bilanci kopā ar auth
        // (gateway WELCOME sūtīšana paliek sinhrona). `getBalance` = repair-on-read.
        resolveAuth: async (token: string) => {
          const resolved = await authService.resolvePublic(token);
          if (!resolved || !wallet) {
            return resolved;
          }
          return { ...resolved, goldBalance: await wallet.getBalance(resolved.userId) };
        }
      }
    : {})
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
// Fāze 3: partijas sākumā attiecinām katru cilvēka sēdvietu uz autentificēto userId
// (ja ielogojies) statistikas vajadzībām. Anonīmam → undefined (nesaskaitās).
rooms.setUserIdResolver((clientId) => gateway.getUserId(clientId));
// Fāze 4: seat avatars/tituls/username citiem spēlētājiem (waiting room + galds).
rooms.setSeatProfileResolver((clientId) => gateway.getSeatProfile(clientId));
// Leaderboard fāze: seat globālā ranga badge (svaigi no keša katrā getRoomView).
// Tikai reģistrētiem (clientId → userId); anonīmiem/botiem → undefined (nav badge).
if (leaderboard) {
  rooms.setRankBadgeResolver((clientId) => {
    const userId = gateway.getUserId(clientId);
    return userId ? (leaderboard.getRankBadge(userId) ?? undefined) : undefined;
  });
}
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
  ...(chatTranslation
    ? {
        chatTranslateHandler: createChatTranslateHandler({
          translation: chatTranslation,
          webOrigins: config.webOrigins,
          clock,
          dev: config.nodeEnv !== "production",
          trustProxy: config.trustProxy,
          rateLimitPerMinute: config.translation.rateLimitPerMinute
        })
      }
    : {}),
  ...(authService
    ? {
        authHandler: createAuthHandler({
          auth: authService,
          leaderboard,
          ...(wallet ? { wallet } : {}),
          webOrigins: config.webOrigins,
          clock,
          dev: config.nodeEnv !== "production",
          trustProxy: config.trustProxy
        })
      }
    : {}),
  ...(authService && wallet && spRewardTokens
    ? {
        spRewardHandler: createSpRewardHandler({
          auth: authService,
          wallet,
          tokens: spRewardTokens,
          webOrigins: config.webOrigins,
          clock,
          dev: config.nodeEnv !== "production"
        })
      }
    : {}),
  ...(storage instanceof PostgresStorage
    ? {
        dbHealth: async () => {
          const report = await storage.healthCheck();
          // Pievieno event-bus pool atsevišķi (tas dzīvo PostgresEventBus, ne storage).
          return eventBus ? { ...report, eventBusPool: eventBus.poolStats() } : report;
        }
      }
    : {})
});
// Decision B: WebSocket uz tā paša HTTP servera/porta caur `upgrade`.
attachWebSocketGateway(server, gateway);

server.listen(config.httpPort, config.serverHost, () => {
  console.log(
    `Domino Poker multiplayer server listening on ${config.serverHost}:${config.httpPort} ` +
      `(HTTP /health + /metrics, WS /ws) [${config.nodeEnv}]`
  );
});

// Fāze 5: periodiska beigušos auth tokenu tīrīšana. Token validācija jau noraida
// beigušos (`expires_at <= now`), bet rindas paliek DB — bez tīrīšanas `auth_tokens`
// aug neierobežoti. Tikai ja storage atbalsta auth. Best-effort: DB kļūda nedrīkst
// lauzt serveri. Sweep uzreiz pie starta (notīra uzkrājumus pēc dīkstāves/restartiem)
// un tad atkārtoti ik AUTH_TOKEN_CLEANUP_INTERVAL_MS, kamēr serveris darbojas.
const AUTH_TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
let authTokenCleanupTimer: ReturnType<typeof setInterval> | undefined;
if (isAuthStore(storage)) {
  const authTokenStore = storage;
  const sweepExpiredAuthTokens = (): void => {
    const now = clock();
    void authTokenStore.deleteExpiredAuthTokens(now).catch((error: unknown) => {
      console.error("[auth] expired token cleanup failed:", error);
    });
    // Fāze 5: arī beigušies paroles atjaunošanas tokeni (tā pati politika).
    void authTokenStore.deleteExpiredPasswordResetTokens(now).catch((error: unknown) => {
      console.error("[auth] expired password-reset token cleanup failed:", error);
    });
  };
  sweepExpiredAuthTokens();
  authTokenCleanupTimer = setInterval(sweepExpiredAuthTokens, AUTH_TOKEN_CLEANUP_INTERVAL_MS);
  // unref: tīrīšanas taimeris netur procesu mākslīgi dzīvu, ja viss pārējais beidzies.
  authTokenCleanupTimer.unref();
}

// Graceful shutdown: aizver DB (izskalo WAL), lai dati nepazustu pie restarta.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  server.close();
  if (authTokenCleanupTimer) clearInterval(authTokenCleanupTimer);
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
