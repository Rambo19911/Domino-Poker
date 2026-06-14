# Domino Pokera MAX bots

Spēcīgs Domino pokera (4 spēlētāju, slēptas rokas) bots TypeScript pakotnēs, gatavs
pieslēgšanai esošai pārlūka/servera spēlei. Šī mape satur **tikai produkcijas kodu** —
bez testiem, turnīriem un kalibrācijas skriptiem.

Bots **neredz pretinieku rokas**. Visi lēmumi tiek pieņemti tikai no publiskās informācijas
(sava roka + publiskā solījumu/gājienu vēsture). Negodīgums ir izslēgts arhitektūras, nevis
disciplīnas līmenī.

---

## 1. Pārskats — ko bots dara

Spēle norit divās fāzēs, un bots pārvalda abas:

1. **Solīšana** — bots novērtē savu 7 kauliņu roku, ņem vērā, vai tam ir pirmā roka un ko
   jau pieteikuši pretinieki, un piesaka stiķu skaitu, **kuru tas reāli var paņemt**.
2. **Izspēle** — bots spēlē tā, lai **precīzi iekļautos** savā pieteikumā (`paņemtie == pieteiktie`),
   vienlaikus traucējot pretiniekiem iekļauties savējos.

Bota mērķis ir **iekļaušanās precizitāte**: pieteikt to, ko var paņemt, un to paņemt.

---

## 2. Arhitektūra

Trīs pakotnes ar stingru atkarību virzienu: `bot-adapter → ai → engine`.

```
packages/
  engine/        # Tīrs domēns: noteikumi, punkti, stāvoklis, nejaušība. Bez I/O, bez framework.
    src/
      tiles.ts       # 28 kauliņu kodēšana, trumpju/mastu/rangu uzmeklēšanas tabulas (bitu maskas)
      rules.ts       # legalMoves(), trickWinner(), stiķa stāvoklis
      scoring.ts     # score(bid, taken) — punktu formula
      state.ts       # GameState, PlayerView, applyBid/applyMove pārejas
      rng.ts         # mulberry32 seedojams PRNG + shuffle
      index.ts       # publiskais API
  ai/            # Bota intelekts. Importē tikai engine. Bez I/O, bez glabātuves.
    src/
      inference.ts   # ConstraintTracker: ko droši zinām par pretinieku rokām (I1-I6)
      dealer.ts      # determinizācija: izlozē iespējamās pretinieku rokas (+ Bayes svari)
      rollout.ts     # ātrā heiristiskā izspēles politika + rokas vērtējums (e)
      bidding.ts     # Monte Carlo solītāji (chooseBid / chooseInclusionBid)
      ismcts.ts      # ISMCTS max^n izspēles dzinējs + koka pārlietošana + pondering
      profiling.ts   # cilvēka profilēšana (bidBias u.c.) no pabeigtām partijām
      index.ts       # publiskais API
  bot-adapter/   # Pieslēgšanas slānis. Importē ai + engine. ŠEIT ir pieslēgšanas vietas spēlei.
    src/
      protocol.ts    # worker ziņojumu protokols (zod validēts)
      ai.worker.ts   # worker (Node worker_threads): hostē meklēšanu, anytime budžets, pondering
      AiClient.ts    # GALVENAIS API: worker pūls + postMessage<->Promise
      index.ts       # publiskais API
```

**Kāpēc tā:** `engine` un `ai` ir tīras, pārnesamas pakotnes (darbojas pārlūkā un Node bez
izmaiņām). `bot-adapter` ir vienīgā vieta ar vides atkarībām (worker pavedieni).

---

## 3. Uz kādiem aprēķiniem bots balstās

### 3.1. Solīšana (`ai/bidding.ts`)

Monte Carlo EV solītājs:

1. No `dealer` izlozē N iespējamās sadales (pretinieku rokas), kas atbilst visiem zināmajiem
   ierobežojumiem un jau dzirdētajiem solījumiem.
2. **Kopīgas sadales visiem kandidātiem** (common random numbers — maza dispersija).
3. Katram solījumam `b ∈ 0..7` izspēlē partijas un aprēķina `EV[b] = vidējais score(b, paņemtie)`.

Pieejami divi solītāji:
- `chooseBid` — izvēlas `argmax EV[b]` (maksimizē punktus).
- `chooseInclusionBid` — **noklusējuma produkcijas solītājs**: starp solījumiem, kuru EV ir
  statistiski neatšķirams no labākā, izvēlas **trāpāmāko** (maksimizē `paņemtie == b`). Tas
  apkalpo abus pieņemšanas kritērijus vienlaikus.

Rokas vērtējums `e` (`estimateExpectedTricks`) ir lineāra heiristika no trumpju skaita un rangiem,
dūžiem ar īsiem mastiem un pirmās rokas pozīcijas.

### 3.2. Izsecināšana (`ai/inference.ts`)

`ConstraintTracker` no publiskās vēstures izsecina, ko **droši** zinām par katru pretinieku
(6 likumi I1-I6), piemēram: ja pieprasīts masts un spēlētājs nelika masta kauliņu → tas ir "void"
uz šo mastu. Partijas otrajā pusē maskas tipiski ir tik šauras, ka pretinieku rokas ir gandrīz
viennozīmīgas.

### 3.3. Determinizācija (`ai/dealer.ts`)

`sampleDeal` izlozē pilnas pretinieku rokas, kas apmierina **visus** ierobežojumus
(constraint-directed dealing ar backtrack). `sampleWeightedDeal` (4.2B) ģenerē K kandidātus un
izvēlas vienu **proporcionāli Bayes ticamībai** — cik ticami katrs pretinieks ar šo roku būtu
pieteicis tieši to, ko pieteica (`bidProbability` no `profiling.ts`).

### 3.4. Izspēle — ISMCTS max^n (`ai/ismcts.ts`)

Informācijas-kopu Monte Carlo koka meklēšana. Viena iterācija:

1. **Determinizācija** — izlozē vienu konkrētu pretinieku roku sadalījumu.
2. **Selection** — no saknes lejup, UCB izvēle katram gājējam pēc **viņa paša** komponentes
   (max^n): `argmax( reward[c][gājējs]/visits[c] + C·sqrt(ln(avail[c])/visits[c]) )`, `C = 0.7`.
3. **Expansion + Rollout** — izspēlē līdz galam ar ātro heiristisko politiku (`rollout.ts`).
4. **Backprop** — gala rezultātu pārvērš atlīdzībā un izplata pa ceļu.

**Atlīdzība ir konfigurējama (`rewardKind`):**
- `"inclusion"` (noklusējums produkcijā) — atalgo `paņemtie == pieteiktie` (projekta mērķis).
- `"points"` — relatīvie punkti `score_i - vidējais(citi)`, normalizēti uz [0,1] (L6).

**Papildinājumi:** koka pārlietošana (statistika saglabājas starp reāliem gājieniem),
**pondering** (meklē, kamēr gaida pretinieku gājienu), un **root-paralelizācija** (katrs worker
būvē savu koku; galvenais pavediens saskaita gājienu apmeklējumus un izvēlas apmeklētāko).

### 3.5. Profilēšana (`ai/profiling.ts`)

Pēc katras partijas visas rokas ir publiski rekonstruējamas → `computeProfile` aprēķina pretinieka
tendences (solījuma novirze `bidBias`, izkliede, dūžu vešana u.c.) bez krāpšanās. Profils uzlabo
determinizācijas Bayes svarus pret konkrētu cilvēku.

### 3.6. Veiktspēja

ISMCTS sasniedz ~90 000–115 000 iterāciju/sekundē uz pavediena (zero-clone karstais ceļš).
Meklēšana ir **anytime**: `requestMove(budgetMs)` vienmēr atgriež līdz šim labāko budžeta laikā.

---

## 4. Sniegums (izmērīts uz 10 000 duplicate partijām)

| Kritērijs | Rezultāts |
|---|---|
| Solīšanas precizitāte (pret tās-pašas-info EV etalonu) | **~97%** |
| Iekļaušanās precizitāte (`paņemtie == pieteiktie`) | **~79%** (konservatīvs budžets) |
| Teorētiskie iekļaušanās griesti (perfekta informācija) | **~87%** |

Bots optimizē iekļaušanos (solī to, ko var paņemt, un to paņem). Iekļaušanās palielinās ar
meklēšanas budžetu un tuvojas teorētiskajiem griestiem; pēdējos procentus ierobežo slēptās
informācijas vērtība (to nevar pilnībā atgūt bez pretinieku roku redzēšanas).

---

## 5. Pieslēgšana reālai spēlei — PIESLĒGŠANAS VIETAS

Vienīgā saskarne ir **`@domino-poker/bot-adapter`** → klase `AiClient`. Ārējā spēle nekad
neimportē `ai` vai `engine` iekšējos meklēšanas detaļas; tā dod botam tikai `PlayerView`.

### 5.1. Publiskais API (`AiClient`)

```ts
import { AiClient } from "@domino-poker/bot-adapter";
import type { PlayerView, Move } from "@domino-poker/engine";

const client = new AiClient({
  workers: 7,                 // worker pavedienu skaits (noklusējums: hardwareConcurrency - 1)
  seed: 12345,                // seedojama nejaušība (reproducējamība)
  config: {
    objective: "inclusion",   // "inclusion" (noklusējums) vai "points"
    bidSamples: 5000,         // Monte Carlo sadales solīšanai
    explorationC: 0.7,        // UCB konstante (nemainīt bez kalibrācijas)
    evTolerance: 12           // cik EV-tuvu solījumi skaitās "neatšķirami" (inclusion solītājam)
  }
});

await client.whenReady();

// Pēc KATRA reāla notikuma (sava vai pretinieka gājiena/solījuma) padod jaunu skatu:
client.sync(playerView);

// Kad jāsola:
const bid: number = await client.requestBid(2000);   // budžets ms

// Kad jāiet (citā stiķa brīdī):
client.sync(playerView);
const { move } = await client.requestMove(2000);     // { move: { tile, calledPip } }

// Kamēr gaida pretiniekus (neobligāti, bezmaksas papildu meklēšana):
client.ponderOn();   // ... pretinieki iet ...   client.ponderOff();

// Partijas/sesijas beigās:
await client.dispose();
```

### 5.2. Datu līgums — `PlayerView` (no `@domino-poker/engine`)

Ārējai spēlei katram bota lēmumam jāsagatavo `PlayerView`:

```ts
type PlayerView = {
  seat: 0 | 1 | 2 | 3;        // bota sēdvieta
  hand: number;               // bota roka kā bitu maska (sk. engine/tiles.ts kodēšanu)
  bids:  [number, number, number, number];   // -1 = vēl nav solījis
  taken: [number, number, number, number];   // paņemtie stiķi
  firstSeat: 0 | 1 | 2 | 3;   // pirmā roka
  trick: TrickState;          // pašreizējais stiķis
  history: PlayEvent[];       // pilna publiskā gājienu vēsture
};
```

`engine` eksportē visus tipus un palīgfunkcijas (`createGameState`, `applyBid`, `applyMove`,
`createPlayerView`, `legalMoves`, `trickWinner`, `score`, `tileIndex`/`tileMask` kauliņu kodēšanai).
Ja ārējai spēlei vajag autoritatīvus noteikumu jautājumus (kuri gājieni legāli, kurš uzvarēja
stiķi), tos var ņemt no `engine` — viens patiesības avots.

### 5.3. Node vs pārlūks (svarīgi)

- `AiClient` un `ai.worker.ts` šajā implementācijā lieto **Node `worker_threads`** (`AiClient`
  ielādē kompilēto `dist/src/ai.worker.js`). Tas der servera pusei vai Node host spēlei.
- **Pārlūka spēlei** (piem. Next.js klients) worker jāveido kā **Web Worker**, izmantojot
  **to pašu `protocol.ts`** ziņojumu protokolu. `engine` un `ai` jau ir pārnesami (bez Node
  atkarībām); jāpārraksta tikai worker transports `AiClient`/`ai.worker` (apmainīt
  `worker_threads` pret `new Worker(new URL('./ai.worker.ts', import.meta.url))`). Protokols,
  meklēšana un noteikumi paliek nemainīgi.

### 5.4. Tipiskā integrācijas secība

1. Spēles sākumā: `new AiClient(...)`, `await whenReady()`.
2. Solīšanas fāzē, kad pienāk bota kārta: `sync(view)` → `requestBid(budget)` → padod solījumu spēlei.
3. Izspēlē, kad pienāk bota kārta: `sync(view)` → `requestMove(budget)` → padod gājienu spēlei.
4. Pēc katra pretinieka notikuma: `sync(view)` (neobligāti `ponderOn/Off` starp tiem).
5. Beigās: `dispose()`.

---

## 6. Būvēšana un lietošana

Priekšnoteikumi: Node.js 18+ un `pnpm`.

```bash
pnpm install        # instalē atkarības (typescript, @types/node, zod) un saista pakotnes
pnpm build          # kompilē visas trīs pakotnes uz dist/
```

Pēc tam ārējā spēle importē `@domino-poker/bot-adapter` (vai pārlūkam — sk. 5.3.).

---

## 7. Konfigurācija (`BotConfig`)

| Lauks | Noklusējums | Nozīme |
|---|---|---|
| `objective` | `"inclusion"` | `"inclusion"` = solī un spēlē, lai trāpītu; `"points"` = maksimizē punktus |
| `bidSamples` | 256 (worker) | Monte Carlo sadales solīšanai (reālā spēlē iesakām ~5000) |
| `explorationC` | 0.7 | UCB izpētes konstante; mainīt tikai ar turnīra kalibrāciju |
| `evTolerance` | 8 | (tikai inclusion solītājam) EV-pielaide "neatšķiramiem" solījumiem |

Gājiena/solījuma budžetu nosaka izsaukuma `budgetMs` (anytime). Worker pavedienu skaitu —
`AiClient({ workers })`.

---

## 8. Ierobežojumi un piezīmes

- Bots ir **vienīgi maksimālas grūtības**; nav viegluma līmeņu.
- Visa nejaušība iet caur seedojamu PRNG (`mulberry32`); `Math.random()` netiek lietots →
  reproducējami rezultāti pie fiksēta `seed`.
- Profilēšana (`computeProfile`) ir tīra funkcija; profilu **glabāšana** (piem. starp sesijām)
  ir ārējās spēles atbildība — padod profilu objektu botam, tas nelasa glabātuvi pats.
- Slēptās informācijas dēļ pat ideāla izspēle nevar vienmēr precīzi trāpīt solījumam; teorētiskie
  iekļaušanās griesti šai spēlei ir ~87% (ne 100%).
```
