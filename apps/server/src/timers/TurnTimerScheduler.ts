/** Laika avots (ms). Serveris ir vienīgā laika autoritāte. */
export type Clock = () => number;

/**
 * Vienīgā aktīvā turn timeout timera plānotājs. Tā kā istabā vienlaikus var būt
 * tikai viens aktīvs turns, pietiek ar vienu gaidošo timeri: `schedule`
 * aizstāj iepriekšējo, `cancel` to notīra.
 *
 * Phase 5 izmanto manuālu (mocked) implementāciju testiem; Phase 7 aiz šīs pašas
 * saskarnes pieslēgs īstu `setTimeout` implementāciju, nemainot RoomEngine.
 */
export interface TurnTimerScheduler {
  schedule(fireAt: number, run: () => void): void;
  cancel(): void;
}

/**
 * No-op scheduler — neplāno nekādu reālu timeri. Noderīgs Fāzē 5, kur turn
 * timeout tiek vadīts ārēji (mocked) vai vēl nav vajadzīgs; Fāzē 7 to aizstās
 * ar īstu `setTimeout` implementāciju.
 */
export const noopTurnTimerScheduler: TurnTimerScheduler = {
  schedule: () => {},
  cancel: () => {}
};
