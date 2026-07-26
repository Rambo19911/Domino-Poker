"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { Dialog } from "./Dialog";
import { PresenceContext } from "./usePresence";
import SlotsGameLoader from "./slots/SlotsGameLoader";
import type { SoundSettings } from "./slots/audio/SoundPlayer";
import { CloseIcon } from "./ui/CloseIcon";
import { IconButton } from "./ui/IconButton";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

/**
 * Domino Slots lobija dialogs — tikai apvalks. Pati spēle ir PixiJS un ienāk caur
 * `SlotsGameLoader` (`ssr: false` dinamiskais imports), tāpēc ne Pixi, ne 4,5 MiB
 * grafikas neietekmē lobija sākotnējo ielādi.
 *
 * Spēles iekšējie teksti paliek angliski (plāna §0.5); vienīgais lokalizējamais ir
 * lobija pogas nosaukums.
 */

/** Spēles nosaukums — EN literālis, kā `StoreDialog` "The Sage". */
const SLOTS_TITLE = "Domino Slots";

/**
 * Kompaktais lūzuma punkts (`responsive.css:43`). ŠIS IR SPOGULIS `styles/slots.css`
 * media vaicājumam, kas paslēpj lobija pogu — abām pusēm jālūzt vienā punktā, citādi
 * ikona pazustu, bet atvērtā spēle paliktu lietojama mobilajā izmērā.
 */
const COMPACT_QUERY = "(max-width: 820px), (max-height: 680px)";

/**
 * Darbvirsmas vārtu JS puse (uzdevums #4). Sākuma vērtība ir `false` — SSR nezina
 * viewport, un "paslēpts, kamēr nav pierādīts pretējais" ir drošā puse.
 */
export function useSlotsAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setAvailable(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return available;
}

export function SlotsDialog({
  audio,
  labels: t,
  getToken,
  balance,
  onBalanceChange,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly getToken: () => string | undefined;
  /** Autoritatīvā konta bilance; `null` = vēl nav ielādēta. */
  readonly balance: number | null;
  readonly onBalanceChange: (next: number) => void;
  readonly onClose: () => void;
}) {
  const closeRequestedRef = useRef(false);
  const handleClose = useCallback(() => {
    // Karogs tiek uzstādīts JAU klikšķa apstrādātājā — sk. `canWager`.
    closeRequestedRef.current = true;
    audio.play("uiClick");
    onClose();
  }, [audio, onClose]);

  /**
   * 🚦 SINHRONAIS naudas vārts: vai grieziens šobrīd vispār drīkst sākties.
   *
   * Atmontēšana pie `"closing"` (zemāk) notiek tikai pēc pasīvā efekta, tāpēc starp
   * aizvēršanas nodomu un atmontēšanu paliek logs, kurā Auto Spin atliktais taimeris
   * vēl varētu izšaut. Šis predikāts tiek nolasīts `getToken` iekšienē, un `null`
   * liek `SlotsGame.spin` pārtraukt PIRMS jebkura HTTP izsaukuma.
   *
   * Abi aizvēršanas ceļi ir jāsedz atsevišķi:
   *   1. lietotāja aizvēršana (X vai Escape) → `closeRequestedRef`;
   *   2. viewport sarukšana zem darbvirsmas sliekšņa → `LobbyScreen` aizver ar
   *      `setSlotsOpen(false)`, NEIET caur `handleClose`, un starp media izmaiņu un
   *      atmontēšanu ir divi efektu lēcieni. Tāpēc slieksnis tiek mērīts TIEŠI šeit.
   * Auth zudumu sedz pats `getToken`, kas tad jau atdod `undefined`.
   */
  const canWager = useCallback(
    (): boolean => !closeRequestedRef.current && !window.matchMedia(COMPACT_QUERY).matches,
    []
  );

  // `Presence` patur dialogu mountētu vēl 200 ms izejas animācijai. Spēle šajā logā
  // NEDRĪKST palikt dzīva: Auto Spin atliktais starts noliktu ĪSTU likmi uz jau
  // aizvērta dialoga. Tāpēc spēli atmontējam UZREIZ pie "closing" (React unmount →
  // `GameController.dispose()` + `GameApp.destroy()`), un tālāk izpeld tikai panelis.
  const closing = useContext(PresenceContext) === "closing";

  // Atkārtota atvēršana IZEJAS loga laikā patur TO PAŠU `SlotsDialog` instanci
  // (`Presence` remontē tikai bērnu), tāpēc karogs jānoņem — citādi no jauna atvērtā
  // spēle nekad nevarētu griezt un rādītu maldinošu "session expired". Efektā, nevis
  // renderā, apzināti: novēlota noņemšana ir droša (bloķē mirkli ilgāk), pāragra nav.
  useEffect(() => {
    if (!closing) closeRequestedRef.current = false;
  }, [closing]);

  return (
    <Dialog ariaLabelledBy="slots-title" className="slotsDialog" onEscape={handleClose}>
      <h2 id="slots-title" className="srOnly">{SLOTS_TITLE}</h2>
      {/* Escape ir tikai viens ceļš ārā — peles lietotājam vajag redzamu vadīklu.
          Panelim nav galvenes (spēle aizpilda 100 % platuma), tāpēc poga pārklājas ar
          spēli. Novietojums AUGŠĀ PA KREISI ir apzināts: spēles pašas vadīklas sēž lejā
          centrā (`HUD_HIT_AREAS`) un augšā pa labi (`RULES_HIT_AREA` x=1810), un šaurākā
          panelī Rules proxy kļūst pointer-aktīvs (`@container (max-width: 880px)`) —
          X augšējā labajā stūrī tur atvērtu Rules, nevis aizvērtu dialogu. */}
      <IconButton
        className="slotsCloseButton"
        label={t.close}
        title={t.close}
        onClick={handleClose}
      >
        <CloseIcon />
      </IconButton>
      {closing || balance === null ? (
        // Bez autoritatīvas bilances HUD rādītu izdomātu skaitli — labāk gaidīt.
        <div className="slotsGameLoading">Loading…</div>
      ) : (
        <LiveSlotsGame
          getToken={() => (canWager() ? getToken() ?? null : null)}
          currentToken={getToken}
          initialBalance={balance}
          onBalanceChange={onBalanceChange}
          getSoundSettings={() => ({ muted: audio.isMuted, volume: audio.effectsVolume })}
        />
      )}
    </Dialog>
  );
}

/**
 * Monotons "kura slotu spēle ir jaunākā" skaitītājs. Moduļa tvērumā apzināti:
 * `Presence` var spēli atmontēt un remontēt (aizvērt/atvērt), un salīdzinājumam
 * jāstrādā PĀRI instancēm.
 */
let liveGameSeq = 0;

/**
 * Viena dzīva spēles instance. Eksistē tikai tāpēc, lai bilances publicēšanu varētu
 * apzīmogot ar `{ tokens, kārtas nr. }` uz montāžu.
 *
 * Norēķins var atgriezties PĒC atmontēšanas, un `GameController` tad tik un tā publicē
 * bilanci (Fāzes 5 apzināta izvēle — citādi lobijs rādītu novecojušu skaitli). Divi
 * veidi, kā tāda novēlota atbilde var sabojāt lobija bilanci, un abi te ir aizvērti:
 *   1. cita sesija — lietotājs izlogojās/ielogojās; summa pieder CITAM kontam.
 *      Tokens dzīvas sesijas laikā NEROTĒ (`applyToken` sauc tikai login/register/
 *      logout, `useAuthUser.ts:79`), tāpēc tas ir derīgs identitātes tests;
 *   2. secība tajā pašā sesijā — lietotājs aizvēra un atvēra no jauna, un VECĀKĀS
 *      spēles atbilde pienāk pēc jaunākās; `seq` to noraida.
 *
 * Kad NEVIENA jaunāka spēle nav sākusies, zīmogs joprojām sakrīt, tāpēc pēc-`dispose`
 * publikācija iet cauri — Fāzes 5 prasība paliek spēkā.
 */
function LiveSlotsGame({
  getToken,
  currentToken,
  initialBalance,
  onBalanceChange,
  getSoundSettings
}: {
  readonly getToken: () => string | null;
  /** Neapvalkots tokena lasītājs sesijas salīdzinājumam (`getToken` aizveras pie close). */
  readonly currentToken: () => string | undefined;
  readonly initialBalance: number;
  readonly onBalanceChange: (next: number) => void;
  readonly getSoundSettings: () => SoundSettings;
}) {
  // Zīmogs tiek uzlikts KOMITĒŠANAS brīdī, ne renderā. `useState` inicializators te
  // būtu nepareizs: Strict Mode to izsauc DIVREIZ un React patur PIRMO rezultātu, tāpēc
  // moduļa skaitītāja palielināšana tur atstātu `seq` uz mūžu atpalikušu (1 pret 2) un
  // KATRA bilances publikācija tiktu klusi atmesta. Efekts ir Strict-Mode-atkārtojuma
  // drošs: pie dubultās montāžas skaitītājs pieaug vēlreiz, bet GALA zīmogs sakrīt.
  const stampRef = useRef<{ token: string | undefined; seq: number } | null>(null);
  useEffect(() => {
    stampRef.current = { token: currentToken(), seq: ++liveGameSeq };
  }, [currentToken]);

  const publishBalance = useCallback(
    (next: number) => {
      const stamp = stampRef.current;
      // Pirms komitēšanas neviens grieziens nav iespējams (tas prasa lietotāja darbību).
      if (stamp === null || stamp.seq !== liveGameSeq) return;
      if (currentToken() !== stamp.token) return;
      onBalanceChange(next);
    },
    [currentToken, onBalanceChange]
  );

  return (
    <SlotsGameLoader
      getToken={getToken}
      initialBalance={initialBalance}
      onBalanceChange={publishBalance}
      getSoundSettings={getSoundSettings}
    />
  );
}

/**
 * Lobija slotu ikona. `<img>`, NEVIS CSS maska: `lucky777.svg` ir daudzkrāsains
 * (3 gradienti + fiksētas krāsas), un maska + `currentColor` to saplacinātu vienā
 * tonī. Tas pats paraugs kā animētajai trofejai (`LeaderboardDialog.tsx:226`).
 */
export function SlotsIcon() {
  return (
    <span className="slotsAssetIcon" aria-hidden="true">
      <img className="slotsAssetImg" src="/assets/icons/lucky777.svg" alt="" />
    </span>
  );
}
