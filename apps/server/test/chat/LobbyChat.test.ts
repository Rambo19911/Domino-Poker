import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";

function makeChat(
  overrides: Partial<{
    now: () => number;
    historyLimit: number;
    burstCapacity: number;
    refillMs: number;
    maxLength: number;
  }> = {}
) {
  let seq = 0;
  return new LobbyChat({
    clock: overrides.now ?? (() => 0),
    createMessageId: () => `m${(seq += 1)}`,
    ...(overrides.historyLimit !== undefined ? { historyLimit: overrides.historyLimit } : {}),
    ...(overrides.burstCapacity !== undefined ? { burstCapacity: overrides.burstCapacity } : {}),
    ...(overrides.refillMs !== undefined ? { refillMs: overrides.refillMs } : {}),
    ...(overrides.maxLength !== undefined ? { maxLength: overrides.maxLength } : {})
  });
}

describe("LobbyChat (6.6)", () => {
  it("rejects empty and whitespace-only messages with INVALID_MESSAGE", () => {
    const chat = makeChat();
    expect(chat.submit("p1", "#11111", "")).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
    expect(chat.submit("p1", "#11111", "   ")).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
    expect(chat.history()).toHaveLength(0);
  });

  it("rejects messages longer than the limit with INVALID_MESSAGE", () => {
    const chat = makeChat({ maxLength: 5 });
    expect(chat.submit("p1", "#11111", "123456")).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });

  it("stores the text raw (XSS safety is the client's React text rendering)", () => {
    const chat = makeChat();
    const result = chat.submit("p1", "#11111", `  <b>"hi" & 'x'</b>  `);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.message.text).toBe(`<b>"hi" & 'x'</b>`); // tikai trim, bez escaping
      expect(result.message.authorDisplayId).toBe("#11111");
    }
  });

  it("allows a burst up to capacity, then rate-limits further messages", () => {
    const now = 1000;
    const chat = makeChat({ now: () => now, burstCapacity: 3, refillMs: 2000 });

    // 3 ziņas pēc kārtas (uzliesmojums) — visas pieņemtas.
    expect(chat.submit("p1", "#11111", "1")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "2")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "3")).toMatchObject({ ok: true });
    // 4. uzreiz pēc tam — spainis tukšs → ierobežots.
    expect(chat.submit("p1", "#11111", "4")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("refills one token after refillMs so steady chatting works", () => {
    let now = 1000;
    const chat = makeChat({ now: () => now, burstCapacity: 2, refillMs: 2000 });
    expect(chat.submit("p1", "#11111", "1")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "2")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "3")).toMatchObject({ ok: false, code: "RATE_LIMITED" });

    now = 3000; // +2000ms → uzkrāts 1 tokens
    expect(chat.submit("p1", "#11111", "later")).toMatchObject({ ok: true });
  });

  it("rate-limits per player, not globally", () => {
    const now = 1000;
    const chat = makeChat({ now: () => now, burstCapacity: 1, refillMs: 2000 });
    expect(chat.submit("p1", "#11111", "a")).toMatchObject({ ok: true });
    // p1 tūlīt atkārtoti — ierobežots, bet p2 (cits spainis) atļauts.
    expect(chat.submit("p1", "#11111", "a2")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(chat.submit("p2", "#22222", "b")).toMatchObject({ ok: true });
  });

  it("forget() resets a player's burst budget (cleanup on disconnect)", () => {
    const now = 1000;
    const chat = makeChat({ now: () => now, burstCapacity: 1, refillMs: 100000 });
    expect(chat.submit("p1", "#11111", "a")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "a2")).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    chat.forget("p1"); // spēlētājs atvienojās
    expect(chat.submit("p1", "#11111", "fresh")).toMatchObject({ ok: true });
  });

  it("keeps only the last `historyLimit` messages", () => {
    const chat = makeChat({ historyLimit: 2, burstCapacity: 10 });
    chat.submit("p1", "#11111", "one");
    chat.submit("p1", "#11111", "two");
    chat.submit("p1", "#11111", "three");
    const history = chat.history();
    expect(history.map((m) => m.text)).toEqual(["two", "three"]);
  });
});

describe("LobbyChat persistence hooks (10.3)", () => {
  it("invokes onMessage only for accepted messages", () => {
    let seq = 0;
    const persisted: string[] = [];
    const chat = new LobbyChat({
      clock: () => 0,
      createMessageId: () => `m${(seq += 1)}`,
      onMessage: (message) => persisted.push(message.text)
    });

    expect(chat.submit("p1", "#11111", "hello")).toMatchObject({ ok: true });
    expect(chat.submit("p1", "#11111", "")).toMatchObject({ ok: false }); // noraidīta → bez āķa

    expect(persisted).toEqual(["hello"]);
  });

  it("hydrate fills history (chat survives a simulated restart) up to historyLimit", () => {
    const chat = new LobbyChat({ clock: () => 0, historyLimit: 2 });
    chat.hydrate([
      { id: "h1", authorDisplayId: "#1", text: "old-1", serverNow: 10 },
      { id: "h2", authorDisplayId: "#1", text: "old-2", serverNow: 20 },
      { id: "h3", authorDisplayId: "#1", text: "old-3", serverNow: 30 }
    ]);

    // Patur tikai pēdējās historyLimit; history() (→ CHAT_HISTORY) tās redz.
    expect(chat.history().map((m) => m.text)).toEqual(["old-2", "old-3"]);
  });

  it("does not throw if an onMessage observer throws (best-effort)", () => {
    const chat = new LobbyChat({
      clock: () => 0,
      onMessage: () => {
        throw new Error("db down");
      }
    });
    expect(() => chat.submit("p1", "#11111", "hi")).not.toThrow();
    expect(chat.history()).toHaveLength(1); // ziņa joprojām pieņemta lokāli
  });
});
