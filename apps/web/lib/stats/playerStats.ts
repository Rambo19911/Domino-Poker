import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Padziļinātās statistikas klienta API (Fāze 5). Lēni ielādē `GET /stats` (auth) TIKAI
 * atverot "Statistika" tabu. Forma atbilst servera `PlayerStatsService.PlayerStats`.
 */
export interface PlacementDistribution {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly p4: number;
}

export interface PlayerStats {
  /** Solījumu precizitāte kopā (SP+MP): precīzi / pārsniegts / neizpildīts raundi. */
  readonly bidAccuracy: { readonly met: number; readonly exceeded: number; readonly missed: number };
  /** Vietu sadalījums pret botiem pa SP grūtībām. */
  readonly spByDifficulty: {
    readonly medium: PlacementDistribution;
    readonly hard: PlacementDistribution;
    readonly epic: PlacementDistribution;
  };
  /** Vietu sadalījums MP spēlēs (bez grūtības). */
  readonly mpPlacement: PlacementDistribution;
}

export function apiGetStats(token: string): Promise<AuthResult<PlayerStats>> {
  return requestJson<PlayerStats>("/stats", jsonInit("GET", undefined, token));
}
