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
  /** PostgreSQL pool limiti (tikai PG režīmā; SQLite tos ignorē). */
  pg: PgPoolConfig;
  /**
   * CORS atļauto izcelšu saraksts auth HTTP maršrutiem (`WEB_ORIGIN`, ar komatu
   * atdalīts). Noklusējums dev Next.js izcelsme. NEKAD `*` (drošības standarts).
   */
  webOrigins: readonly string[];
  /** Paroles atjaunošanas e-pasta konfigurācija (Fāze 5). */
  email: EmailConfig;
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
    email: {
      resendApiKey: readOptional(env.RESEND_API_KEY ?? fileEnv.RESEND_API_KEY),
      from: readOptional(env.EMAIL_FROM ?? fileEnv.EMAIL_FROM),
      appBaseUrl: readNonEmpty(env.APP_BASE_URL ?? fileEnv.APP_BASE_URL, DEFAULT_WEB_ORIGIN)
    }
  };
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
