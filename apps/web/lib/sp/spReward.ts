import type { CoinDifficulty } from "@domino-poker/shared";

import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * SP balvas klienta API (Fāze 2). SP spēle notiek pārlūkā; serveris izsniedz
 * vienreizēju spēles tokenu pie SĀKUMA (`/sp/start`) un piešķir balvu pret to pie
 * BEIGĀM (`/sp/reward`). Grūtību piespiež serveris (no tokena), tāpēc klients to
 * nesūta balvas pieprasījumā. Anonīmam šie izsaukumi netiek veikti.
 */

export interface SpStartResponse {
  readonly gameToken: string;
}

export interface SpRewardResponse {
  /** Piešķirtās monētas (0, ja griesti/par ātri/neder); UI rāda tikai ja > 0. */
  readonly awarded: number;
  readonly balance: number;
}

/** Sāk SP balvas sesiju: serveris momentuzņem grūtību un atgriež vienreizēju tokenu. */
export function apiSpStart(
  token: string,
  difficulty: CoinDifficulty
): Promise<AuthResult<SpStartResponse>> {
  return requestJson<SpStartResponse>("/sp/start", jsonInit("POST", { difficulty }, token));
}

/** Pieprasa balvu pēc spēles beigām (placement 1 vai 2) pret vienreizējo tokenu. */
export function apiSpReward(
  token: string,
  body: { readonly gameToken: string; readonly placement: 1 | 2 }
): Promise<AuthResult<SpRewardResponse>> {
  return requestJson<SpRewardResponse>("/sp/reward", jsonInit("POST", body, token));
}
