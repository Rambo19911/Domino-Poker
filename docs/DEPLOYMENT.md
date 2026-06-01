# Izvietošana uz VPS (Hostinger VPS-KVM 4)

> Sagatavošanās MVP izvietošanai. **Spēle vēl netiek publicēta** — šis ir prep darbs, lai
> serveri varētu palaist uz VPS un patestēt 4 spēlētāju reālu plūsmu.
> Aptver **Fāzi 12.1** (konfigurācija + build + serviss). Reverse proxy → Fāze 12.2,
> PostgreSQL → Fāze 12.3. Mērogošanas analīze → [SCALING.md](SCALING.md).

---

## Kas ir "systemd" (vienkāršiem vārdiem)

`systemd` ir **standarta Linux servisu pārvaldnieks** (gandrīz visās mūsdienu Linux, arī
Hostinger Ubuntu/Debian VPS). Tas atbild par programmu palaišanu un uzraudzību.

"**systemd serviss**" ir mazs konfigurācijas fails (`.service`), kas pasaka Linux:
- **kuru programmu palaist** (mūsu gadījumā `node apps/server/dist/index.js`),
- **automātiski to pārstartēt, ja tā nokrīt** (`Restart=on-failure`),
- **palaist to automātiski, kad VPS ieslēdzas** (`systemctl enable`),
- **savākt tās logus** (`journalctl`).

Bez tā tev būtu manuāli jāpalaiž serveris terminālī, un, ja tu aizvērtu SSH sesiju vai
serveris nokristu, spēle apstātos. Ar systemd serveris darbojas fonā kā īsts serviss.

**Alternatīva** ir **Docker** (programma + viss tās apkārtnes vidē iesaiņota "konteinerā").
Vienam Node serverim uz viena VPS **systemd ir vienkāršāks** un to iesaku; Docker ir
noderīgs, ja vēlāk gribi pārnesamību vai vairākus servisus. Abi piemēri ir zemāk.

---

## Priekšnosacījumi uz VPS

- **Node.js 22.5+** (mēs lietojam iebūvēto `node:sqlite`, kas prasa ≥ 22.5; ieteicams Node 24).
  Pārbaude: `node --version`.
- `git` (koda iegūšanai) vai augšupielādē kodu citā veidā.
- Lietotājs bez root tiesībām servisam (drošības labad), piem. `domino`.

---

## 1. Production build komandas

No repo saknes (uz VPS):

```bash
# 1) Atkarības (tieši tās, kas package-lock.json — reproducējami)
npm ci

# 2) Uzbūvē visas pakotnes (core → shared → server u.c. pareizā secībā)
npm run build

# 3) (pēc izvēles) palaid testus, lai pārliecinātos, ka viss zaļš
npm test
```

Servera ieejas punkts pēc build: `apps/server/dist/index.js`.

> Web klients (Next.js, `apps/web`) ir atsevišķs. Lai testētu 4 spēlētājus, tas arī
> jāpadara pieejams (piem. `npm run build --workspace apps/web` + `npm run start --workspace
> apps/web`, vai statiski). Serveris un klients tiks savienoti caur reverse proxy (Fāze 12.2):
> `/` → web, `/ws` → multiplayer serveris.

---

## 2. Konfigurācija (`.env`)

Nokopē paraugu un pielāgo:

```bash
cp .env.example .env
nano .env
```

Galvenie mainīgie (pilns saraksts + skaidrojumi: [`.env.example`](../.env.example)):

| Mainīgais | Nozīme | Produkcijā |
|---|---|---|
| `SERVER_PORT` | HTTP+WS ports | piem. `4000` |
| `SERVER_HOST` | Klausīšanās adrese | `127.0.0.1` aiz reverse proxy; `0.0.0.0` tiešai testēšanai |
| `DATABASE_URL` | SQLite ceļš | `./data/dev.sqlite` (vai PostgreSQL Fāzē 12.3) |
| `NODE_ENV` | Vide | `production` |

---

## 3a. Palaišana ar systemd (ieteicams)

Paraugs: [`deploy/domino-poker.service`](../deploy/domino-poker.service). Soļi (kā root):

```bash
# Pieņemam, ka kods ir /opt/domino-poker un būvēts (npm ci && npm run build)
sudo cp deploy/domino-poker.service /etc/systemd/system/domino-poker.service
# Pielāgo ceļus/lietotāju .service failā, ja vajag (nano /etc/systemd/system/domino-poker.service)

sudo systemctl daemon-reload          # pārlasa servisu definīcijas
sudo systemctl enable domino-poker    # palaist automātiski pie VPS ieslēgšanas
sudo systemctl start domino-poker     # palaist tagad

sudo systemctl status domino-poker    # vai darbojas?
journalctl -u domino-poker -f         # skatīt logus dzīvi (Ctrl+C lai iziet)
sudo systemctl restart domino-poker   # pārstartēt (pēc koda atjauninājuma)
sudo systemctl stop domino-poker      # apturēt
```

Servera graceful shutdown (SIGTERM/SIGINT) korekti aizver SQLite (WAL flush) — `systemctl
stop` to izmanto automātiski.

---

## 3b. Palaišana ar Docker (alternatīva)

Paraugs: [`deploy/Dockerfile`](../deploy/Dockerfile).

```bash
docker build -f deploy/Dockerfile -t domino-poker .
docker run -d --name domino-poker \
  -p 4000:4000 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  --restart unless-stopped \
  domino-poker
```

`-v .../data:/app/data` saglabā SQLite ārpus konteinera (dati pārdzīvo konteinera
atjaunināšanu). `--restart unless-stopped` ≈ systemd `Restart=on-failure`.

---

## 4. Reverse proxy (Fāze 12.2)

Reverse proxy ir publiskā "priekšpuse" (uz 80/443 ar TLS), kas vienu domēnu sadala uz
diviem iekšējiem servisiem:

```
                        ┌─ /ws  → 127.0.0.1:4000  (MP serveris, WebSocket)
Internets → 443 (TLS) ──┤
   (Nginx/Caddy)        └─ /     → 127.0.0.1:3000  (web klients, Next.js)
```

Ieguvumi: viens domēns + viens TLS sertifikāts; MP serveris un web nav pakļauti tieši
internetam (tāpēc **`SERVER_HOST=127.0.0.1`** kļūst par drošu produkcijas noklusējumu).

### Web klienta palaišana (lai būtu ko apkalpot uz `/`)

```bash
npm run build --workspace apps/web
npm run start --workspace apps/web   # Next.js uz 127.0.0.1:3000 (pielāgo ar -p / HOST)
```

### ⚠️ Kritiski: klienta WS URL aiz proxy

Klients pēc noklusējuma atvasina `ws://<host>:4000/ws` (tiešs ports). Aiz proxy uz 443 tas
ir nepareizi — proxy apkalpo `wss://<domēns>/ws` (tā pati izcelsme, bez porta). Tāpēc
**web BŪVES laikā** jāiestata env mainīgais:

```bash
# apps/web build vidē (piem. .env.production vai shell pirms `npm run build`):
NEXT_PUBLIC_MP_WS_URL=wss://tavs-domens.lv/ws
```

`NEXT_PUBLIC_` prefikss nozīmē, ka vērtība tiek iestrādāta klienta būvē (tāpēc jāiestata
PIRMS `npm run build`, ne tikai serverī).

### WebSocket upgrade

WS prasa, lai proxy pārsūta `Upgrade`/`Connection` galvenes (citādi savienojums neizveidojas):
- **Nginx**: paraugs [`deploy/nginx.conf.example`](../deploy/nginx.conf.example) (ar `map
  $http_upgrade` un `proxy_read_timeout 3600s` ilgajiem WS savienojumiem).
- **Caddy**: paraugs [`deploy/Caddyfile.example`](../deploy/Caddyfile.example) — Caddy upgrade
  un TLS apstrādā automātiski (vienkāršāk; iesaku, ja nav citu prasību).

### Porti — kopsavilkums

| Ports | Serviss | Publisks? |
|---|---|---|
| 443 / 80 | Reverse proxy (Nginx/Caddy) | **Jā** (vienīgais publiskais) |
| 4000 | MP serveris (HTTP /health,/metrics + WS /ws) | Nē — tikai `127.0.0.1` |
| 3000 | Web klients (Next.js) | Nē — tikai `127.0.0.1` |

`/metrics` ieteicams **neizpaust** publiski (sk. paraugos `allow/deny` vai respond 403).

---

## 5. Tālāk

- **Fāze 12.3** — SQLite → PostgreSQL stratēģija (tas pats `StoragePort` interfeiss).
- **Mērogs** — [SCALING.md](SCALING.md) (kad būs vajadzīgi tūkstoši lietotāju).
