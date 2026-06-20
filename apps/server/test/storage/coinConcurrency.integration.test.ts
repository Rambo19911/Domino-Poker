import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { PostgresStorage } from "../../src/storage/PostgresStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

/**
 * Produkcijas-līmeņa naudas korektuma pierādījums pret ĪSTU PostgreSQL: liels
 * paralēlu pieprasījumu skaits (concurrent race) GAN vienā instancē, GAN starp
 * VAIRĀKĀM servera instancēm (atsevišķi `pg` pool-i uz tās pašas DB/schēmas).
 *
 * Mērķis — apstiprināt, ka `CoinStore.applyLedger` `BEGIN`+`SELECT ... FOR UPDATE`
 * transakcija (sk. PostgresStorage) garantē:
 *   - **Bez overdraft**: vienlaicīgi atšķirīgu `entryId` debeti nekad nepadara
 *     bilanci negatīvu; veiksmīgo skaits = floor(balance/fee) neatkarīgi no sacīkstes.
 *   - **Idempotence zem konkurences**: vienlaicīgi TĀ PAŠA atslēgas (reason+ref)
 *     debeti/refundi/payout tiek piemēroti TIEŠI VIENU reizi (bez dubulta, bez
 *     unique-violation crash).
 *   - **Bez lost-update**: daudz atšķirīgu darbību → galīgā bilance ir precīza summa.
 *   - **Daudzinstanču drošība**: tās pašas garantijas, kad divas instances (divi
 *     pool-i) sacenšas par to pašu rindu — `FOR UPDATE` serializē starp instancēm.
 *
 * Palaiž tikai ar `TEST_POSTGRES_DATABASE_URL` (sk. `npm run test:postgres:docker`).
 */
const postgresUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describeIfPostgres = postgresUrl ? describe : describe.skip;

const NOW = 1_000_000;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function withSearchPath(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  return url.toString();
}

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$fake",
    avatar: "avatar-01",
    createdAt: NOW,
    updatedAt: NOW
  };
}

describeIfPostgres("Coin wallet concurrency (real PostgreSQL, multi-instance)", () => {
  let admin: Client;
  let schemaName: string;
  const instances: PostgresStorage[] = [];

  beforeEach(async () => {
    schemaName = `coin_conc_${process.pid}_${Date.now()}`;
    admin = new Client({ connectionString: postgresUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await admin.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
  });

  afterEach(async () => {
    for (const storage of instances) {
      await storage.close();
    }
    instances.length = 0;
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await admin.end();
  });

  /** Atver vēl vienu "instanci" (atsevišķs pool uz tās pašas schēmas). */
  async function openInstance(): Promise<PostgresStorage> {
    const storage = await PostgresStorage.open(withSearchPath(postgresUrl!, schemaName));
    instances.push(storage);
    return storage;
  }

  function walletFor(storage: PostgresStorage): WalletService {
    return new WalletService({ coins: storage, clock: () => NOW });
  }

  /** Reģistrē lietotāju un piešķir starta bonusu (5000) caur doto instanci. */
  async function seedUser(storage: PostgresStorage, id: string): Promise<void> {
    await storage.createUser(user(id));
    await walletFor(storage).grantSignupBonus(id); // → 5000
  }

  /** Skaita ledger rindas dotai (user, reason, ref) — dubulta-piemērošanas pārbaudei. */
  async function ledgerRowCount(userId: string, reason: string, ref: string): Promise<number> {
    const result = await admin.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM coin_ledger WHERE user_id = $1 AND reason = $2 AND ref = $3`,
      [userId, reason, ref]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it("never overdrafts under many concurrent distinct-ref debits (single instance)", async () => {
    const storage = await openInstance();
    const wallet = walletFor(storage);
    await seedUser(storage, "u1"); // 5000

    // 12 vienlaicīgi debeti pa 1000 (kopā 12000 > 5000) ar ATŠĶIRĪGIem entryId.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_unused, i) => wallet.debitEntryFee("u1", `e-${i}`, 1000))
    );
    const ok = results.filter((r) => r.ok).length;
    const insufficient = results.filter((r) => !r.ok).length;

    expect(ok).toBe(5); // tieši floor(5000/1000)
    expect(insufficient).toBe(7);
    expect(await storage.getBalance("u1")).toBe(0); // nekad negatīva
  });

  it("applies a same-entryId debit exactly once under concurrency (single instance)", async () => {
    const storage = await openInstance();
    const wallet = walletFor(storage);
    await seedUser(storage, "u1"); // 5000

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => wallet.debitEntryFee("u1", "dup", 1000))
    );
    // Neviena unique-violation avārija — visi atrisinās (FOR UPDATE serializē).
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await storage.getBalance("u1")).toBe(4000); // debitēts tieši vienreiz
    expect(await ledgerRowCount("u1", "mp_entry", "dup")).toBe(1);
  });

  it("pays out a same-matchId pot exactly once under concurrency (single instance)", async () => {
    const storage = await openInstance();
    const wallet = walletFor(storage);
    await seedUser(storage, "u1"); // 5000

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => wallet.payoutCoins("u1", "match-1", 700))
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await storage.getBalance("u1")).toBe(5700); // kreditēts tieši vienreiz
    expect(await ledgerRowCount("u1", "mp_payout", "match-1")).toBe(1);
  });

  it("never overdrafts across TWO instances racing on the same row", async () => {
    const a = await openInstance();
    const b = await openInstance();
    await seedUser(a, "u1"); // 5000
    const walletA = walletFor(a);
    const walletB = walletFor(b);

    // 12 debeti pa 1000, atšķirīgi entryId, dalīti starp abām instancēm, visi vienlaikus.
    const calls = Array.from({ length: 12 }, (_unused, i) =>
      (i % 2 === 0 ? walletA : walletB).debitEntryFee("u1", `e-${i}`, 1000)
    );
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.ok).length).toBe(5);
    expect(await a.getBalance("u1")).toBe(0);
    expect(await b.getBalance("u1")).toBe(0); // abas instances redz to pašu autoritatīvo bilanci
  });

  it("applies a same-entryId debit once across TWO instances (idempotent)", async () => {
    const a = await openInstance();
    const b = await openInstance();
    await seedUser(a, "u1"); // 5000
    const walletA = walletFor(a);
    const walletB = walletFor(b);

    const calls = [
      ...Array.from({ length: 8 }, () => walletA.debitEntryFee("u1", "dup", 1000)),
      ...Array.from({ length: 8 }, () => walletB.debitEntryFee("u1", "dup", 1000))
    ];
    const results = await Promise.allSettled(calls);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await a.getBalance("u1")).toBe(4000); // viens debets, ne divi
    expect(await ledgerRowCount("u1", "mp_entry", "dup")).toBe(1);
  });

  it("pays out a same-matchId pot once across TWO instances (the realistic dup GAME_OVER)", async () => {
    const a = await openInstance();
    const b = await openInstance();
    await seedUser(a, "u1"); // 5000
    const walletA = walletFor(a);
    const walletB = walletFor(b);

    const calls = [
      ...Array.from({ length: 8 }, () => walletA.payoutCoins("u1", "match-1", 700)),
      ...Array.from({ length: 8 }, () => walletB.payoutCoins("u1", "match-1", 700))
    ];
    const results = await Promise.allSettled(calls);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await a.getBalance("u1")).toBe(5700); // izmaksāts tieši vienreiz
    expect(await ledgerRowCount("u1", "mp_payout", "match-1")).toBe(1);
  });

  it("keeps every balance exact under volume (many users, concurrent distinct debits, two instances)", async () => {
    const a = await openInstance();
    const b = await openInstance();
    const userIds = Array.from({ length: 20 }, (_unused, i) => `u${i}`);
    for (const id of userIds) {
      await seedUser(a, id); // katrs 5000
    }
    const walletA = walletFor(a);
    const walletB = walletFor(b);

    // Katram lietotājam 5 vienlaicīgi atšķirīgi debeti pa 100 (dalīti starp instancēm).
    const calls = userIds.flatMap((id) =>
      Array.from({ length: 5 }, (_unused, k) =>
        (k % 2 === 0 ? walletA : walletB).debitEntryFee(id, `${id}-e${k}`, 100)
      )
    );
    const results = await Promise.all(calls);
    expect(results.every((r) => r.ok)).toBe(true); // 5×100=500 < 5000, visi iztur

    // Katra lietotāja galīgā bilance ir precīza (bez lost-update) = 5000 − 500.
    for (const id of userIds) {
      expect(await a.getBalance(id)).toBe(4500);
    }
  });

  it("refunds a same-entryId once across TWO instances (idempotent refund)", async () => {
    const a = await openInstance();
    const b = await openInstance();
    await seedUser(a, "u1"); // 5000
    const walletA = walletFor(a);
    const walletB = walletFor(b);
    expect((await walletA.debitEntryFee("u1", "e1", 1000)).ok).toBe(true); // 4000

    const calls = [
      ...Array.from({ length: 8 }, () => walletA.refundEntryFee("u1", "e1", 1000)),
      ...Array.from({ length: 8 }, () => walletB.refundEntryFee("u1", "e1", 1000))
    ];
    const results = await Promise.allSettled(calls);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await a.getBalance("u1")).toBe(5000); // refundēts tieši vienreiz
    expect(await ledgerRowCount("u1", "mp_refund", "e1")).toBe(1);
  });

  it("refunds a same-entryId exactly once under concurrency (idempotent refund)", async () => {
    const storage = await openInstance();
    const wallet = walletFor(storage);
    await seedUser(storage, "u1"); // 5000
    const debit = await wallet.debitEntryFee("u1", "e1", 1000); // 4000
    expect(debit.ok).toBe(true);

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => wallet.refundEntryFee("u1", "e1", 1000))
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await storage.getBalance("u1")).toBe(5000); // refundēts tieši vienreiz
    expect(await ledgerRowCount("u1", "mp_refund", "e1")).toBe(1);
  });
});
