# Backup un restore procedūra

Domino Poker multiplayer servera persistence ir vienā datubāzē (sk. `DATABASE_URL`):
produkcijā **PostgreSQL**, lokāli **SQLite**. Spēles stāvoklis ir pilnībā
atjaunojams no `seed` + append-only event loga, tāpēc datubāzes backup pasargā
partiju vēsturi, spēlētāju statistiku, čatu un reconnect sesijas.

> Migrācijas ir idempotentas: pēc jebkura restore palaid `npm run migrate
> --workspace apps/server` — ja shēma jau aktuāla, tas neko nemaina.

---

## PostgreSQL (produkcija)

### Backup (loģisks dump)

```bash
# Pilns dump (saspiests, custom formāts — ieteicams):
pg_dump "$DATABASE_URL" --format=custom --file="domino-$(date +%F).dump"

# Vai vienkāršs SQL (cilvēkam lasāms):
pg_dump "$DATABASE_URL" --format=plain --file="domino-$(date +%F).sql"
```

### Automātisks ikdienas backup (cron)

> Cron NEatbalsta `\` rindu turpinājumus (katra rinda = atsevišķs ieraksts), `%`
> ir īpaša rakstzīme, un vide ir minimāla (`$DATABASE_URL` nav iestatīts). Tāpēc
> komandu liek **wrapper skriptā**, kas ielādē secrets, un cron ieraksts ir **viena rinda**.

Wrapper `/usr/local/bin/domino-backup.sh` (`chmod 750`):

```bash
#!/usr/bin/env bash
set -euo pipefail
# backup.env satur DATABASE_URL (chmod 600, glabā droši — necommit).
source /etc/domino/backup.env
dest="/var/backups/domino/domino-$(date +%F).dump"
pg_dump "$DATABASE_URL" --format=custom --file="$dest"
find /var/backups/domino -name 'domino-*.dump' -mtime +14 -delete
```

Cron ieraksts `/etc/cron.d/domino-backup` (viena rinda, katru dienu 03:15):

```cron
15 3 * * *  domino  /usr/local/bin/domino-backup.sh >> /var/log/domino-backup.log 2>&1
```

Backup failus glabā **ārpus** servera diska (piem. cita VPS, S3, vai atsevišķs
volume), lai diska/instances zudums neiznīcina arī kopijas.

### Restore

```bash
# Tukšā/jaunā datubāzē (custom formāts):
pg_restore --clean --if-exists --dbname="$DATABASE_URL" domino-2026-06-06.dump

# Plain SQL gadījumā:
psql "$DATABASE_URL" --file=domino-2026-06-06.sql

# Pēc restore — pārliecinies, ka shēma aktuāla (idempotents):
npm run migrate --workspace apps/server
```

### Pārbaude (ieteicams periodiski)

Restore uz **atsevišķu** testa datubāzi un palaid integrācijas testus pret to,
lai backup tiešām ir lietojams:

```bash
TEST_POSTGRES_DATABASE_URL="postgres://.../domino_restore_test" \
  npm run test:postgres --workspace apps/server
```

---

## SQLite (lokāli / mazs deploy)

SQLite ir WAL režīmā, tāpēc nedrīkst vienkārši kopēt tikai `.sqlite` failu, kamēr
serveris raksta. Drošas iespējas:

```bash
# A) Serveris izslēgts: nokopē visus trīs failus.
cp data/dev.sqlite      backup/dev.sqlite
cp data/dev.sqlite-wal  backup/ 2>/dev/null || true
cp data/dev.sqlite-shm  backup/ 2>/dev/null || true

# B) Serveris darbojas: konsekvents snapshot caur sqlite3.
sqlite3 data/dev.sqlite ".backup 'backup/dev-$(date +%F).sqlite'"
```

Restore: aptur serveri, atjauno failu uz `DATABASE_URL` ceļa, palaid serveri.

---

## Secrets

`DATABASE_URL` un citi `.env` noslēpumi **netiek** glabāti datubāzē — backup tos
neietver. Glabā `.env` atsevišķi un droši (sk. `.env.example`); nekad necommit.
