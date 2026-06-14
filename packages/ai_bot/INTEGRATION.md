# Bota pieslēgšana spēlei — integrācijas ceļvedis

Šis dokuments apraksta, **kā tieši šis bots tika pieslēgts visām trim galda pozīcijām** lokālajā
"Domino Poker" spēlē, lai to varētu pārnest uz produkcijas web projektu. Bota paša arhitektūra ir
aprakstīta [README.md](./README.md); šis ir **pieslēgšanas** ceļvedis.

> TL;DR: uzraksti vienu plānu **tiltu**, kas tavu spēles stāvokli pārvērš par bota `PlayerView`
> un bota `Move` atpakaļ par tavu gājienu. Pārējais (meklēšana, noteikumi) jau ir botā.

---

## 1. Kāpēc vispār vajadzīgs tilts

Spēle un bots modelē **vienu un to pašu spēli, bet ar atšķirīgiem datu modeļiem**:

| | Spēle (`packages/core`) | Bots (`@domino-poker/engine`) |
|---|---|---|
| Kauliņš | `{ side1, side2 }` objekts | bitmaskas indekss `0..27` |
| Stāvoklis | `GameState` ar `players[]`, `currentTrick[]` | `PlayerView` ar `hand` bitmasku, `bids`, `taken`, `trick`, `history` |
| AI izsaukums | sinhrons | asinhrons, CPU-smags (ISMCTS) |

Bots "runā" tikai `PlayerView` valodā. Tāpēc vajag **adapteri/tiltu**, kas:
1. pārtulko tavu spēles stāvokli → `PlayerView`,
2. izsauc bota lēmumu (`chooseInclusionBid` / `IsmctsSearcher`),
3. pārtulko bota `Move` → tavu gājienu.

Tas ir vienīgais jaunais kods, kas tev jāuztur. Viss pārējais (noteikumi, izsecināšana, meklēšana)
ir bota pakotnēs un netiek dublēts.

---

## 2. Kuras bota pakotnes lietot

```
@domino-poker/engine   ← noteikumi, kauliņi, PlayerView tipi, mulberry32   (TĪRS, bez Node)
@domino-poker/ai       ← chooseInclusionBid (solīšana), IsmctsSearcher (gājieni)   (TĪRS, bez Node)
@domino-poker/bot-adapter   ← AiClient + Node worker_threads   (TIKAI servera/Node pusei)
```

**Pārlūka spēlei** (Next.js klients) `engine` + `ai` importē **tieši** — tās ir tīras ESM pakotnes
bez Node atkarībām. `bot-adapter` **apej**, jo tas lieto Node `worker_threads`.

Moduļu izšķiršana lokāli (`apps/web/tsconfig.json`) — path aliasi uz **nokompilēto `dist`**:

```jsonc
"paths": {
  "@domino-poker/engine": ["../../domino-poker-bot/packages/engine/dist/src/index.js"],
  "@domino-poker/ai":     ["../../domino-poker-bot/packages/ai/dist/src/index.js"]
}
```

Produkcijā tīrāk ir pievienot tās kā **workspace pakotnes** (pnpm/npm/yarn workspaces) un importēt
pēc nosaukuma `@domino-poker/ai`. Vienmēr importē pakotni (rāda uz `dist`), nevis kopē `src`.

---

## 3. PlayerView tilts (sirds)

Pilna implementācija: [`apps/web/lib/bot/botBridge.ts`](../apps/web/lib/bot/botBridge.ts).
Galvenās kartēšanas un to pamatojums:

### 3.1. Kauliņš
`tileIndex(side1, side2)` no `engine`. Roka → bitmaska: OR pa `tileBit(tileIndex(...))`.
Atpakaļ: `getTile(index)` → `{ side1: a, side2: b }`.

> **Verificēts:** abi dzinēji lieto **identisku** trumpju secību (0-0 stiprākais .. 1-0 vājākais)
> un dūžu kopu (6-6,5-5,4-4,3-3,2-2,0-6). Tāpēc indekss ↔ `{side1,side2}` ir bezzudumu.

### 3.2. PlayerView lauki

| `PlayerView` lauks | No spēles stāvokļa | Piezīme |
|---|---|---|
| `seat` | bota spēlētāja indekss | identitāte: `playerIndex == seat` |
| `hand` | `players[seat].hand` → bitmaska | |
| `bids[4]` | `players[i].bid` | spēles noklusējums `-1` = bota "vēl nav solījis" (sakrīt!) |
| `taken[4]` | `players[i].tricksWon` | |
| `firstSeat` | **`dealerIndex`** | sk. 3.3 |
| `trick` | rekonstruē no `currentTrick` | sk. 3.4 |
| `history` | rekonstruē no `completedTricks` + `currentTrick` | sk. 3.5 |

### 3.3. `firstSeat = dealerIndex` (svarīga nianse)

Bots saplūdina "pirmo solītāju" un "pirmā stiķa vedēju" vienā `firstSeat`. Galvenā spēle tos
**nodala**: solīšana sākas `dealer+1`, bet pirmo stiķi ved **dīleris**. Kartējam
`firstSeat = dealerIndex`, jo bota solīšanas modelis "pirmās rokas" priekšrocību (+0.45 stiķi)
piešķir tam, kurš **ved** — un ved dīleris. Gājienu meklēšanā `firstSeat` netiek lietots (bez
profiliem), tāpēc tas ietekmē tikai solīšanu.

### 3.4. Pašreizējais stiķis — rekonstruē caur dzinēju, nedublē!

```ts
let trick = createEmptyTrick(leader);          // leader = currentTrick[0].playerIndex, vai
state.currentTrick.forEach((play, i) =>        //          currentPlayerIndex ja tukšs
  trick = appendTrickMove(trick, play.playerIndex, toBotMove(play, i === 0)));
```

Tā visi atvasinātie lauki (`calledPip`, `leadIsTrump`, `maxTrumpRank`, `anyTrumpPlayed`) tiek
aprēķināti ar **bota paša noteikumiem**, nevis pārrakstīti tiltā.

### 3.5. Vēsture — precīzs `trickNo` / `posInTrick`

Bota izsecināšana grupē vēsturi pēc `event.trickNo` un `event.posInTrick` (NEVIS masīva secības),
tāpēc abi jāiestata precīzi. Pašreizējā (nepabeigtā) stiķa gājieni parādās **gan** `history`,
**gan** `trick` — tieši kā dzinēja paša reprezentācijā.

### 3.6. `calledPip` — viena autoritatīva funkcija (kritiski void izsecināšanai)

```ts
function leadCalledPip(tile, declaredNumber) {
  if (tileIsTrump(toTileIndex(tile))) return -1;   // trumpja vedums
  if (declaredNumber !== undefined) return declaredNumber;
  return tile.side1;                               // non-trump dūsis (5-5): vienīgais pips
}
// sekošanas gājieniem calledPip = -1 (to nosaka izsaucējs)
```

---

## 4. Lēmumu izsaukšana

```ts
// Solīšana (sinhrona — viens izsaukums):
const bid = chooseInclusionBid(view, mulberry32(seed), { samples: BID_SAMPLES }).bid;

// Gājiens (asinhrons — anytime ISMCTS):
const searcher = new IsmctsSearcher(mulberry32(seed), { rewardKind: "inclusion" });
searcher.sync(view);
// iterē līdz budžetam (iterāciju skaits, ne laiks → reproducējams spēks):
while (iterations < MOVE_ITERATIONS) { searcher.iterate(32); /* ... yield UI ... */ }
const move = searcher.bestMove();   // → { tile, calledPip }  → tavs gājiens
```

Pašreizējie parametri (eval): `BID_SAMPLES = 5000`, `MOVE_ITERATIONS = 50000`.

---

## 5. Pieslēgšana visām 3 sēdvietām (UI slānis)

Vienīgā vieta, kas mainījās spēlē: AI gājiena efekts
[`DominoPokerGame.tsx`](../apps/web/components/DominoPokerGame.tsx). Loģika (vienāda visām 3 botu
sēdvietām, jo `seat = currentPlayerIndex`):

1. Kad pienāk **jebkuras** AI sēdvietas kārta, pēc nelielas aiztures aprēķini lēmumu **asinhroni**.
2. Pielieto rezultātu caur `setGameState`, **aizsargājot** ar `turnKey` (fāze + raunds +
   currentPlayerIndex + pabeigto/pašreizējo stiķu garums) — tā stale rezultāts nekad netiek
   pielietots.
3. `cancelled` karodziņš effect cleanup atmet rezultātu, ja komponente/pozīcija mainās.
4. **Oriģinālais heiristiskais AI paliek kā fallback** uz jebkuru bota kļūdu un aiz
   `BOT_ENABLED` flag (`NEXT_PUBLIC_USE_BOT=0` to izslēdz).

> Tā kā lēmums atkarīgs tikai no `seat = currentPlayerIndex`, **tas pats kods apkalpo visas trīs
> botu sēdvietas** — nav atsevišķas loģikas katram galdam.

---

## 6. Produkcijas pāreja: inline → Web Worker

Lokāli meklēšana darbojas **inline** uz galvenā pavediena (vienkārši eval harnessam). Produkcijā
nepārmurkšķini UI — pārnes meklēšanu uz **Web Worker** (sk. bota [README §5.3](./README.md)):

- Tilts (`buildPlayerView`, kauliņu konversija) **paliek nemainīgs** — tas ir tīrs.
- Mainās tikai **transports**: tā vietā, lai izsauktu `IsmctsSearcher` inline, sūti `PlayerView`
  uz worker (tas pats `protocol.ts`) un saņem `Move` atpakaļ. Worker iekšā lieto to pašu
  `@domino-poker/ai`.
- Tur var ieslēgt arī **koka pārlietošanu + pondering + root-paralelizāciju** (vairāki worker) →
  spēcīgāks spēks pie tā paša laika nekā šis inline eval.

Tātad produkcijai būtu: **tilts (tas pats)** + **Web Worker transports** + (neobligāti) `AiClient`
stila worker pūls.

---

## 7. Kopsavilkuma kontrolsaraksts produkcijas projektam

1. Pievieno `@domino-poker/engine` + `@domino-poker/ai` kā workspace pakotnes (būvē `dist`).
2. Pārkopē/pielāgo `botBridge.ts` → pielāgo `buildPlayerView` savai `GameState` struktūrai.
   - Pārbaudi: trumpji/dūži/`bid=-1` noklusējums sakrīt; `firstSeat` = tava pirmā-stiķa-vedēja.
3. Pieslēdz async lēmumu savā AI kārtas vietā ar `turnKey`/`cancelled` aizsargiem un fallback.
4. Produkcijā pārnes meklēšanu uz Web Worker; tilts paliek tāds pats.
5. Validē kā šeit: rekonstruēto `PlayerView` salīdzini ar dzinēja `createPlayerView`, pārbaudi
   gājienu legālitāti, un palaid e2e ar nulle kļūdu.
