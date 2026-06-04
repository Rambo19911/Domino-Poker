# MP mobilais izkārtojums (pārlūkā) — realizācijas dokumentācija

Šis dokuments apraksta, **kā ir realizēts daudzspēlētāju (MP) spēles galda mobilais
(portrēta) izkārtojums pārlūkā**, lai, pielāgojot citus ekrānus, nebūtu jāmeklē pa visu repo.

Tas attiecas **tikai uz MP zonu** (`components/mp/`). Single-player galds (`DominoPokerGame`)
un desktop MP galds netiek skarti — mobilais ir **atsevišķs renderēšanas ceļš**.

---

## 1. Pamatideja

- **Desktop MP** izmanto fiksētu **1920×1080** skatuvi (`fixedStage`), kas tiek mērogota.
- **Mobilais (telefona portrēts)** ir **atsevišķs komponents** (`MpMobileTable`), kas izmanto
  **to pašu paņēmienu**: fiksētu **1080×2340** dizaina skatuvi, mērogotu vienmērīgi ar
  `transform: scale` (`contain`). Viss — pozīcijas UN izmēri — dzīvo vienā px telpā.
- Pārslēgšanās notiek pēc media query telefona portrētā; desktop kods paliek neskarts.

> **Kāpēc tā (vēsture):** sākotnēji mobilais pozicionēja **% no skatloga**, bet izmērus lika
> **`vw` (platums)**. Pozīcijas sekoja abām asīm, bet izmēri tikai vienai → izkārtojums bija
> pareizs **tikai pie 9:16**. iPhone Safari ar adreses joslu padara redzamo zonu zemāku par
> 9:16 → elementi pārklājās. Fiksēta mērogota skatuve to novērš **pēc konstrukcijas**: visa
> kompozīcija mērogojas kā viens bloks, tāpēc nekas nepārklājas nevienā malu attiecībā (uz
> citas attiecības paliek tikai tukšas malas — letterbox).

Ģeometrijas avots ir lietotāja Photoshop zīmējums **1080×2340** telpā
(`docs/mockups/mp-layout-spec.json`); konkrētie skaitļi dzīvo `mobileLayout.ts` (sk. zemāk).

---

## 2. Failu karte — kur kas atrodas

| Fails | Loma |
| --- | --- |
| `apps/web/components/mp/MpGameTable.tsx` | Desktop MP galds **+** `useIsPhonePortrait()` hooks un nosacījums, kas telefona portrētā renderē `MpMobileTable`. |
| `apps/web/components/mp/MpMobileTable.tsx` | **Viss mobilais izkārtojums**: sēdvietas, nozīmītes (bid/won, punkti, kauliņu skaits, countdown), kopējo punktu tabula, galds + stiķis, roka, pamešanas poga, trumpja etiķete. |
| `apps/web/lib/mp/mobileLayout.ts` | **Ģeometrija**: elementu centra pozīcijas (% no skatuves) un izmēri (px 1080×2340 telpā), + palīgi `centerPoint`/`centerBox`. **Vienīgais koordinātu avots.** |
| `apps/web/lib/mp/seatLabel.ts` | `seatLabel()` (vārds: displayId / "AI n" / atkāpšanās) un `formatTemplate()`. Kopīgs ar desktop. |
| `apps/web/app/globals.css` | `.mpmStageClip`/`.mpmStage` (mērogotā skatuve) + `.mpm*` CSS klases (izskats, izmēri px, kauliņu mērogošana). |
| `apps/web/components/DominoTileView.tsx` | Kauliņa vizuālais komponents (fiksēti 80×144 px); mobilais to mērogo ar `transform`. |

> Dizaina atskaite (px 1080×2340) ir `docs/mockups/mp-layout-spec.json`. **Tas ir lokāls
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

Skatuve ir fiksēta **1080×2340 px** kaste (`.mpmStage`), ko `MpMobileTable` mērogo ar
`transform: scale(min(vw/1080, vh/2340))` un centrē (`useMobileStageLayout`). Tāpēc:

- Pozīcijas glabā kā **elementa CENTRU daļās (0..1)**; `left/top: %` no 1080×2340 kastes =
  **precīzas spec px**.
- Izmēri ir **px šajā 1080×2340 telpā** (no spec), nevis `vw`.

```ts
export const MP_MOBILE_SIZE = {
  profilePx: 218, badgePx: 101, tablePx: 483, tableAspect: 467/483,
  leavePx: 110, leaveAspect: 58/110, summaryPx: 638,
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
centerPoint(pt)             // → { left:cx%, top:cy%, transform: translate(-50%,-50%) }  (izmēru dod CSS)
centerBox(pt, px, aspect)   // → tas pats + width:`${px}px`, height:`${px*aspect}px`
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

Kauliņu izmērs: `DominoTileView` ir **80×144 px** (globālais `box-sizing: border-box` →
faktiskais izmērs jau ietver padding/border, t.i. tie 80×144, NE ~100×164). CSS to mērogo ar
`transform: scale(1.625)` → 130×234, kas atbilst spec rokas šūnai (130×233); stiķa
šūna ir 130×215, tāpēc kauliņš to nedaudz pārsniedz vertikāli, bet nepārklājas.

---

## 6. Kā pievienot vai pielāgot elementu

1. **Pozīcija/izmērs** → `mobileLayout.ts` (`MP_MOBILE_POS` centrs % + `MP_MOBILE_SIZE` px).
2. **Renderēšana** → `MpMobileTable.tsx`: izmanto `style={centerPoint(pos)}` vai
   `style={centerBox(pos, sizeVw, aspect)}`.
3. **Izskats** → `globals.css` `.mpm*` klase.
4. Sēdvietu dati nāk no `MpTableSeat` (`bid`, `tricksWon`, `totalScore`, `handCount`,
   `isActive`, `connectionState`, `displayId`, `visualSeat`, ...).

Tos pašus paņēmienus (`useIsPhonePortrait` + atsevišķs % / `vw` izkārtojums) var atkārtot
**citiem ekrāniem** (piem. lobby), neskarot desktop.

---

## 7. Zināmie ierobežojumi / piezīmes

Agrākā pārklāšanās uz īsiem skatlogiem ir **atrisināta** ar fiksēto mērogoto skatuvi (sk. 1./4.
sadaļu). Paliek šādas piezīmes:

- **Letterbox malas.** Uz telefoniem, kuru malu attiecība nav 9:16, paliek tukšas malas
  (skatuve mērogota `contain`). Tas ir apzināts kompromiss par "nekad nepārklājas". Vajadzības
  gadījumā tās var noslēpt, pagarinot galda fonu zem malām.
- **iOS Safari joslas.** `.mpmStageClip` lieto `100dvh`, un `useMobileStageLayout` klausās
  `visualViewport` resize/scroll → skatuve pārmērogojas, kad Safari josla parādās/pazūd.
  Adreses joslas augstuma maiņa vairs nerada pārklāšanos.
- **Iegriezums/home-josla:** ja vajag, var pievienot `viewport-fit=cover` +
  `env(safe-area-inset-*)`; pašlaik letterbox malas lielākoties absorbē drošās zonas.
- **SSR:** `MpMobileTable` mountojas tikai klientā (vecāks pārslēdzas pēc `useIsPhonePortrait`),
  tāpēc skatuves mērogs tiek aprēķināts uzreiz uz klienta — bez hidratācijas neatbilstības.
