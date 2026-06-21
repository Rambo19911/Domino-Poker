import type { CoinDifficulty } from "@domino-poker/shared";

import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * SP balvas + statistikas klienta API (Fāze 2 + statistika). SP spēle notiek pārlūkā;
 * serveris izsniedz vienreizēju spēles tokenu pie SĀKUMA (`/sp/start`, momentuzņem
 * grūtību + raundu skaitu) un pie BEIGĀM `/sp/complete` reģistrē statistiku (VISI
 * placement 1..4) UN piešķir balvu (1./2. vieta). Grūtību un raundu skaitu piespiež
 * serveris (no tokena), tāpēc klients tos nesūta. Anonīmam izsaukumi netiek veikti.
 */

export interface SpStartResponse {
  readonly gameToken: string;
}

/** Pabeigtas SP spēles rezultāts no spēles komponentes (bid-accuracy uzkrāts pa raundiem). */
export interface SpGameResult {
  /** Cilvēka gala vieta 1..4. */
  readonly placement: number;
  /** Raundi, kuros solījums izpildīts precīzi (won == bid). */
  readonly bidMet: number;
  /** Raundi, kuros pārsniegts (won > bid). */
  readonly bidExceeded: number;
  /** Raundi, kuros neizpildīts (won < bid). */
  readonly bidMissed: number;
}

export interface SpCompleteResponse {
  /** Vai statistikas rinda tikko ierakstīta (false = dublikāts/retry). */
  readonly recorded: boolean;
  /** Piešķirtās monētas (0, ja ne 1./2. vieta / griesti / par ātri / dublikāts). */
  readonly coinsAwarded: number;
  readonly balance: number;
}

/**
 * Sāk SP sesiju: serveris momentuzņem grūtību + raundu skaitu un atgriež vienreizēju
 * tokenu. Raundu skaits ir vajadzīgs servera bid-accuracy validācijai pie beigām.
 */
export function apiSpStart(
  token: string,
  difficulty: CoinDifficulty,
  rounds: number
): Promise<AuthResult<SpStartResponse>> {
  return requestJson<SpStartResponse>("/sp/start", jsonInit("POST", { difficulty, rounds }, token));
}

/**
 * Reģistrē pabeigtu SP spēli (statistika visiem placement + balva 1./2. vietai) pret
 * vienreizējo tokenu. Idempotents serverī (id = `sp:{gameToken}` + ledger ref).
 */
export function apiSpComplete(
  token: string,
  body: {
    readonly gameToken: string;
    readonly placement: number;
    readonly bidMet: number;
    readonly bidExceeded: number;
    readonly bidMissed: number;
  }
): Promise<AuthResult<SpCompleteResponse>> {
  return requestJson<SpCompleteResponse>("/sp/complete", jsonInit("POST", body, token));
}
