/**
 * PWA atjaunināšanas pārlādes vārti (reload gate).
 *
 * Kad serverī iznāk jauns build, jaunais service worker pārņem kontroli un izšauj
 * `controllerchange`. Atvērtā cilne tad joprojām darbina VECOS JS chunk-us, tāpēc
 * jāpārlādē, lai ielādētu svaigos. Bet aktīvas spēles laikā (SP/MP stāvoklis dzīvo
 * tikai atmiņā) klusa pārlāde izsviestu lietotāju no partijas — tāpēc tad rādām
 * soft-promptu, nevis pārlādējam.
 *
 * `reloadSafe` ir modulis-līmeņa signāls (NE React state), jo to raksta `AppShell`
 * (zina ekrānu) un lasa `PwaRegister` (dzīvo `layout` koka blakuszaru) — dažādi
 * koka zari, un signāls nedrīkst izraisīt re-renderus.
 */

// Konservatīvs noklusējums `false`: īsajā init-logā (pirms `AppShell` iestata vārtus)
// jauns SW drīzāk rāda promptu, nevis pārlādē — nekad negrūž lietotāju no spēles.
let reloadSafe = false;

/** `AppShell` izsauc: droša auto-pārlāde tikai tad, kad NAV aktīvas spēles. */
export function setReloadSafe(safe: boolean): void {
  reloadSafe = safe;
}

export function isReloadSafe(): boolean {
  return reloadSafe;
}

export type ReloadAction = "reload" | "prompt" | "ignore";

/**
 * Tīra lēmuma funkcija (testējama bez SW/DOM):
 *  - `ignore`: pirmā SW instalācija (lapa vēl nebija kontrolēta) — NEPĀRLĀDĒT, lai
 *    pirmais apmeklējums neizraisītu lieku pārlādi.
 *  - `reload`: jauns SW pārņēma kontroli un pārlāde ir droša (lobby) → klusi svaigs.
 *  - `prompt`: jauns SW pārņēma kontroli, bet ir aktīva spēle → rādīt soft-promptu.
 */
export function decideReloadAction(input: {
  readonly hadController: boolean;
  readonly reloadSafe: boolean;
}): ReloadAction {
  if (!input.hadController) return "ignore";
  return input.reloadSafe ? "reload" : "prompt";
}
