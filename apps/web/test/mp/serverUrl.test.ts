import { describe, expect, it } from "vitest";

import { resolveServerUrl } from "../../lib/mp/serverUrl";

describe("resolveServerUrl (8.1)", () => {
  it("uses the env override verbatim when provided", () => {
    expect(resolveServerUrl({ envUrl: "ws://example.test:9000/ws" })).toBe(
      "ws://example.test:9000/ws"
    );
  });

  it("derives ws:// from an http page on the server port", () => {
    expect(
      resolveServerUrl({ location: { hostname: "127.0.0.1", protocol: "http:" } })
    ).toBe("ws://127.0.0.1:4000/ws");
  });

  it("derives wss:// from an https page", () => {
    expect(
      resolveServerUrl({ location: { hostname: "play.example", protocol: "https:" }, port: 4001 })
    ).toBe("wss://play.example:4001/ws");
  });

  it("ignores a blank env override and falls back to derivation", () => {
    expect(
      resolveServerUrl({ envUrl: "   ", location: { hostname: "localhost", protocol: "http:" } })
    ).toBe("ws://localhost:4000/ws");
  });
});
