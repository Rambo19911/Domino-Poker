import type { RandomSource } from "@domino-poker/core/slots";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { SlotService, createCryptoRandomSource } from "../../src/slots/SlotService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$fake",
    avatar: "avatar-01",
    createdAt: 1000,
    updatedAt: 1000
  };
}

/** Deterministisks avots: cikliski atkārto dotos vārdus, tāpēc režģis ir atkārtojams. */
function cyclingSource(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    nextUint32(): number {
      const value = values[index % values.length] as number;
      index += 1;
      return value;
    }
  };
}

describe("SlotService", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
    wallet = new WalletService({ coins: storage, slots: storage, clock: () => 5000 });
    await wallet.grantSignupBonus("u1"); // 5000
  });

  afterEach(async () => {
    await storage.close();
  });

  /** Token 0 → katra kolonna ir sakrauts Full Wild → visas 11 līnijas maksā maksimumu. */
  const allWild = (): SlotService =>
    new SlotService({ wallet, random: cyclingSource([0]) });

  it("generates the grid and the payout server-side from the line bet alone", async () => {
    const result = await allWild().spin("u1", "spin-1", 20);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.applied).toBe(true);
    expect(result.spin.totalBet).toBe(220); // 11 x 20, serveris to aprēķina
    expect(result.spin.lines).toHaveLength(11);
    // ALL_WILD garumā 5 = 11260 simtdaļas → 20 x 112.6 = 2252 monētas uz līniju.
    expect(result.spin.lines.every((line) => line.category === "ALL_WILD")).toBe(true);
    expect(result.spin.payout).toBe(11 * 2252);
    expect(result.spin.mathVersion).toBe("domino-slots-math-v3");
    expect(result.balance).toBe(5000 - 220 + 11 * 2252);
  });

  it("marks the full wild column so the renderer can animate it", async () => {
    const result = await allWild().spin("u1", "spin-1", 20);
    if (!result.ok) throw new Error("unreachable");
    expect(result.spin.grid).toHaveLength(3);
    for (const row of result.spin.grid) {
      expect(row).toHaveLength(5);
      expect(row.every((cell) => cell.symbol === "WILD_FULL" && cell.fromFullWildColumn)).toBe(
        true
      );
    }
  });

  it("returns JSON-safe numbers, never bigint", async () => {
    const result = await allWild().spin("u1", "spin-1", 20);
    if (!result.ok) throw new Error("unreachable");
    // bigint neizdzīvo JSON.stringify — tas nokristu HTTP slānī, ne šeit.
    expect(() => JSON.stringify(result.spin)).not.toThrow();
    for (const line of result.spin.lines) {
      expect(typeof line.winCoins).toBe("number");
    }
    expect(typeof result.spin.scatterWin).toBe("number");
  });

  it("replays the recorded spin and ignores the freshly generated grid", async () => {
    const first = await allWild().spin("u1", "spin-1", 20);
    if (!first.ok) throw new Error("unreachable");

    // Otrs izsaukums ar TO PAŠU spinId, bet avotu, kas dotu pavisam citu režģi.
    const other = new SlotService({ wallet, random: cyclingSource([9, 5, 61, 7]) });
    const replay = await other.spin("u1", "spin-1", 20);
    if (!replay.ok) throw new Error("unreachable");

    expect(replay.applied).toBe(false);
    expect(replay.balance).toBe(first.balance);
    expect(replay.spin).toEqual(first.spin); // tieši tas pats iznākums, ne jaunais
  });

  it("rejects a spin the balance cannot cover", async () => {
    const service = allWild();
    // Iztukšo bilanci ar 22 griezieniem pa 220... vienkāršāk: tērē tieši.
    await wallet.purchaseItem("u1", "drain", 4900);
    const result = await service.spin("u1", "spin-1", 20);
    expect(result).toEqual({ ok: false, reason: "insufficient", balance: 100 });
  });

  it("reports unsupported when the wallet has no slot capability", async () => {
    const noSlots = new WalletService({ coins: storage, clock: () => 5000 });
    const service = new SlotService({ wallet: noSlots, random: cyclingSource([0]) });
    expect(await service.spin("u1", "spin-1", 20)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("refuses an unsupported line bet even when the route check is bypassed", async () => {
    // Aizsardzība dziļumā: `LineBet` savienojums pazūd kompilācijā, tāpēc netipēts
    // izsaucējs varētu padot 10 — tieši to likmi, kas rada daļskaitļa monētas.
    const service = allWild();
    for (const bad of [10, 30, 50, 0, 25, 1000]) {
      await expect(
        service.spin("u1", `bad-${bad}`, bad as 20 | 40 | 60 | 100 | 200)
      ).rejects.toThrow(/Unsupported slot line bet/u);
    }
    // Nekas netika norēķināts.
    expect(await storage.getBalance("u1")).toBe(5000);
  });

  it("keeps every configured line bet payable in whole coins", async () => {
    // Sasaista maršruta atļauto likmju kopu ar veselo monētu invariantu: neviens
    // konfigurētais solis nedrīkst likt evaluatoram mest daļskaitļa kļūdu.
    for (const [index, lineBet] of ([20, 40, 60, 100, 200] as const).entries()) {
      const result = await allWild().spin("u1", `bet-${index}`, lineBet);
      expect(result.ok, `line bet ${lineBet}`).toBe(true);
      if (!result.ok) continue;
      expect(Number.isSafeInteger(result.spin.payout)).toBe(true);
      expect(result.spin.totalBet).toBe(lineBet * 11);
    }
  });
});

describe("createCryptoRandomSource", () => {
  it("produces uint32 values and refills its buffer", () => {
    // Buferis ar 2 vārdiem → 5 izsaukumi piespiež vairākas papildināšanas.
    const source = createCryptoRandomSource(2);
    const values = Array.from({ length: 5 }, () => source.nextUint32());
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it("does not repeat a fixed pattern across many draws", () => {
    const source = createCryptoRandomSource(4);
    const values = new Set(Array.from({ length: 200 }, () => source.nextUint32()));
    // CSPRNG: 200 vilcieni no 2^32 praktiski nekad nav gandrīz visi vienādi.
    expect(values.size).toBeGreaterThan(150);
  });
});
