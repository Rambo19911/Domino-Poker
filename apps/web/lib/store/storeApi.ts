import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Klienta puses veikala HTTP API (pret servera `/store/*`). Atkārtoti lieto auth
 * `requestJson`/`jsonInit` (viena HTTP bāze + Bearer tokens). Anonīmie nepērk (serveris
 * atgriež 401). Cena nāk no servera kataloga; klients tikai parāda.
 */

/** Veiksmīga pirkuma atbilde (`POST /store/buy`). */
export interface BuyResult {
  readonly owned: true;
  /** `true`, ja prece JAU piederēja (idempotents, bez dubulta debeta). */
  readonly alreadyOwned: boolean;
  /** Jaunā bilance pēc debeta. */
  readonly balance: number;
}

/** Piederošo preču itemId saraksts (auth). */
export function apiFetchOwned(token: string): Promise<AuthResult<{ owned: string[] }>> {
  return requestJson<{ owned: string[] }>("/store/owned", jsonInit("GET", undefined, token));
}

/** Nopērk preci par monētām (auth). 402 → `insufficient_coins`; 400 → `unknown_item`. */
export function apiBuyItem(token: string, itemId: string): Promise<AuthResult<BuyResult>> {
  return requestJson<BuyResult>("/store/buy", jsonInit("POST", { itemId }, token));
}
