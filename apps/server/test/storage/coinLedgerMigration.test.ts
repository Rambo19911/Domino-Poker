import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { buildMigrations } from "../../src/storage/schema.js";

/**
 * Mērķtiecīgs tests migrācijai `0010_coin_ledger_open_reason` (D6, SQLite tabulas pārbūve).
 * `node:sqlite` nav `DROP CONSTRAINT`, tāpēc 0010 pārbūvē `coin_ledger` BEZ `reason` CHECK,
 * ietīta `BEGIN IMMEDIATE; ... COMMIT;` (atomiski; `migrate()` `exec` nav transakcionāls).
 * Šis pierāda datu/FK/indeksu saglabāšanu un idempotenci — Codex prasība pirms merge.
 */

const MIGRATIONS = buildMigrations("sqlite");
const ID_0010 = "0010_coin_ledger_open_reason";

/** Atver atmiņas DB un piemēro migrācijas līdz (un ieskaitot, ja `incl0010`) 0010. */
function freshDb(incl0010: boolean): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const m of MIGRATIONS) {
    if (m.id === ID_0010 && !incl0010) {
      break;
    }
    db.exec(m.up);
  }
  return db;
}

function seedUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users (id, username, username_norm, password_hash, avatar, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, id, id, "h", "default", 1, 1);
}

function insertLedger(db: DatabaseSync, row: [string, string, number, string, string, number]): void {
  db.prepare(
    `INSERT INTO coin_ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(...row);
}

describe("0010 coin_ledger rebuild (D6, SQLite)", () => {
  it("drops the reason CHECK while preserving rows, the delta<>0 CHECK, FK CASCADE, and the idempotency index", () => {
    const db = freshDb(false);
    seedUser(db, "u1");
    insertLedger(db, ["l1", "u1", 5000, "signup", "u1", 10]);
    // PIRMS 0010: `admin_adjust` pārkāpj `reason` CHECK enum.
    expect(() => insertLedger(db, ["x", "u1", 100, "admin_adjust", "a1", 20])).toThrow();

    db.exec(MIGRATIONS.find((m) => m.id === ID_0010)!.up);

    // Dati saglabāti.
    const row = db.prepare(`SELECT reason, delta FROM coin_ledger WHERE id = 'l1'`).get() as {
      reason: string;
      delta: number | bigint;
    };
    expect(row.reason).toBe("signup");
    expect(Number(row.delta)).toBe(5000);

    // `admin_adjust` tagad pieņemts (CHECK noņemts).
    insertLedger(db, ["l2", "u1", 100, "admin_adjust", "a1", 20]);

    // `delta <> 0` CHECK joprojām spēkā.
    expect(() => insertLedger(db, ["l3", "u1", 0, "admin_adjust", "a2", 30])).toThrow();

    // Idempotences UNIQUE indekss atjaunots: dublēts (user, reason, ref) noraidīts.
    expect(() => insertLedger(db, ["l4", "u1", 100, "admin_adjust", "a1", 40])).toThrow();

    // FK CASCADE atjaunots: konta dzēšana noņem ledger rindas.
    db.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
    const count = db.prepare(`SELECT COUNT(*) AS c FROM coin_ledger`).get() as { c: number | bigint };
    expect(Number(count.c)).toBe(0);
    db.close();
  });

  it("is idempotent: re-running 0010 after a successful rebuild preserves the data", () => {
    const db = freshDb(true);
    seedUser(db, "u1");
    insertLedger(db, ["l1", "u1", 250, "admin_adjust", "a1", 10]);

    // Atkārtota palaišana (simulē crash starp `up` un schema_migrations ierakstu).
    db.exec(MIGRATIONS.find((m) => m.id === ID_0010)!.up);

    const row = db.prepare(`SELECT reason, delta FROM coin_ledger WHERE id = 'l1'`).get() as {
      reason: string;
      delta: number | bigint;
    };
    expect(row.reason).toBe("admin_adjust");
    expect(Number(row.delta)).toBe(250);
    // Pārbūves pagaidu tabula nepaliek.
    const leftover = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='coin_ledger_rebuild'`)
      .get();
    expect(leftover).toBeUndefined();
    db.close();
  });
});
