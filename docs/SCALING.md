# Mērogošana — kur ir pudeles kakls un kā to risināt

> Šis dokuments apraksta, ko mēs **izmērījām** Fāzes 11 slodzes testos, **kur tieši** ir
> pudeles kakls pie liela spēlētāju skaita, **kas mums jau ir** ieviests, un **kāds ir
> ceļš** uz tūkstošiem vienlaicīgu lietotāju. Rakstīts vienkāršā valodā ar terminu
> skaidrojumiem. Horizontālā mērogošana (Redis u.c.) ir **apzināti atlikta uz pēc-MVP**
> (sk. plāns §24); šis ir ceļvedis, ne MVP uzdevums.

---

## TL;DR (īsi)

- Pie **1000 vienlaicīgu klientu** serveris **nenokrīt** un atmiņa ir ierobežota (~120 MB).
  Vienīgā problēma ir **latence** (ziņu kavēšanās), nevis avārija.
- Pudeles kakls **NAV** datubāze, **NAV** spēles, **NAV** atmiņa. Tas ir **globālā čata
  izsūtīšana visiem (broadcast) uz viena Node procesa "event-loop"**.
- Reālā čata slodze ir daudzkārt mazāka par stresa testu (kas bija ~kā DDOS); plus mums
  jau ir **rate-limits** (ātruma ierobežojums uz spēlētāju). Tāpēc MVP-am tas ir drošs.
- Lai ietu uz **tūkstošiem**, ceļš ir labi zināms: **Redis pub/sub** (kopīgs ziņu centrs
  starp vairākiem serveriem) un/vai **čats pa istabām** (ziņa iet 3 cilvēkiem, ne visiem).

---

## Termini vienkāršiem vārdiem

| Termins | Ko nozīmē |
|---|---|
| **event-loop** | Node serveris strādā uz *vienas konveijera lentes* — visi uzdevumi gaida rindā. Ja uz lentes ir liels uzdevums ("pateikt 1000 cilvēkiem"), pārējie gaida. |
| **broadcast / fanout** | Viena ziņa → tiek izsūtīta daudziem saņēmējiem (1 → N). |
| **O(N)** | Izmaksas aug proporcionāli lietotāju skaitam N. 1000 lietotāju → 1000 sūtījumi par katru ziņu. |
| **RTT (round-trip time)** | Cik ilgi iet ziņa turp-atpakaļ (klients → serveris → klients). Mazs = atsaucīgs. |
| **backpressure** | Aizsardzība, kas izlaiž sūtījumu lēnam klientam, lai servera atmiņa neaugtu bezgalīgi. |
| **horizontālā mērogošana** | Pievienot vairāk serveru datoru (nevis vienu lielāku). |
| **Redis pub/sub** | Kopīgs ziņu centrs: serveris A saņem čatu → pasaka centram → serveri B, C… dzird un pārsūta saviem lietotājiem. Tā sūtīšanas darbu sadala starp datoriem. |
| **sharding** | Slodzes sadalīšana neatkarīgos gabalos (piem. katra istaba/lietotāju grupa atsevišķi). |

---

## Ko mēs izmērījām (Fāze 11)

Slodzes tests (`npm run load:local`) ar virtuāliem klientiem pret īstu serveri:

| Klienti | Servera RSS | RTT (vidēji) | Dropped sockets | Rezultāts |
|---|---|---|---|---|
| 100 | ~86 MB | 11 ms | 0 | ✅ |
| 500 | ~100 MB | 63 ms | 0 | ✅ |
| 1000 | ~120 MB | ~3 s | 0 | ✅ izdzīvo, bet lēns |

**Izšķirošais eksperiments:** palaidām 1000 klientus **bez spēlēm** (`gameFraction=0`). RTT bija
**tāds pats (~3.3 s)**, un izsūtīto ziņu vēl vairāk (1.01 milj.). Ja vainīga būtu datubāze
vai spēles, bez-spēļu palaidiens būtu daudz ātrāks — bet nebija. Tas **pierāda**, ka
pudeles kakls ir izsūtīšana, ne DB un ne spēles.

---

## Kur tieši ir pudeles kakls

> **Globālā čata broadcast uz viena event-loop.**

Kad kāds nosūta čata ziņu, serveris dara divas lietas:

1. **Ieraksta DB** (1 raksts) — ātri, nav problēma.
2. **Izsūta visiem tiešsaistē** (N sūtījumi) — **šī ir lēnā daļa**.

Pie 1000 klientiem: ~1000 čata ziņu × 1000 saņēmēji ≈ **1 miljons sūtījumu ~14 sekundēs**,
visi serializēti uz **viena pavediena**. Ienākošie PING gaida aiz šīs sūtīšanas rindas →
daudzu sekunžu RTT. Tas ir **"head-of-line blocking"** (rindas-galvas bloķēšana), nevis CPU
izsīkums (CPU bija tikai ~36 %).

> **Analoģija:** problēma nav ierakstīt ziņu kladē (DB). Problēma ir, ka **viens
> paziņotājs** mēģina pateikt ziņu **1000 cilvēkiem pa vienam**. Vairāk rakstvežu (DB
> klasteru) nepalīdz — paziņotājs joprojām ir viens.

### Kas NAV pudeles kakls (un kāpēc DB sadalīšana nepalīdzētu)

- **Datubāze** — pierādīts ar eksperimentu (bez spēļu = mazāk DB rakstu = tas pats RTT).
  Čata DB sadalīšana pa klasteriem paātrinātu to, kas **nav** lēns.
- **Spēles** — 250 vienlaicīgas botu spēles neradīja papildu latenci.
- **Atmiņa** — ierobežota ~120 MB (backpressure aizsardzība).

---

## Kas mums JAU ir (esošās aizsardzības)

Šīs jau ir ieviestas un nodrošina, ka serveris ir drošs reālai slodzei:

1. **Token-bucket rate-limit** (uz spēlētāju): maks. ~5 ātras ziņas, tad ~1 ik 2 s.
   Aizsargā pret spamu/ļaunprātīgu plūdu (`LobbyChat`).
2. **LOBBY_STATE debounce** (200 ms): daudzas istabu izmaiņas → viens izsūtījums.
3. **Lēna-klienta backpressure**: izlaiž sūtījumu, ja klienta buferis > 1 MB → atmiņa
   nekad neaug bezgalīgi (novērsa OOM avāriju pie 1000).
4. **Broadcast pre-serializācija**: ziņu serializē **vienreiz**, ne N reizes (samazināja
   RTT ~2.8×).

Reāls fakts: pat zem mākslīgā stresa testa (kas pielīdzināms DDOS — neviens reāls lobby
nesūta tūkstošiem ziņu minūtē) serveris **nenokrita**.

---

## Mērogošanas ceļš (uz tūkstošiem un vairāk)

Industrijas standarta pieejas (sk. atsauces). Sakārtotas no lētākā uz dārgāko:

### 1. solis — viens process, mikro-optimizācijas (lēti)
- ✅ Pre-serializācija, debounce, backpressure (jau izdarīts).
- **SQLite raksti nost no event-loop**: pārvietot uz worker-pavedienu vai async draiveri.
  Mūsu `StoragePort` **jau ir async** — adapteri var nomainīt **bez izsaukuma vietu
  izmaiņām** (Fāzes 10 dizaina atmaksa). Palīdz visos mērogos.

### 2. solis — viens dators, vairāki kodoli (vidēji)
- **Node `cluster` / `worker_threads`**: vairāki procesi, katrs tur daļu savienojumu →
  ~N kodolu × caurlaidspēja.
- Vajag **backplane** (kopīgu kanālu), lai broadcast no procesa 1 sasniegtu savienojumus
  procesā 2 → **Redis pub/sub**.

### 3. solis — horizontāli, daudzi serveri (tūkstošiem+)
- Vairākas WebSocket vārtejas aiz **load balancer**.
- **Redis pub/sub** starp-instanču ziņu izplatīšanai.
- **Shard istabas pēc `roomId`**: visi 4 istabas spēlētāji nonāk vienā instancē → spēles
  trafiks 100 % lokāls (backplane nevajag). Tikai globālais lobby/čats iet caur Redis.
- Reāli skaitļi (no industrijas): Redis pub/sub tur ~**100K savienojumu** pāri dažiem
  serveriem; viens serveris ar OS regulēšanu (failu deskriptori, ~2–10 KB/savienojums) tur
  **500K+ dīkstāves** savienojumu. Ekstrēmam mērogam (piem. YouTube Live) kombinē
  **sharding pa istabām + pub/sub katrā shard**.
- Ja vajag čata vēsturi/atkārtošanu zem slodzes → **Redis Streams** (nevis vienkāršs
  pub/sub).

### Šai spēlei specifiski
- **Istabu skaits nav problēma**: istabas dzīvo tikai 1 h (TTL), tad tiek dzēstas. Saraksts
  paliek mazs.
- **Vienīgā O(N) lieta = globālais čats.** Divas dabiskas opcijas, lai to atrisinātu pa
  īstam:
  - **Čats pa istabām** (*pašlaik NAV ieviests* — tikai viens globālais čats). Ja to
    pievienotu, čata ziņa ietu tikai ~3 istabas biedriem (O(4)), ne visiem (O(N)). Tas
    noņemtu pudeles kaklu un saskan ar plānā atlikto "in-room čats".
  - **Redis pub/sub backplane** zem globālā čata + vairāki servera procesi (2./3. solis).

---

## MVP secinājums

- Viens VPS: **simti aktīvu lietotāju ir droši**; nostiprinājums novērš avārijas pat pie
  1000. Tas ir pietiekami MVP-am.
- Pāreja uz tūkstošiem ir **dokumentēta nākamā arhitektūra** (šis dokuments), ne MVP. Plāns
  to apzināti atliek (§24: "horizontāla mērogošana · Redis pub/sub").
- **Pirmais solis nākotnē**, ja vajadzēs: vai nu *čats pa istabām* (vienkāršāks, noņem
  O(N)), vai *Redis pub/sub + vairāki procesi* (vispārīgāks).

---

## Atsauces

- [Scaling Pub/Sub with WebSockets and Redis — Ably](https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis)
- [WebSockets at Scale: Architecture for Millions of Connections — WebSocket.org](https://websocket.org/guides/websockets-at-scale/)
- [Top 10 WebSocket Fan-Out Patterns for Millions of Rooms — Medium](https://medium.com/@bhagyarana80/top-10-websocket-fan-out-patterns-for-millions-of-rooms-6b0a9bd0f3ed)
- [Scaling WebSocket Connections: From Single Server to Distributed Architecture — DEV](https://dev.to/young_gao/scaling-websocket-connections-from-single-server-to-distributed-architecture-1men)
- [How to Handle WebSocket Scaling with Redis Pub/Sub — OneUptime](https://oneuptime.com/blog/post/2026-01-24-websocket-scaling-redis-pubsub/view)
