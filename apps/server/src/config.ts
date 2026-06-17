import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_HTTP_PORT = 4000;
const DEFAULT_DATABASE_URL = "./data/dev.sqlite";
const DEFAULT_SERVER_HOST = "0.0.0.0";
const DEFAULT_NODE_ENV = "development";
// CORS allowlist auth maršrutiem; dev Next.js noklusējuma izcelsme.
const DEFAULT_WEB_ORIGIN = "http://localhost:3000";
const DEFAULT_TURN_DURATION_MS = 10_000;
const MIN_TURN_DURATION_MS = 100;
const MAX_TURN_DURATION_MS = 600_000;
// PostgreSQL pool noklusējumi = `pg` draivera noklusējumi, lai konfigurācijas
// pievienošana NEMAINA esošo savienojumu skaitu, kamēr nav skaidri uzstādīts.
const DEFAULT_PG_POOL_MAX = 10;
const DEFAULT_PG_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_PG_CONNECTION_TIMEOUT_MS = 0;
// Operacionālie noklusējumi (Fāze 3, 16. punkts) = iepriekšējie `index.ts`
// literāļi, lai konfigurācijas pievienošana NEMAINA uzvedību bez env override.
const DEFAULT_ROOM_LEASE_TTL_MS = 30_000;
const DEFAULT_PRE_GAME_DELAY_MS = 10_000;
const DEFAULT_BOT_PACE_MS = 800;
const DEFAULT_TRICK_PAUSE_MS = 1700;
const DEFAULT_ABANDON_GRACE_MS = 60_000;
const DEFAULT_LOBBY_STATE_DEBOUNCE_MS = 200;
const DEFAULT_CHAT_HISTORY_LIMIT = 50;
const FREE_TRANSLATE_MONTHLY_CHARS = 500_000;
const FREE_TRANSLATE_DAILY_CHARS = 16_000;
const DEFAULT_TRANSLATE_LOCATION = "global";
const DEFAULT_TRANSLATE_CACHE_MAX_ENTRIES = 1_000;
const DEFAULT_TRANSLATE_RATE_LIMIT_PER_MINUTE = 30;
// Leaderboard (globālā statistika): cik kontu topā, min spēles ranžēšanai, keša TTL.
const DEFAULT_LEADERBOARD_SIZE = 100;
const DEFAULT_LEADERBOARD_MIN_GAMES = 10;
const DEFAULT_LEADERBOARD_REFRESH_MS = 30_000;
/**
 * Apakšējā robeža `TRICK_PAUSE_MS`: web klients aiztur pabeigto triku 1500 ms
 * (`useTrickFreeze` TRICK_FREEZE_MS) — ja serveris turpinātu ātrāk, nākamais
 * gājiens ielauztos aizturē. Lokāla konstante (NEimportē no web; servera config
 * nedrīkst būt atkarīgs no web bundle), vērtībām jāpaliek saskaņotām.
 */
const MIN_TRICK_PAUSE_MS = 1500;

/**
 * PostgreSQL savienojumu pool limiti (tikai PG režīmā; SQLite tos ignorē).
 * Single-instance serverī ir DIVI pool (storage + event bus) + 1 LISTEN klients,
 * tāpēc kopējie savienojumi pret DB ≈ 2 × `max` + 1.
 */
export interface PgPoolConfig {
  /** Maks. savienojumu skaits VIENĀ pool (`PG_POOL_MAX`; noklusējums 10). */
  max: number;
  /** Dīkstāves savienojuma aizvēršanas laiks ms; 0 = neaizvērt (`PG_POOL_IDLE_TIMEOUT_MS`). */
  idleTimeoutMillis: number;
  /** Cik ilgi gaidīt brīvu savienojumu ms; 0 = bez taimauta (`PG_POOL_CONNECTION_TIMEOUT_MS`). */
  connectionTimeoutMillis: number;
}

export interface ServerConfig {
  /**
   * HTTP (un WebSocket — decision B) klausīšanās ports. No `SERVER_PORT` vai
   * `HTTP_PORT` (noklusējums 4000). WS dalās ar šo portu caur `upgrade`.
   */
  httpPort: number;
  /** Adrese, uz kuras serveris klausās (`SERVER_HOST`; noklusējums `0.0.0.0`). Aiz reverse proxy ieteicams `127.0.0.1`. */
  serverHost: string;
  /** SQLite faila ceļš, `:memory:` vai PostgreSQL URL (no `DATABASE_URL`; noklusējums `./data/dev.sqlite`). */
  databaseUrl: string;
  /** Vide (`NODE_ENV`; noklusējums `development`). Produkcijā `production`. */
  nodeEnv: string;
  /** Turna ilgums (ms) — solīšanas/gājiena countdown (`TURN_DURATION_MS`; noklusējums 10000). */
  turnDurationMs: number;
  /** Istabas īpašumtiesību nomas TTL ms PG režīmā (`ROOM_LEASE_TTL_MS`; noklusējums 30000; ≥1). */
  roomLeaseTtlMs: number;
  /** Pirms-spēles atskaite ms uz galda (`PRE_GAME_DELAY_MS`; noklusējums 10000; 0 = bez atskaites). */
  preGameDelayMs: number;
  /** Aizture starp botu gājieniem ms (`BOT_PACE_MS`; noklusējums 800; 0 = bez aiztures). */
  botPaceMs: number;
  /** Pauze pēc pabeigta trika ms (`TRICK_PAUSE_MS`; noklusējums 1700; ≥1500 — web klienta triku-aizture). */
  trickPauseMs: number;
  /** Grace ms pirms auto-forfeit/istabas iznīcināšanas pēc atvienošanās (`ABANDON_GRACE_MS`; noklusējums 60000). */
  abandonGraceMs: number;
  /** LOBBY_STATE broadcastu koalescēšanas logs ms (`LOBBY_STATE_DEBOUNCE_MS`; noklusējums 200; 0 = tūlītējs). */
  lobbyStateDebounceMs: number;
  /** Cik čata ziņas paturēt atmiņā / ielādēt startā (`CHAT_HISTORY_LIMIT`; noklusējums 50; ≥1). */
  chatHistoryLimit: number;
  /** MP lobby chat translation config (Google Cloud Translation, server-side). */
  translation: TranslationConfig;
  /** Cik kontu rādīt globālajā topā (`LEADERBOARD_SIZE`; noklusējums 100; ≥1). */
  leaderboardSize: number;
  /** Min nospēlēto spēļu skaits, lai parādītos topā/saņemtu badge (`LEADERBOARD_MIN_GAMES`; noklusējums 10; ≥1). */
  leaderboardMinGames: number;
  /** Leaderboard rangu keša svaiguma TTL ms (`LEADERBOARD_REFRESH_MS`; noklusējums 30000; ≥0). */
  leaderboardRefreshMs: number;
  /** PostgreSQL pool limiti (tikai PG režīmā; SQLite tos ignorē). */
  pg: PgPoolConfig;
  /**
   * CORS atļauto izcelšu saraksts auth HTTP maršrutiem (`WEB_ORIGIN`, ar komatu
   * atdalīts). Noklusējums dev Next.js izcelsme. NEKAD `*` (drošības standarts).
   */
  webOrigins: readonly string[];
  /**
   * Vai uzticēties `X-Forwarded-For` headerim rate-limit IP atvasināšanai
   * (`TRUST_PROXY`; noklusējums `false`). Ieslēgt TIKAI aiz uzticama reverse proxy
   * (prod = Caddy/Nginx). Atslēgts → IP nāk no `socket.remoteAddress` (nefalsificējams).
   */
  trustProxy: boolean;
  /** Paroles atjaunošanas e-pasta konfigurācija (Fāze 5). */
  email: EmailConfig;
}

export interface TranslationConfig {
  readonly enabled: boolean;
  readonly projectId: string | undefined;
  readonly credentialsFile: string | undefined;
  readonly location: string;
  readonly dailyCharLimit: number;
  readonly monthlyCharLimit: number;
  readonly cacheMaxEntries: number;
  readonly rateLimitPerMinute: number;
}

/** Paroles atjaunošanas e-pasta konfigurācija (Fāze 5). */
export interface EmailConfig {
  /** Resend API key (`RESEND_API_KEY`); `undefined` → e-pasta funkcija prod ATSPĒJOTA. */
  resendApiKey: string | undefined;
  /** Sūtītāja adrese (`EMAIL_FROM`, piem. `no-reply@domino-poker.com`); verificētā domēnā. */
  from: string | undefined;
  /** Web bāzes URL reset linkam (`APP_BASE_URL`; noklusējums dev web izcelsme). */
  appBaseUrl: string;
}

interface EnvValues {
  readonly [key: string]: string | undefined;
}

export function loadServerConfig(
  env: EnvValues = process.env,
  dotEnvPath = resolve(process.cwd(), ".env")
): ServerConfig {
  const fileEnv = loadDotEnvFile(dotEnvPath);
  return {
    httpPort: readPort(
      "SERVER_PORT/HTTP_PORT",
      env.SERVER_PORT ?? env.HTTP_PORT ?? fileEnv.SERVER_PORT ?? fileEnv.HTTP_PORT,
      DEFAULT_HTTP_PORT
    ),
    serverHost: readNonEmpty(env.SERVER_HOST ?? fileEnv.SERVER_HOST, DEFAULT_SERVER_HOST),
    databaseUrl: readDatabaseUrl(env.DATABASE_URL ?? fileEnv.DATABASE_URL),
    nodeEnv: readNonEmpty(env.NODE_ENV ?? fileEnv.NODE_ENV, DEFAULT_NODE_ENV),
    turnDurationMs: readTurnDuration(env.TURN_DURATION_MS ?? fileEnv.TURN_DURATION_MS),
    roomLeaseTtlMs: readPositiveInt(
      "ROOM_LEASE_TTL_MS",
      env.ROOM_LEASE_TTL_MS ?? fileEnv.ROOM_LEASE_TTL_MS,
      DEFAULT_ROOM_LEASE_TTL_MS
    ),
    preGameDelayMs: readNonNegativeInt(
      "PRE_GAME_DELAY_MS",
      env.PRE_GAME_DELAY_MS ?? fileEnv.PRE_GAME_DELAY_MS,
      DEFAULT_PRE_GAME_DELAY_MS
    ),
    botPaceMs: readNonNegativeInt(
      "BOT_PACE_MS",
      env.BOT_PACE_MS ?? fileEnv.BOT_PACE_MS,
      DEFAULT_BOT_PACE_MS
    ),
    trickPauseMs: readTrickPause(env.TRICK_PAUSE_MS ?? fileEnv.TRICK_PAUSE_MS),
    abandonGraceMs: readNonNegativeInt(
      "ABANDON_GRACE_MS",
      env.ABANDON_GRACE_MS ?? fileEnv.ABANDON_GRACE_MS,
      DEFAULT_ABANDON_GRACE_MS
    ),
    lobbyStateDebounceMs: readNonNegativeInt(
      "LOBBY_STATE_DEBOUNCE_MS",
      env.LOBBY_STATE_DEBOUNCE_MS ?? fileEnv.LOBBY_STATE_DEBOUNCE_MS,
      DEFAULT_LOBBY_STATE_DEBOUNCE_MS
    ),
    chatHistoryLimit: readPositiveInt(
      "CHAT_HISTORY_LIMIT",
      env.CHAT_HISTORY_LIMIT ?? fileEnv.CHAT_HISTORY_LIMIT,
      DEFAULT_CHAT_HISTORY_LIMIT
    ),
    translation: readTranslationConfig(env, fileEnv),
    leaderboardSize: readPositiveInt(
      "LEADERBOARD_SIZE",
      env.LEADERBOARD_SIZE ?? fileEnv.LEADERBOARD_SIZE,
      DEFAULT_LEADERBOARD_SIZE
    ),
    leaderboardMinGames: readPositiveInt(
      "LEADERBOARD_MIN_GAMES",
      env.LEADERBOARD_MIN_GAMES ?? fileEnv.LEADERBOARD_MIN_GAMES,
      DEFAULT_LEADERBOARD_MIN_GAMES
    ),
    leaderboardRefreshMs: readNonNegativeInt(
      "LEADERBOARD_REFRESH_MS",
      env.LEADERBOARD_REFRESH_MS ?? fileEnv.LEADERBOARD_REFRESH_MS,
      DEFAULT_LEADERBOARD_REFRESH_MS
    ),
    pg: {
      max: readPositiveInt(
        "PG_POOL_MAX",
        env.PG_POOL_MAX ?? fileEnv.PG_POOL_MAX,
        DEFAULT_PG_POOL_MAX
      ),
      idleTimeoutMillis: readNonNegativeInt(
        "PG_POOL_IDLE_TIMEOUT_MS",
        env.PG_POOL_IDLE_TIMEOUT_MS ?? fileEnv.PG_POOL_IDLE_TIMEOUT_MS,
        DEFAULT_PG_IDLE_TIMEOUT_MS
      ),
      connectionTimeoutMillis: readNonNegativeInt(
        "PG_POOL_CONNECTION_TIMEOUT_MS",
        env.PG_POOL_CONNECTION_TIMEOUT_MS ?? fileEnv.PG_POOL_CONNECTION_TIMEOUT_MS,
        DEFAULT_PG_CONNECTION_TIMEOUT_MS
      )
    },
    webOrigins: readOrigins(env.WEB_ORIGIN ?? fileEnv.WEB_ORIGIN),
    trustProxy: readBool(env.TRUST_PROXY ?? fileEnv.TRUST_PROXY),
    email: {
      resendApiKey: readOptional(env.RESEND_API_KEY ?? fileEnv.RESEND_API_KEY),
      from: readOptional(env.EMAIL_FROM ?? fileEnv.EMAIL_FROM),
      appBaseUrl: readNonEmpty(env.APP_BASE_URL ?? fileEnv.APP_BASE_URL, DEFAULT_WEB_ORIGIN)
    }
  };
}

/** Būla karogs no env: `true`/`1` (case-insensitive) → `true`; viss cits → `false`. */
function readTranslationConfig(env: EnvValues, fileEnv: Record<string, string>): TranslationConfig {
  const enabled = readBool(env.TRANSLATE_ENABLED ?? fileEnv.TRANSLATE_ENABLED);
  const projectId = readOptional(
    env.GOOGLE_CLOUD_PROJECT ??
      env.TRANSLATE_PROJECT_ID ??
      fileEnv.GOOGLE_CLOUD_PROJECT ??
      fileEnv.TRANSLATE_PROJECT_ID
  );
  const credentialsFile = readOptional(
    env.GOOGLE_APPLICATION_CREDENTIALS ??
      env.TRANSLATE_GOOGLE_CREDENTIALS_FILE ??
      fileEnv.GOOGLE_APPLICATION_CREDENTIALS ??
      fileEnv.TRANSLATE_GOOGLE_CREDENTIALS_FILE
  );

  if (enabled && projectId === undefined) {
    throw new Error("TRANSLATE_ENABLED requires GOOGLE_CLOUD_PROJECT or TRANSLATE_PROJECT_ID.");
  }

  return {
    enabled,
    projectId,
    credentialsFile,
    location: readNonEmpty(
      env.TRANSLATE_LOCATION ?? fileEnv.TRANSLATE_LOCATION,
      DEFAULT_TRANSLATE_LOCATION
    ),
    dailyCharLimit: readNonNegativeInt(
      "TRANSLATE_DAILY_CHAR_LIMIT",
      env.TRANSLATE_DAILY_CHAR_LIMIT ?? fileEnv.TRANSLATE_DAILY_CHAR_LIMIT,
      FREE_TRANSLATE_DAILY_CHARS
    ),
    monthlyCharLimit: readNonNegativeInt(
      "TRANSLATE_MONTHLY_CHAR_LIMIT",
      env.TRANSLATE_MONTHLY_CHAR_LIMIT ?? fileEnv.TRANSLATE_MONTHLY_CHAR_LIMIT,
      FREE_TRANSLATE_MONTHLY_CHARS
    ),
    cacheMaxEntries: readPositiveInt(
      "TRANSLATE_CACHE_MAX_ENTRIES",
      env.TRANSLATE_CACHE_MAX_ENTRIES ?? fileEnv.TRANSLATE_CACHE_MAX_ENTRIES,
      DEFAULT_TRANSLATE_CACHE_MAX_ENTRIES
    ),
    rateLimitPerMinute: readPositiveInt(
      "TRANSLATE_RATE_LIMIT_PER_MINUTE",
      env.TRANSLATE_RATE_LIMIT_PER_MINUTE ?? fileEnv.TRANSLATE_RATE_LIMIT_PER_MINUTE,
      DEFAULT_TRANSLATE_RATE_LIMIT_PER_MINUTE
    )
  };
}

function readBool(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** Trimota vērtība vai `undefined`, ja tukša/nav (opcionāli secrets/konfigurācija). */
function readOptional(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

/** CORS izcelšu saraksts no komatu atdalīta `WEB_ORIGIN`; noklusējums dev izcelsme. */
function readOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") {
    return [DEFAULT_WEB_ORIGIN];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Vesels skaitlis ≥ 1 vai noklusējums, ja tukšs/nav. */
function readPositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

/** Vesels skaitlis ≥ 0 vai noklusējums, ja tukšs/nav. */
function readNonNegativeInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

/**
 * Trika pauze (ms): vesels skaitlis ≥ `MIN_TRICK_PAUSE_MS` (1500); noklusējums 1700.
 * Apakšējā robeža sargā web klienta triku-aiztures invariantu (sk. konstanti augšā).
 */
function readTrickPause(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_TRICK_PAUSE_MS;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_TRICK_PAUSE_MS) {
    throw new Error(
      `TRICK_PAUSE_MS must be an integer >= ${MIN_TRICK_PAUSE_MS} (web client trick freeze).`
    );
  }
  return parsed;
}

/** Turna ilgums (ms): vesels skaitlis [100, 600000]; noklusējums 10000. */
function readTurnDuration(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_TURN_DURATION_MS;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_TURN_DURATION_MS ||
    parsed > MAX_TURN_DURATION_MS
  ) {
    throw new Error(
      `TURN_DURATION_MS must be an integer from ${MIN_TURN_DURATION_MS} to ${MAX_TURN_DURATION_MS}.`
    );
  }
  return parsed;
}

/** Atgriež trimotu vērtību vai noklusējumu, ja tukša/nav. */
function readNonEmpty(value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

/**
 * Normalizē `DATABASE_URL`. Pieņem tīru SQLite ceļu, `:memory:` (testiem),
 * `file:` prefiksu (`file:./data/dev.sqlite`) vai PostgreSQL URL.
 */
function readDatabaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_DATABASE_URL;
  }

  const trimmed = value.trim();
  if (trimmed === ":memory:") {
    return trimmed;
  }
  if (trimmed.startsWith("file:")) {
    return trimmed.slice("file:".length);
  }
  return trimmed;
}

function loadDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const result: Record<string, string> = {};
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    result[key] = unquoteEnvValue(rawValue);
  }

  return result;
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function readPort(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }

  return port;
}
