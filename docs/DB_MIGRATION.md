# DB migrācijas stratēģija — SQLite → PostgreSQL (Fāze 12.3)

> **Stratēģija**, ne ieviešana. SQLite **paliek lokālajai videi**; VPS vidē var pieslēgt
> PostgreSQL caur **to pašu `StoragePort` interfeisu**, nemainot nevienu spēles loģikas
> izsaukuma vietu. Šis dokuments apraksta, kā to izdarīt, kad tas būs vajadzīgs.

---

## Kāpēc tas ir viegli (galvenais princips)

Fāzē 10.1 [`StoragePort`](../apps/server/src/storage/StoragePort.ts) tika veidots **async**
(visas metodes atgriež `Promise`), tieši paredzot PostgreSQL (kas ir asinhrons draiveris).
Tāpēc:

- `RoomManager`, `MatchPersistence`, `LobbyChat`, `index.ts` zina **tikai par interfeisu**,
  ne par konkrēto datubāzi.
- PostgreSQL adapteris (`PostgresStorage`) izpilda to pašu līgumu → **nulle izmaiņu**
  izsaukuma vietās.
- Vienīgais, kas jāpievieno: jauns adapteris + faktūra, kas izvēlas pēc `DATABASE_URL`.

```
            ┌── SqliteStorage  (file: / :memory:)   ← lokāli
StoragePort ┤
            └── PostgresStorage (postgres://...)     ← VPS
```

---

## Ieviešanas soļi (kad vajadzēs)

1. **Pievieno atkarību:** `npm i pg` + `npm i -D @types/pg` (`apps/server`).
2. **Izveido `apps/server/src/storage/PostgresStorage.ts`** — implementē `StoragePort` ar
   `pg` (skice zemāk).
3. **Faktūra pēc shēmas** — `openSqliteStorage` vietā vispārīgs `openStorage(databaseUrl)`:
   ```ts
   export function openStorage(databaseUrl: string): StoragePort {
     if (/^postgres(ql)?:\/\//iu.test(databaseUrl)) {
       return new PostgresStorage({ connectionString: databaseUrl });
     }
     return new SqliteStorage({ filename: databaseUrl });
   }
   ```
4. **Atslēdz `postgres://` noraidīšanu** [`config.ts`](../apps/server/src/config.ts)
   `readDatabaseUrl` (tagad tas apzināti met kļūdu, kamēr adaptera nav — tas ir drošības
   vārsts, lai nejauši nepalaistu bez Postgres atbalsta).
5. **`index.ts`** — `openSqliteStorage(...)` → `openStorage(config.databaseUrl)`.
6. **`.env` uz VPS:** `DATABASE_URL=postgres://lietotajs:parole@localhost:5432/domino`.

Spēles loģika, testi un determinisms **netiek skarti** (DB ir tikai blakusefekts;
maisīšana/izdale atkarīga no `seed`, ne no glabātuves).

---

## PostgreSQL shēma (DDL)

Tieša SqliteStorage shēmas pārtulkošana. Galvenās atšķirības atzīmētas komentāros.

```sql
CREATE TABLE IF NOT EXISTS matches (
  match_id         TEXT PRIMARY KEY,
  seed             TEXT NOT NULL,
  number_of_rounds INTEGER NOT NULL,
  players_json     JSONB NOT NULL,        -- SQLite TEXT → PG JSONB (vaicājami, validēti)
  started_at       BIGINT NOT NULL,       -- ms laikspiedogi → BIGINT (drošāk par INTEGER)
  finished_at      BIGINT,
  winner_player_id TEXT
);

CREATE TABLE IF NOT EXISTS match_events (
  match_id   TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  event_json JSONB NOT NULL,
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_id    TEXT PRIMARY KEY,
  games_played INTEGER NOT NULL,
  games_won    INTEGER NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                TEXT PRIMARY KEY,
  seq               BIGSERIAL,            -- aizvieto SQLite `rowid` čata kārtošanai
  author_display_id TEXT NOT NULL,
  text              TEXT NOT NULL,
  server_now        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches (started_at);
CREATE INDEX IF NOT EXISTS idx_chat_seq ON chat_messages (seq);
```

### SQLite → PostgreSQL atbilstības

| SQLite | PostgreSQL | Piezīme |
|---|---|---|
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` | idempotence (match start, event log, čats) |
| `ON CONFLICT(col) DO UPDATE` | tas pats sintaksē | upsert (player_stats) der abos |
| `rowid` (implicītais) | `BIGSERIAL seq` kolonna | čata hronoloģiskā kārtošana |
| `TEXT` (JSON) | `JSONB` | PG var validēt/vaicāt JSON |
| `INTEGER` (ms) | `BIGINT` | izvairās no 32-bitu pārpildes |
| `?` parametri | `$1, $2, ...` | `pg` pozicionālie parametri |

---

## `PostgresStorage` adaptera skice

Tikai ilustrācija (NAV kompilēts fails — lai nepievienotu neizmantotu `pg` atkarību un
netestētu kodu būvē). Pārējās metodes spoguļo `SqliteStorage`, tikai ar `await` + `$n`.

```ts
import { Pool } from "pg";
import type { StoragePort, MatchStartedRecord /* ... */ } from "./StoragePort.js";

export class PostgresStorage implements StoragePort {
  private readonly pool: Pool;

  constructor(options: { connectionString: string }) {
    this.pool = new Pool({ connectionString: options.connectionString });
    // migrate() palaiž augstāk doto DDL (vai labāk — atsevišķa migrāciju rīka, piem. node-pg-migrate).
  }

  async saveMatchStarted(m: MatchStartedRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO matches (match_id, seed, number_of_rounds, players_json, started_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id) DO NOTHING`,
      [m.matchId, m.seed, m.numberOfRounds, JSON.stringify(m.players), m.startedAt]
    );
  }

  async savePlayerStats(s /* PlayerStatsRecord */): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_stats (player_id, games_played, games_won, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id) DO UPDATE SET
         games_played = EXCLUDED.games_played,
         games_won    = EXCLUDED.games_won,
         updated_at   = EXCLUDED.updated_at`,
      [s.playerId, s.gamesPlayed, s.gamesWon, s.updatedAt]
    );
  }

  async loadRecentChatMessages(limit: number): Promise<readonly ChatMessage[]> {
    const { rows } = await this.pool.query(
      `SELECT id, author_display_id, text, server_now
         FROM chat_messages ORDER BY seq DESC LIMIT $1`,
      [clampLimit(limit)]
    );
    return rows.map(rowToChat).reverse(); // jaunākās N → hronoloģiski
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // appendMatchEvent / saveMatchFinished / loadUnfinishedMatch / listRecentMatches /
  // getPlayerStats / appendChatMessage — analogi SqliteStorage, ar $n un ON CONFLICT.
}
```

---

## Datu migrācija (esošie SQLite dati → PostgreSQL)

MVP datu nav daudz un tie **nav kritiski** (dev partijas + lobby čats). Divas iespējas:

1. **Tīrs sākums (ieteicams MVP-am):** uz VPS izveido tukšu PostgreSQL DB; SQLite dati
   paliek lokāli. Vienkāršākais — nekas nav jāpārnes.
2. **Vienreizēja pārnese (ja vajag):** mazs skripts, kas lasa caur `SqliteStorage`
   (`listRecentMatches`, `loadRecentChatMessages`, `getPlayerStats`) un raksta caur
   `PostgresStorage`. Tā kā abi izpilda `StoragePort`, pārnese ir trīs cilpas. (Notikumu
   žurnālu var arī izlaist — `seed` pietiek partijas atkārtošanai.)

---

## Kopsavilkums (Fāzes 12.3 akcepts)

- ✅ SQLite **lokāli**, PostgreSQL **VPS** — **viens interfeiss** (`StoragePort`).
- ✅ Pāreja nemaina spēles loģiku, testus vai determinismu.
- ✅ Stratēģija dokumentēta; pilna `PostgresStorage` ieviešana ir skaidrs, izolēts solis,
  kad VPS slodze to prasīs (lokālajai testēšanai SQLite ir pietiekams).
