# Bota pieslēgšana (eval harness)

Šis modulis pieslēdz atsevišķi apmācīto botu (`domino-poker-bot`) trijām CPU sēdvietām, lai
**novērtētu tā spēles spēku** lokāli, pirms to laist produkcijā citā web projektā.

## Kā tas strādā

- `botBridge.ts` importē bota **tīrās** pakotnes `@domino-poker/ai` + `@domino-poker/engine`
  (bez Node atkarībām) tieši pārlūka pakojumā un **apiet** `bot-adapter` (kas izmanto Node
  `worker_threads` un pārlūkā nedarbojas). Moduļu izšķiršana — `apps/web/tsconfig.json` `paths`
  norāda uz bota jau nokompilēto `dist/`.
- `buildPlayerView()` pārveido galvenās spēles stāvokli (`{side1,side2}` kauliņi) bota `PlayerView`
  (bitmaskas). Rekonstrukcija validēta: 1760 skati sakrīt baitu-precīzi ar bota paša
  `createPlayerView`.
- `DominoPokerGame.tsx` AI efekts izsauc botu **asinhroni** (`decideBid`/`decideMove`), saglabājot
  oriģinālo heiristisko AI kā **fallback** un aiz feature flag.

## Ieslēgšana / izslēgšana

Bots ir ieslēgts pēc noklusējuma. Lai atgrieztos uz oriģinālo AI (salīdzināšanai):

```
NEXT_PUBLIC_USE_BOT=0 npm run dev
```

## Regulējamie parametri (`botBridge.ts`)

| Konstante | Noklusējums | Nozīme |
|---|---|---|
| `BID_SAMPLES` | 5000 | Monte Carlo sadales solījumam (~5000 = pilns spēks) |
| `MOVE_ITERATIONS` | 50000 | ISMCTS iterācijas uz gājienu (fiksēts budžets → reproducējams spēks) |
| `MOVE_MAX_MS` | 4000 | Drošības griesti |

## Svarīgi novērtējuma brīdinājumi

Šis harness mēra botu **konservatīvā, reproducējamā konfigurācijā**, kas ir **apakšējā robeža**
salīdzinājumā ar produkcijas potenciālu:

1. **Fiksēts iterāciju budžets, viens pavediens, bez koka pārlietošanas.** Katrs gājiens sākas no
   tukša koka (jauns `IsmctsSearcher` katram gājienam). Produkcijā (`AiClient`) ir koka
   pārlietošana, pondering un root-paralelizācija pa vairākiem worker pavedieniem — tas dod
   **spēcīgāku** spēli pie tā paša laika. Tāpēc šeit redzamais spēks ir minimums, ne maksimums.
2. **Lēnās ierīcēs** `MOVE_MAX_MS` griesti var nogriezt iterācijas zem 20000 → bots nedaudz vājāks.
   Spēks ir "fiksētu-iterāciju spēks", ne "laika-budžeta spēks".
3. **`firstSeat = dealerIndex`** — kartēts uz pirmā stiķa vedēju (dīleri), jo bota modelis "pirmās
   rokas" priekšrocību (+0.45 stiķi) piešķir tam, kurš ved. Tas balstās uz dzinēja semantiku
   (validēts pret `createPlayerView`), ne UI semantiku. Solīšanas modelis bota iekšienē saplūdina
   "pirmo solītāju" un "pirmo vedēju"; galvenā spēle tos nodala (solīšana sākas `dealer+1`).

## Pāreja uz produkciju

Citā web projektā produkcijas ceļš ir Web Worker (sk. bota README §5.3): tas pats `protocol.ts`,
tikai `worker_threads` → `new Worker(new URL('./ai.worker.ts', import.meta.url))`. Tilta loģika
(`buildPlayerView`) paliek tā pati; mainās tikai transports un budžets (laika vietā iterācijas).
