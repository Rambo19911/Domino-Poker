import { describe, expect, it } from "vitest";

import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import { SessionManager } from "../../src/sessions/SessionManager.js";

function buildManager() {
  let sessionSeq = 0;
  let tokenSeq = 0;
  return new SessionManager({
    displayIds: new DisplayIdRegistry(),
    createSessionId: () => `session-${(sessionSeq += 1)}`,
    createReconnectToken: () => `token-${(tokenSeq += 1)}`
  });
}

describe("SessionManager (9.1)", () => {
  it("registers a fresh client with a new token and stable displayId", () => {
    const sessions = buildManager();
    const result = sessions.register("conn-1", "client-A");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isReconnect).toBe(false);
    expect(result.replacedConnectionId).toBeUndefined();
    expect(result.identity.playerId).toBe("client-A");
    expect(result.identity.reconnectToken).toBe("token-1");
    expect(result.identity.displayId).toMatch(/^#\d{5}$/);
    expect(sessions.onlineCount()).toBe(1);
  });

  it("treats a reconnect with the matching token as the same session (stable token + displayId)", () => {
    const sessions = buildManager();
    const first = sessions.register("conn-1", "client-A");
    if (!first.ok) throw new Error("expected ok");
    const displayId = first.identity.displayId;

    // Atvienojas, tad reconnect ar to pašu token.
    sessions.unregister("conn-1");
    const again = sessions.register("conn-2", "client-A", "token-1");

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.isReconnect).toBe(true);
    expect(again.identity.reconnectToken).toBe("token-1"); // stabils
    expect(again.identity.displayId).toBe(displayId); // stabils
    expect(again.replacedConnectionId).toBeUndefined(); // vecais jau atvienojies
  });

  it("rejects a reconnect whose token does not match the known clientId", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A"); // token-1
    sessions.unregister("conn-1");

    const forged = sessions.register("conn-2", "client-A", "token-WRONG");
    expect(forged.ok).toBe(false);
    if (forged.ok) return;
    expect(forged.reason).toBe("token_mismatch");
  });

  it("rejects a known clientId that provides no token", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A");
    sessions.unregister("conn-1");

    const noToken = sessions.register("conn-2", "client-A");
    expect(noToken.ok).toBe(false);
  });

  it("enforces a single active socket — a new connection replaces the old", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A"); // token-1
    const second = sessions.register("conn-2", "client-A", "token-1");

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.replacedConnectionId).toBe("conn-1");
    expect(sessions.isActiveConnection("conn-1")).toBe(false); // aizstāts
    expect(sessions.isActiveConnection("conn-2")).toBe(true);
    expect(sessions.onlineCount()).toBe(1); // viens spēlētājs, viens aktīvs socket
  });

  it("keeps the durable token after disconnect but drops it on release", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A"); // token-1
    sessions.unregister("conn-1");
    expect(sessions.onlineCount()).toBe(0);

    // Pēc release tas pats clientId saņem svaigu sesiju (jaunu token).
    sessions.release("client-A");
    const fresh = sessions.register("conn-2", "client-A");
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.isReconnect).toBe(false);
    expect(fresh.identity.reconnectToken).toBe("token-2");
  });

  it("unregistering a replaced (old) connection is a no-op", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A");
    sessions.register("conn-2", "client-A", "token-1"); // replaces conn-1
    expect(sessions.unregister("conn-1")).toBeUndefined(); // jau aizstāts
    expect(sessions.isActiveConnection("conn-2")).toBe(true); // jaunais paliek aktīvs
  });

  it("tracks ownership and online count across players", () => {
    const sessions = buildManager();
    sessions.register("conn-1", "client-A");
    sessions.register("conn-2", "client-B");
    expect(sessions.onlineCount()).toBe(2);
    expect(sessions.ownsPlayer("conn-1", "client-A")).toBe(true);
    expect(sessions.ownsPlayer("conn-1", "client-B")).toBe(false);
    expect(sessions.hasActiveConnection("client-B")).toBe(true);

    sessions.unregister("conn-2");
    expect(sessions.hasActiveConnection("client-B")).toBe(false);
    expect(sessions.onlineCount()).toBe(1);
  });
});
