import type { AuthStore } from "../auth/AuthStore.js";
import type { CoinStore } from "../storage/CoinStore.js";
import type { AdminPlayerRow, AdminStore, LoginAttemptView } from "./AdminStore.js";

/**
 * Admin spēlētāju lasīšanas serviss (Fāze 1). Komponē spēlētāja profila pārskatu no
 * esošajām glabātuves spējām (AuthStore konts + statistika, CoinStore bilance, AdminStore
 * login vēsture) — analogi `PlayerStatsService.getStats`. Tikai LASĪŠANA; mutācijas (Fāze 2)
 * iet caur atsevišķiem ceļiem ar audit.
 */

/** Glabātuve, kas atbalsta admin spēlētāju lasīšanu (visi backendi implementē visus). */
export type AdminPlayerStore = AuthStore & CoinStore & AdminStore;

/** Spēlētāja konta pamatinformācija admin profila pārskatam (sadaļa 3). */
export interface AdminPlayerAccount {
  readonly id: string;
  readonly username: string;
  /** E-pasts (admin redz to konta atjaunošanai); `undefined`, ja nav piesaistīts. */
  readonly email?: string | undefined;
  readonly avatar: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Pilns spēlētāja profila pārskats (Fāze 1.2). */
export interface AdminPlayerOverview {
  readonly account: AdminPlayerAccount;
  /** Zelta monētu bilance. */
  readonly balance: number;
  /** Agregētā MP statistika vai `null`, ja vēl nav ieskaitītu spēļu. */
  readonly stats: { readonly wins: number; readonly losses: number; readonly gamesPlayed: number } | null;
  /** Login vēstures kopsavilkums + pirmā lapa (sadaļa 5). */
  readonly logins: {
    readonly total: number;
    readonly failed: number;
    readonly recent: readonly LoginAttemptView[];
  };
}

/** Login vēstures lapa (Fāze 1.3). */
export interface AdminLoginHistoryPage {
  readonly total: number;
  readonly failed: number;
  readonly entries: readonly LoginAttemptView[];
}

/** Cik pēdējos login ierakstus iekļaut profila pārskatā. */
const OVERVIEW_LOGIN_LIMIT = 10;

export class AdminPlayerService {
  constructor(private readonly store: AdminPlayerStore) {}

  /** Meklē spēlētājus (ID/vārds/e-pasts), kārtots pēc pēdējās pieslēgšanās. */
  async search(query: string | undefined, limit: number, offset: number): Promise<readonly AdminPlayerRow[]> {
    return this.store.searchPlayers(query, limit, offset);
  }

  /** Pilns profila pārskats vai `undefined`, ja spēlētājs nav atrasts. */
  async getOverview(userId: string): Promise<AdminPlayerOverview | undefined> {
    const user = await this.store.getUserById(userId);
    if (!user) {
      return undefined;
    }
    const [balance, stats, counts, recent] = await Promise.all([
      this.store.getBalance(userId),
      this.store.getUserStats(userId),
      this.store.countPlayerLoginAttempts(userId),
      this.store.getPlayerLoginHistory(userId, OVERVIEW_LOGIN_LIMIT, 0)
    ]);
    return {
      account: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      balance,
      stats: stats
        ? { wins: stats.wins, losses: stats.losses, gamesPlayed: stats.gamesPlayed }
        : null,
      logins: { total: counts.total, failed: counts.failed, recent }
    };
  }

  /** Login vēstures lapa (pilna, ar lapošanu) — Fāze 1.3. */
  async getLoginHistory(userId: string, limit: number, offset: number): Promise<AdminLoginHistoryPage> {
    const [counts, entries] = await Promise.all([
      this.store.countPlayerLoginAttempts(userId),
      this.store.getPlayerLoginHistory(userId, limit, offset)
    ]);
    return { total: counts.total, failed: counts.failed, entries };
  }
}
