// DEV-ONLY: lokālai admin testēšanai BEZ e-pasta/Resend. Pēc `POST /admin/login` (kad serveris jau
// saglabājis OTP, ko nevar nolasīt no e-pasta), šis pārraksta lokālo SQLite OTP rindu ar ZINĀMU kodu,
// lai vari pabeigt `verify` soli. NEKAD nelietot pret prod DB (tā ir Postgres + reāls Resend).
//
// Lietošana (repo saknē, kad lokālais serveris darbojas ar SQLite):
//   node scripts/dev-admin-otp.mjs            -> kods 000000
//   node scripts/dev-admin-otp.mjs 135790     -> pielāgots kods
//   DOMINO_SQLITE=./data/dev.sqlite node scripts/dev-admin-otp.mjs

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

// Cietie sargi: NEKAD pret prod (SQLite-only; Postgres DATABASE_URL vai production = atteikums).
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL) {
  console.error("Atteikums: dev helperis ir TIKAI lokālai SQLite (NODE_ENV=production vai DATABASE_URL ir uzstādīts).");
  process.exit(1);
}

const DB_PATH = process.env.DOMINO_SQLITE ?? "./data/dev.sqlite";
const CODE = (process.argv[2] ?? "000000").trim();
const TTL_MS = 10 * 60 * 1000;

if (!/^\d{6}$/u.test(CODE)) {
  console.error("Kodam jābūt tieši 6 cipariem (piem. 000000).");
  process.exit(1);
}

const now = Date.now();
const codeHash = createHash("sha256").update(CODE).digest("hex");

const db = new DatabaseSync(DB_PATH);
try {
  db.prepare(
    `INSERT INTO admin_login_codes (id, code_hash, created_at, expires_at, attempts, consumed_at)
     VALUES ('admin', ?, ?, ?, 0, NULL)
     ON CONFLICT(id) DO UPDATE SET
       code_hash = excluded.code_hash, created_at = excluded.created_at,
       expires_at = excluded.expires_at, attempts = 0, consumed_at = NULL`
  ).run(codeHash, now, now + TTL_MS);
  console.log(`Local admin OTP set to "${CODE}" (valid 10 min) in ${DB_PATH}.`);
  console.log("Enter it in the admin verify step. (Run AFTER POST /admin/login.)");
} finally {
  db.close();
}
