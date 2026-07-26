import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Klienta puses Domino Slots HTTP API (pret servera `/slots/*`). Atkārtoti lieto auth
 * `requestJson`/`jsonInit` (viena HTTP bāze + Bearer tokens). Anonīmie nespēlē (401).
 *
 * Serveris ir autoritatīvs: režģi, laimestu un bilanci ģenerē serveris; klients sūta
 * TIKAI `spinId` un `lineBet`. DTO atspoguļo servera `SlotSpinView` (serverī nav shared;
 * definēts šeit, kā `dailyApi`/`spReward`).
 */

export interface SlotGridCellView {
  readonly symbol: string;
  /** Renderētājs to lieto sakrautās Full Wild kolonnas animācijai. */
  readonly fromFullWildColumn: boolean;
}

export interface SlotLineView {
  readonly lineIndex: number;
  readonly category: string | null;
  readonly startColumn: number;
  readonly length: number;
  readonly targetSymbol: string | null;
  readonly multiplierHundredths: number;
  readonly winCoins: number;
}

export interface SlotSpinView {
  readonly spinId: string;
  readonly lineBet: number;
  readonly totalBet: number;
  readonly payout: number;
  readonly grid: readonly (readonly SlotGridCellView[])[];
  readonly lines: readonly SlotLineView[];
  readonly jackpotCount: number;
  readonly scatterWin: number;
  readonly mathVersion: string;
}

export interface SlotSpinResponse {
  /** `false` = idempotents atkārtojums; nauda netika kustināta otrreiz. */
  readonly applied: boolean;
  /** Autoritatīvā bilance PĒC grieziena (likme jau atskaitīta, laimests ieskaitīts). */
  readonly balance: number;
  readonly spin: SlotSpinView;
}

/**
 * Viens grieziens. `spinId` ir idempotences atslēga: tīkla kļūmes gadījumā atkārto ar
 * TO PAŠU id — serveris atdos ierakstīto iznākumu, nevis grieztu no jauna. Jauns
 * grieziens = jauns UUID.
 */
export function apiSlotSpin(
  token: string,
  spinId: string,
  lineBet: number
): Promise<AuthResult<SlotSpinResponse>> {
  return requestJson<SlotSpinResponse>(
    "/slots/spin",
    jsonInit("POST", { spinId, lineBet }, token)
  );
}

/**
 * Autoritatīvā bilance no KĻŪDAS korpusa. `/slots/spin` 402 atbilde ir
 * `{ error: "insufficient_coins", balance }` (`slotRoutes.ts`), un tā ir vienīgā vieta,
 * kur serveris pasaka patieso bilanci, kad grieziens netika pieņemts. Bez šī novecojis
 * lokālais skaitlis paliktu novecojis: pārāk zems bloķētu spēli, pārāk augsts atkārtoti
 * dabūtu 402 — abos gadījumos bez izlabošanas.
 *
 * Atgriež `undefined`, ja korpusa nav vai tas nav gaidītajā formā (kļūda nedrīkst
 * kļūt par bojātu bilanci).
 */
export function readErrorBalance(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { balance } = body as { balance?: unknown };
  return typeof balance === "number" && Number.isSafeInteger(balance) && balance >= 0
    ? balance
    : undefined;
}
