import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminAuditService } from "../../src/admin/AdminAuditService.js";
import { ChatModerationService } from "../../src/admin/ChatModerationService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

describe("ChatModerationService", () => {
  let storage: SqliteStorage;
  let mod: ChatModerationService;
  const now = 1000;

  beforeEach(() => {
    storage = new SqliteStorage({ filename: ":memory:" });
    mod = new ChatModerationService(storage, new AdminAuditService(storage, () => now), () => now);
  });

  afterEach(async () => {
    await storage.close();
  });

  it("replaces a blocked word (whole-word, case-insensitive) with ****", async () => {
    await mod.add("BadWord", {});
    expect(mod.filter("you are a badword!")).toBe("you are a ****!");
    // Whole word: a partial match is NOT replaced.
    expect(mod.filter("badwordy")).toBe("badwordy");
  });

  it("matches Latvian-style unicode words (lookaround boundaries, not ASCII word-break)", async () => {
    const kuka = "kūka"; // "ku-macron-ka"
    await mod.add(kuka, {});
    expect(mod.filter(`it is ${kuka} here`)).toBe("it is **** here");
  });

  it("catches a decomposed (NFD) form of an NFC-blocked word (Codex)", async () => {
    // Force composed (NFC) and decomposed (NFD) forms so the test does not depend on how the
    // source literal is stored. e-acute has distinct NFC (U+00E9) and NFD (e + U+0301) forms.
    const nfc = "café".normalize("NFC");
    const nfd = nfc.normalize("NFD");
    expect(nfd === nfc).toBe(false); // genuinely different byte sequences
    await mod.add(nfc, {});
    // User types the visually identical decomposed form → still caught (filter normalizes to NFC).
    expect(mod.filter(`I love ${nfd} here`)).toBe("I love **** here");
  });

  it("leaves text untouched when no words are blocked (fast path)", () => {
    expect(mod.filter("anything goes")).toBe("anything goes");
  });

  it("stops filtering a removed word", async () => {
    await mod.add("spam", {});
    expect(mod.filter("spam!")).toBe("****!");
    await mod.remove("spam", {});
    expect(mod.filter("spam!")).toBe("spam!");
  });
});
