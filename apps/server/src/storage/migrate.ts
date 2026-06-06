import process from "node:process";

import { Pool } from "pg";

import { loadServerConfig } from "../config.js";
import { isPostgresDatabaseUrl } from "./index.js";
import { runMigrations } from "./migrations.js";

/**
 * Atsevišķs migrāciju process (`npm run migrate`). Deploy to var palaist kā
 * diskrētu soli PIRMS servera starta. Serveris arī pats migrē startā (sk.
 * `PostgresStorage.open`), tāpēc šis ir papildu, nevis vienīgais ceļš.
 *
 * Tikai PostgreSQL: SQLite veido shēmu atvēršanas brīdī, tāpēc šeit nav ko darīt.
 */
const config = loadServerConfig();

if (!isPostgresDatabaseUrl(config.databaseUrl)) {
  console.log(
    `[migrate] DATABASE_URL nav PostgreSQL (${config.databaseUrl}); ` +
      `SQLite veido shēmu atvēršanas brīdī — nav ko migrēt.`
  );
  process.exit(0);
}

const pool = new Pool({ connectionString: config.databaseUrl });
try {
  const applied = await runMigrations(pool);
  if (applied.length === 0) {
    console.log("[migrate] shēma jau aktuāla; nekas nav piemērots.");
  } else {
    console.log(`[migrate] piemērotas ${applied.length} migrācija(s): ${applied.join(", ")}`);
  }
} catch (error) {
  console.error("[migrate] migrācijas neizdevās:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
