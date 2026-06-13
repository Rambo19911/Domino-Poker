// Dev tool — seeds a SEPARATE demo SQLite DB with fake leaderboard players for
// manual/visual QA of the LeaderboardDialog. NOT used by build/test/CI; never run
// against the real data/dev.sqlite. Deterministic (fixed timestamps + index-based
// stats), so re-running yields the same board.
//
// Usage:
//   npm run build --workspace @domino-poker/server          # build dist (schema + passwords)
//   node scripts/seed-leaderboard-demo.mjs                   # -> ./data/seed-demo.sqlite (110 players + Demo/demopass123)
//   DATABASE_URL=./data/seed-demo.sqlite LEADERBOARD_REFRESH_MS=0 SERVER_PORT=4000 \
//     node apps/server/dist/index.js                         # serve the demo board on :4000
//
// The demo DB lives under ./data (gitignored); delete data/seed-demo.sqlite* to reset.
import { DatabaseSync } from "node:sqlite";

import { hashPassword } from "../apps/server/dist/auth/passwords.js";
import { buildMigrations } from "../apps/server/dist/storage/schema.js";

const DB_PATH = "./data/seed-demo.sqlite";
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`);
for (const migration of buildMigrations("sqlite")) {
  db.exec(migration.up);
}

const NAMES = [
  "Rihards", "Anna", "Jānis", "Elīna", "Mārtiņš", "Laura", "Kārlis", "Sofija",
  "Edgars", "Līga", "Toms", "Katrīna", "Roberts", "Madara", "Dāvis", "Alise",
  "SuperLongDominoChampion2026", "X", "GandrīzNeuzvaramaisSpēlētājs", "Mia"
];

const insUser = db.prepare(
  `INSERT INTO users (id, username, username_norm, email, email_norm, password_hash, avatar, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insStats = db.prepare(
  `INSERT INTO user_stats (user_id, games_played, wins, losses, updated_at) VALUES (?, ?, ?, ?, ?)`
);
const insPref = db.prepare(
  `INSERT INTO user_preferences (user_id, language, updated_at) VALUES (?, ?, ?)`
);

db.exec("BEGIN");
const COUNT = 110;
for (let i = 0; i < COUNT; i += 1) {
  const id = `seed-${String(i).padStart(3, "0")}`;
  const base = NAMES[i % NAMES.length];
  const username = i < NAMES.length ? base : `${base}_${i}`;
  const avatar = `avatar-${String((i % 38) + 1).padStart(2, "0")}`;
  const games = 10 + ((i * 7) % 40) + (i % 3 === 0 ? 60 : 0); // some 70..109 games (3-digit too)
  const rate = Math.max(0.02, Math.min(0.99, 0.96 - i * 0.008));
  const wins = Math.round(games * rate);
  const losses = games - wins;
  const lang = i % 3 === 0 ? "lv" : "en";
  insUser.run(id, username, username.toLowerCase(), null, null, "scrypt$16384$8$1$AA==$AA==", avatar, 1000, 1000);
  insStats.run(id, games, wins, losses, 1000);
  insPref.run(id, lang, 1000);
}
db.exec("COMMIT");

// A real login-able demo account placed OUTSIDE top 100 (low win rate) so you can
// log in and see the "your position" bottom panel. Username: Demo / Password: demopass123
const demoHash = await hashPassword("demopass123");
db.exec("BEGIN");
insUser.run("demo-account", "Demo", "demo", null, null, demoHash, "avatar-05", 1000, 1000);
insStats.run("demo-account", 20, 2, 18, 1000); // 10% win rate -> ranks below top 100
insPref.run("demo-account", "en", 1000);
db.exec("COMMIT");

const total = db.prepare("SELECT COUNT(*) AS c FROM user_stats").get();
console.log(`Seeded ${total.c} players into ${DB_PATH} (incl. login-able Demo / demopass123)`);
db.close();
