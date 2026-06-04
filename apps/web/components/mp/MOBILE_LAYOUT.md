# MP mobilais izkārtojums (pārlūkā) — realizācijas dokumentācija

Šis dokuments apraksta, **kā ir realizēts daudzspēlētāju (MP) spēles galda mobilais
(portrēta) izkārtojums pārlūkā**, lai, pielāgojot citus ekrānus, nebūtu jāmeklē pa visu repo.

Tas attiecas **tikai uz MP zonu** (`components/mp/`). Single-player galds (`DominoPokerGame`)
un desktop MP galds netiek skarti — mobilais ir **atsevišķs renderēšanas ceļš**.

---

## 1. Pamatideja

- **Desktop MP** izmanto fiksētu **1920×1080** skatuvi (`fixedStage`), kas tiek mērogota.
- **Mobilais (telefona portrēts)** ir **atsevišķs komponents** (`MpMobileTable`), kas
  pozicionē elementus **procentos no skatloga** un izmēriem lieto **`vw`** (atkarīgs no platuma).
- Pārslēgšanās notiek pēc media query telefona portrētā; desktop kods paliek neskarts.

Ģeometrijas (pozīciju/izmēru) avots ir lietotāja Photoshop zīmējums **1080×1920** telpā;
konkrētie skaitļi dzīvo `mobileLayout.ts` (sk. zemāk).

---

## 2. Failu karte — kur kas atrodas

| Fails | Loma |
| --- | --- |
| `apps/web/components/mp/MpGameTable.tsx` | Desktop MP galds **+** `useIsPhonePortrait()` hooks un nosacījums, kas telefona portrētā renderē `MpMobileTable`. |
| `apps/web/components/mp/MpMobileTable.tsx` | **Viss mobilais izkārtojums**: sēdvietas, nozīmītes (bid/won, punkti, kauliņu skaits, countdown), kopējo punktu tabula, galds + stiķis, roka, pamešanas poga, trumpja etiķete. |
| `apps/web/lib/mp/mobileLayout.ts` | **Ģeometrija**: elementu centra pozīcijas (% no skatuves) un izmēri (`vw`), + palīgi `centerPoint`/`centerBox`. **Vienīgais koordinātu avots.** |
| `apps/web/lib/mp/seatLabel.ts` | `seatLabel()` (vārds: displayId / "AI n" / atkāpšanās) un `formatTemplate()`. Kopīgs ar desktop. |
| `apps/web/app/globals.css` | `.mpm*` CSS klases (izskats, izmēri `vw`, kauliņu mērogošana). |
| `apps/web/components/DominoTileView.tsx` | Kauliņa vizuālais komponents (fiksēti 80×144 px); mobilais to mērogo ar `transform`. |

> Dizaina atskaite (px 1080×1920) ir `docs/mockups/mp-layout-spec.json`. **Tas ir lokāls
> (gitignored)** — koda patiesības avots ir `mobileLayout.ts`.

---

## 3. Kā tas aktivizējas

`MpGameTable.tsx`:

```ts
const PHONE_PORTRAIT_QUERY = "(orientation: portrait) and (max-width: 768px)";

function useIsPhonePortrait(): boolean {
  // matchMedia; sākotnēji false (SSR-drošs), atjauno useEffect → bez hidratācijas neatbilstības
}
```

Renderē (vienkāršoti):

```tsx
const isPhonePortrait = useIsPhonePortrait();
return (
  <main className="gameShell">
    {isPhonePortrait
      ? <MpMobileTable ...props />           // mobilais ceļš
      : <>{/* desktop fixedStage + safeControls */}</>}
    {/* kopīgi: ConnectionBanner + dialogi (Bid/Number/Exit/Rules/GameEnd) */}
  </main>
);
```

Dialogi un savienojuma josla ir **kopīgi** abiem ceļiem (renderēti vienreiz ārpus nosacījuma).
Dialogu mobilā mērogošana notiek `Dialog` komponentē (`modalScale` — atsevišķi no šī izkārtojuma).

---

## 4. Koordinātu sistēma (`mobileLayout.ts`)

Pozīcijas glabā kā **elementa CENTRU daļās (0..1)** no skatuves platuma/augstuma. Izmēri —
**`vw`** (daļa no platuma) ar malu attiecību.

```ts
export const MP_MOBILE_SIZE = {
  profileVw: 20.19, badgeVw: 9.35, tableVw: 44.72, tableAspect: 467/483,
  leaveVw: 10.19, leaveAspect: 58/110, summaryVw: 59.07,
};

export const MP_MOBILE_POS = {
  table, trumpLabel, summary, leave,          // { cx, cy } daļās 0..1
  trick: { N, S, W, E },                       // stiķa sloti
  hand: [ /* 7 × { cx, cy } */ ],              // rokas kauliņu pozīcijas (2 augšā + 5 apakšā)
  seats: { 0:..., 1:..., 2:..., 3:... },       // pēc VIZUĀLĀS vietas
};
```

Katrai sēdvietai: `{ profile, points, bidWon, countdown, tileCount }` (katrs `{cx,cy}`;
`tileCount` ir `null` skatītāja sēdvietai, jo viņš redz savus kauliņus).

Palīgi:

```ts
centerPoint(pt)            // → { left:cx%, top:cy%, transform: translate(-50%,-50%) }  (izmēru dod CSS)
centerBox(pt, vw, aspect)  // → tas pats + width:`${vw}vw`, height:`${vw*aspect}vw`
```

**Vizuālo vietu kartējums:** `0 = apakša (skatītājs)`, `1 = kreisā`, `2 = augša`, `3 = labā`.
Stiķa slots pēc tā, kurš spēlēja: `TRICK_SLOT_BY_VISUAL_SEAT = {0:"S",1:"W",2:"N",3:"E"}`.

---

## 5. Elementi un to dati

| Elements | Klase | Dati / loģika |
| --- | --- | --- |
| Profila aplis | `.mpmProfile` (`.active`/`.dealer`/`.disconnected`) | Tukšs aplis (nākotnē bilde). Izgaismojas aktīvajam (`activeSeatIndex`). |
| Bid/won "X/Y" | `.mpmBidWon` (`.matched`/`.over`) | X=`seat.bid` (vai "?"), Y=`seat.tricksWon`. Aplis neitrāls; cipari: **zaļi** ja `won==bid`, **sarkani** ja `won>bid`, citādi neitrāli. |
| Punkti | `.mpmPoints` | **Tekošā raunda** punkti: `calculateRoundScore({bid,tricksWon})` no `@domino-poker/core`; "–" ja vēl nav solījis. |
| Kauliņu skaits | `.mpmTileCount` | `seat.handCount` — tikai pretiniekiem (`tileCount !== null`). |
| Countdown | `.mpmCountdown` | `remainingSeconds`, kad `seat.isActive`. |
| Kopējo punktu tabula | `.mpmSummary`/`.mpmSummaryRow` | Vārds + `seat.totalScore` (kumulatīvi); aktīvais izcelts. Augšējā zonā. |
| Galds + stiķis | `.mpmTable`, `.mpmTile`/`.mpmTrickTile`, `.mpmDeclared` | Stiķa kauliņš parādās pie spēlētāja slota (N/S/W/E). |
| Roka | `.mpmHandTile` (`.valid`) | 7 kauliņi (2 augšā, 5 apakšā). Derīgie izgaismoti tavā gājienā (`validTileKeys`). |
| Trumpja/dūža etiķete | `.mpmTableTopLabel` (`.danger`/`.gold`) | Rāda pie galda augšmalas, kad lead ir trumpis/dūzis. |
| Pamešanas poga | `.mpmLeaveButton` | Augšā pa labi; izsauc `onLeave` (atver iziešanas dialogu). |

Kauliņu izmērs: `DominoTileView` ir fiksēts 80×144 px; CSS to mērogo ar `transform: scale(...)`
(`.mpmTile .dominoTile`, `.mpmTrickTile .dominoTile`), jo punkti (pips) ir pozicionēti px —
vienmērīga mērogošana saglabā ģeometriju.

---

## 6. Kā pievienot vai pielāgot elementu

1. **Pozīcija/izmērs** → `mobileLayout.ts` (`MP_MOBILE_POS` centrs % + `MP_MOBILE_SIZE` `vw`).
2. **Renderēšana** → `MpMobileTable.tsx`: izmanto `style={centerPoint(pos)}` vai
   `style={centerBox(pos, sizeVw, aspect)}`.
3. **Izskats** → `globals.css` `.mpm*` klase.
4. Sēdvietu dati nāk no `MpTableSeat` (`bid`, `tricksWon`, `totalScore`, `handCount`,
   `isActive`, `connectionState`, `displayId`, `visualSeat`, ...).

Tos pašus paņēmienus (`useIsPhonePortrait` + atsevišķs % / `vw` izkārtojums) var atkārtot
**citiem ekrāniem** (piem. lobby), neskarot desktop.

---

## 7. Zināmie ierobežojumi / nākotnes virziens

- **Pārklāšanās uz īsiem skatlogiem.** Pašreizējā pieeja pozicionē pa **augstuma %**, bet
  izmērus dod **`vw` (platums)**. Kad pārlūka josla saīsina augstumu (piem. ~9:16 vietā
  iebūvētā aplikācijā ~19.5:9), vienāda izmēra elementi tiek saspiesti vertikāli un var
  pārklāties. Aplikācijā (pilnekrānā) augstuma pietiek, tāpēc tur izskatās labi.
- **Kandidāts risinājumam:** fiksēta **1080×1920 dizaina skatuve, mērogota ar `contain`**
  (kā desktop 1920×1080) — viss (pozīcijas **un** izmēri) px šajā telpā, visa skatuve mērogota
  vienmērīgi. Tas izlīdzina pārlūku un aplikāciju (tikai tukšas malas garos ekrānos). Šo pieeju
  reiz mēģinājām, bet atjaunojām atpakaļ; ja to dara — **mēra** katra elementa robežas
  (`getBoundingClientRect`), jo `DominoTileView` ir `content-box` (faktiski ~100×164 px, ne 80×144).
