import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../src/config.js";

const missingEnvPath = "__missing_domino_poker_test_env__";

describe("loadServerConfig", () => {
  it("uses defaults when env values are missing", () => {
    expect(loadServerConfig({}, missingEnvPath)).toEqual({
      httpPort: 4000,
      wsPort: 4001,
      serverHost: "0.0.0.0",
      databaseUrl: "./data/dev.sqlite",
      nodeEnv: "development",
      turnDurationMs: 10_000
    });
  });

  it("accepts explicit ports, host, environment, and turn duration", () => {
    expect(
      loadServerConfig(
        {
          SERVER_PORT: "4100",
          WS_PORT: "4101",
          SERVER_HOST: "127.0.0.1",
          NODE_ENV: "production",
          TURN_DURATION_MS: "5000"
        },
        missingEnvPath
      )
    ).toEqual({
      httpPort: 4100,
      wsPort: 4101,
      serverHost: "127.0.0.1",
      databaseUrl: "./data/dev.sqlite",
      nodeEnv: "production",
      turnDurationMs: 5000
    });
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
