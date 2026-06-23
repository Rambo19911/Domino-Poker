import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../src/config.js";

const missingEnvPath = "__missing_domino_poker_test_env__";

/** Operacionālie noklusējumi (16. punkts) = iepriekšējie `index.ts` literāļi. */
const opsDefaults = {
  roomLeaseTtlMs: 30_000,
  preGameDelayMs: 10_000,
  botPaceMs: 800,
  trickPauseMs: 1700,
  abandonGraceMs: 60_000,
  lobbyStateDebounceMs: 200,
  chatHistoryLimit: 50,
  leaderboardSize: 100,
  leaderboardMinGames: 10,
  leaderboardRefreshMs: 30_000
};

const adminDefaults = {
  enabled: false,
  passwordHash: undefined,
  email: "rihardslaskovs@gmail.com",
  webOrigins: ["http://localhost:3001"]
};

const translationDefaults = {
  enabled: false,
  projectId: undefined,
  credentialsFile: undefined,
  location: "global",
  dailyCharLimit: 16_000,
  monthlyCharLimit: 500_000,
  cacheMaxEntries: 1_000,
  rateLimitPerMinute: 30
};

describe("loadServerConfig", () => {
  it("uses defaults when env values are missing", () => {
    expect(loadServerConfig({}, missingEnvPath)).toEqual({
      httpPort: 4000,
      serverHost: "0.0.0.0",
      databaseUrl: "./data/dev.sqlite",
      nodeEnv: "development",
      turnDurationMs: 10_000,
      ...opsDefaults,
      translation: translationDefaults,
      pg: { max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 0 },
      webOrigins: ["http://localhost:3000"],
      trustProxy: false,
      email: {
        resendApiKey: undefined,
        from: undefined,
        appBaseUrl: "http://localhost:3000",
        contactTo: "rihardslaskovs@gmail.com"
      },
      admin: adminDefaults
    });
  });

  it("accepts explicit ports, host, environment, and turn duration", () => {
    expect(
      loadServerConfig(
        {
          SERVER_PORT: "4100",
          SERVER_HOST: "127.0.0.1",
          NODE_ENV: "production",
          TURN_DURATION_MS: "5000"
        },
        missingEnvPath
      )
    ).toEqual({
      httpPort: 4100,
      serverHost: "127.0.0.1",
      databaseUrl: "./data/dev.sqlite",
      nodeEnv: "production",
      turnDurationMs: 5000,
      ...opsDefaults,
      translation: translationDefaults,
      pg: { max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 0 },
      webOrigins: ["http://localhost:3000"],
      trustProxy: false,
      email: {
        resendApiKey: undefined,
        from: undefined,
        appBaseUrl: "http://localhost:3000",
        contactTo: "rihardslaskovs@gmail.com"
      },
      admin: adminDefaults
    });
  });

  it("reads configurable operational values (lease TTL, pacing, grace, debounce, chat limit)", () => {
    const config = loadServerConfig(
      {
        ROOM_LEASE_TTL_MS: "45000",
        PRE_GAME_DELAY_MS: "0",
        BOT_PACE_MS: "0",
        TRICK_PAUSE_MS: "2500",
        ABANDON_GRACE_MS: "90000",
        LOBBY_STATE_DEBOUNCE_MS: "0",
        CHAT_HISTORY_LIMIT: "100"
      },
      missingEnvPath
    );
    expect(config.roomLeaseTtlMs).toBe(45_000);
    expect(config.preGameDelayMs).toBe(0); // 0 = bez pirms-spēles atskaites
    expect(config.botPaceMs).toBe(0); // 0 = bez botu aiztures
    expect(config.trickPauseMs).toBe(2500);
    expect(config.abandonGraceMs).toBe(90_000);
    expect(config.lobbyStateDebounceMs).toBe(0); // 0 = tūlītējs broadcast
    expect(config.chatHistoryLimit).toBe(100);
  });

  it("rejects a non-positive ROOM_LEASE_TTL_MS (lease would expire instantly)", () => {
    expect(() => loadServerConfig({ ROOM_LEASE_TTL_MS: "0" }, missingEnvPath)).toThrow(
      "ROOM_LEASE_TTL_MS must be a positive integer."
    );
  });

  it("rejects a non-positive CHAT_HISTORY_LIMIT", () => {
    expect(() => loadServerConfig({ CHAT_HISTORY_LIMIT: "0" }, missingEnvPath)).toThrow(
      "CHAT_HISTORY_LIMIT must be a positive integer."
    );
  });

  it("reads chat translation config and protects the free monthly character tier by default", () => {
    expect(
      loadServerConfig(
        {
          TRANSLATE_ENABLED: "true",
          GOOGLE_CLOUD_PROJECT: "gen-lang-client-0332314312",
          GOOGLE_APPLICATION_CREDENTIALS: "C:/secure/google-translate.json"
        },
        missingEnvPath
      ).translation
    ).toEqual({
      enabled: true,
      projectId: "gen-lang-client-0332314312",
      credentialsFile: "C:/secure/google-translate.json",
      location: "global",
      dailyCharLimit: 16_000,
      monthlyCharLimit: 500_000,
      cacheMaxEntries: 1_000,
      rateLimitPerMinute: 30
    });
  });

  it("rejects enabled chat translation without a Google Cloud project id", () => {
    expect(() => loadServerConfig({ TRANSLATE_ENABLED: "true" }, missingEnvPath)).toThrow(
      "TRANSLATE_ENABLED requires GOOGLE_CLOUD_PROJECT or TRANSLATE_PROJECT_ID."
    );
  });

  it("reads configurable leaderboard tunables (size, min games, refresh interval)", () => {
    const config = loadServerConfig(
      {
        LEADERBOARD_SIZE: "50",
        LEADERBOARD_MIN_GAMES: "5",
        LEADERBOARD_REFRESH_MS: "0"
      },
      missingEnvPath
    );
    expect(config.leaderboardSize).toBe(50);
    expect(config.leaderboardMinGames).toBe(5);
    expect(config.leaderboardRefreshMs).toBe(0); // 0 = vienmēr svaigs (bez keša TTL)
  });

  it("rejects a non-positive LEADERBOARD_MIN_GAMES (would divide by zero on win rate)", () => {
    expect(() => loadServerConfig({ LEADERBOARD_MIN_GAMES: "0" }, missingEnvPath)).toThrow(
      "LEADERBOARD_MIN_GAMES must be a positive integer."
    );
  });

  it("rejects a negative ABANDON_GRACE_MS", () => {
    expect(() => loadServerConfig({ ABANDON_GRACE_MS: "-1" }, missingEnvPath)).toThrow(
      "ABANDON_GRACE_MS must be a non-negative integer."
    );
  });

  it("rejects TRICK_PAUSE_MS below the web trick-freeze floor (1500ms)", () => {
    // Sargs pret pārrobežu invarianta pārkāpumu: klients aiztur pabeigto triku
    // 1500 ms; īsāka servera pauze ļautu nākamajam gājienam ielauzties aizturē.
    expect(() => loadServerConfig({ TRICK_PAUSE_MS: "1499" }, missingEnvPath)).toThrow(
      "TRICK_PAUSE_MS must be an integer >= 1500"
    );
    expect(loadServerConfig({ TRICK_PAUSE_MS: "1500" }, missingEnvPath).trickPauseMs).toBe(1500);
  });

  it("parses TRUST_PROXY as a boolean flag (true/1 → true; else false)", () => {
    expect(loadServerConfig({ TRUST_PROXY: "true" }, missingEnvPath).trustProxy).toBe(true);
    expect(loadServerConfig({ TRUST_PROXY: "1" }, missingEnvPath).trustProxy).toBe(true);
    expect(loadServerConfig({ TRUST_PROXY: "false" }, missingEnvPath).trustProxy).toBe(false);
    expect(loadServerConfig({ TRUST_PROXY: "yes" }, missingEnvPath).trustProxy).toBe(false);
    expect(loadServerConfig({}, missingEnvPath).trustProxy).toBe(false);
  });

  it("reads password-reset email config (Resend key, from, base URL)", () => {
    expect(
      loadServerConfig(
        {
          RESEND_API_KEY: "re_test_key",
          EMAIL_FROM: "no-reply@domino-poker.com",
          APP_BASE_URL: "https://domino-poker.com"
        },
        missingEnvPath
      ).email
    ).toEqual({
      resendApiKey: "re_test_key",
      from: "no-reply@domino-poker.com",
      appBaseUrl: "https://domino-poker.com",
      contactTo: "rihardslaskovs@gmail.com"
    });
  });

  it("reads CONTACT_EMAIL override for the contact form recipient", () => {
    expect(
      loadServerConfig({ CONTACT_EMAIL: "owner@example.com" }, missingEnvPath).email.contactTo
    ).toBe("owner@example.com");
  });

  it("disables admin by default and enables it only when ADMIN_PASSWORD_HASH is set", () => {
    expect(loadServerConfig({}, missingEnvPath).admin).toEqual({
      enabled: false,
      passwordHash: undefined,
      email: "rihardslaskovs@gmail.com",
      webOrigins: ["http://localhost:3001"]
    });
    const enabled = loadServerConfig(
      {
        ADMIN_PASSWORD_HASH: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
        ADMIN_EMAIL: "owner@example.com",
        ADMIN_WEB_ORIGIN: "https://admin.domino-poker.com, https://admin2.example.com"
      },
      missingEnvPath
    ).admin;
    expect(enabled).toEqual({
      enabled: true,
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
      email: "owner@example.com",
      webOrigins: ["https://admin.domino-poker.com", "https://admin2.example.com"]
    });
  });

  it("parses a comma-separated WEB_ORIGIN allowlist", () => {
    expect(
      loadServerConfig(
        { WEB_ORIGIN: "https://domino-poker.com, https://www.domino-poker.com" },
        missingEnvPath
      ).webOrigins
    ).toEqual(["https://domino-poker.com", "https://www.domino-poker.com"]);
  });

  it("reads configurable PostgreSQL pool limits", () => {
    expect(
      loadServerConfig(
        {
          PG_POOL_MAX: "20",
          PG_POOL_IDLE_TIMEOUT_MS: "30000",
          PG_POOL_CONNECTION_TIMEOUT_MS: "5000"
        },
        missingEnvPath
      ).pg
    ).toEqual({ max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5000 });
  });

  it("rejects a non-positive PG_POOL_MAX", () => {
    expect(() => loadServerConfig({ PG_POOL_MAX: "0" }, missingEnvPath)).toThrow(
      "PG_POOL_MAX must be a positive integer."
    );
  });

  it("rejects a negative PG_POOL_CONNECTION_TIMEOUT_MS", () => {
    expect(() =>
      loadServerConfig({ PG_POOL_CONNECTION_TIMEOUT_MS: "-1" }, missingEnvPath)
    ).toThrow("PG_POOL_CONNECTION_TIMEOUT_MS must be a non-negative integer.");
  });

  it("rejects an out-of-range TURN_DURATION_MS", () => {
    expect(() => loadServerConfig({ TURN_DURATION_MS: "50" }, missingEnvPath)).toThrow(
      "TURN_DURATION_MS must be an integer"
    );
  });

  it("accepts HTTP_PORT as an alias for SERVER_PORT", () => {
    expect(loadServerConfig({ HTTP_PORT: "4200" }, missingEnvPath).httpPort).toBe(4200);
  });

  it("rejects invalid port values", () => {
    expect(() => loadServerConfig({ SERVER_PORT: "invalid" }, missingEnvPath)).toThrow(
      "SERVER_PORT/HTTP_PORT must be an integer from 1 to 65535."
    );
  });

  it("accepts an explicit DATABASE_URL file path", () => {
    expect(
      loadServerConfig({ DATABASE_URL: "./data/custom.sqlite" }, missingEnvPath).databaseUrl
    ).toBe("./data/custom.sqlite");
  });

  it("supports :memory: and strips the file: prefix", () => {
    expect(loadServerConfig({ DATABASE_URL: ":memory:" }, missingEnvPath).databaseUrl).toBe(
      ":memory:"
    );
    expect(
      loadServerConfig({ DATABASE_URL: "file:./data/dev.sqlite" }, missingEnvPath).databaseUrl
    ).toBe("./data/dev.sqlite");
  });

  it("accepts a PostgreSQL URL for the storage factory", () => {
    expect(
      loadServerConfig({ DATABASE_URL: "postgres://localhost/db" }, missingEnvPath).databaseUrl
    ).toBe("postgres://localhost/db");
  });
});
