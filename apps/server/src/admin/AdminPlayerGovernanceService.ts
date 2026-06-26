import type { AuthStore } from "../auth/AuthStore.js";
import type { GameStatsAggregateRow, PlayerStatsStore } from "../storage/PlayerStatsStore.js";
import type { StoragePort, UserStatsRecord } from "../storage/StoragePort.js";
import type { WalletService } from "../wallet/WalletService.js";
import type { AdminAuditService } from "./AdminAuditService.js";
import type {
  AdminStore,
  BanRecord,
  LedgerEntryView,
  LoginAttemptView
} from "./AdminStore.js";

/**
 * Admin spēlētāju PĀRVALDĪBAS serviss (Fāze 4B.2, D5): pilns datu eksports + hard-delete.
 *
 * **Eksports/snapshot ir ALLOWLIST** (NE `UserRecord`, kas satur `password_hash`): skaidrs
 * `AdminPlayerExport` DTO ar TIKAI atļautajiem laukiem — bez paroles hash, bez tokenu hash,
 * bez admin sesijām. Visi lasījumi ir PILNI (bez limita), lai D5 backup nebūtu klusi apgriezts.
 *
 * **Dzēšanas secība (Codex):** snapshot → audit (= backup) → anonimizē matches → hard-delete.
 * Snapshot/audit tiek persistēti PIRMS destrukcijas; ja kāds no tiem met kļūdu, dzēšana NEturpinās.
 * Soļi NAV viena transakcija pāri spējām (tas pats pieņemtais reziduāls kā Fāzē 2/3) — starpstāvokļi
 * (matches anonimizēti, bet konts vēl eksistē) ir idempotenti pārpalaižami.
 */

/** Pilns spēlētāja eksports (allowlist; NEKAD passwordHash/tokenu hash). */
export interface AdminPlayerExport {
  readonly account: {
    readonly id: string;
    readonly username: string;
    readonly email?: string | undefined;
    readonly avatar: string;
    readonly createdAt: number;
    readonly updatedAt: number;
  };
  readonly balance: number;
  readonly stats: { readonly wins: number; readonly losses: number; readonly gamesPlayed: number } | null;
  readonly language: string;
  readonly hasCustomAvatar: boolean;
  readonly logins: readonly LoginAttemptView[];
  readonly ledger: readonly LedgerEntryView[];
  readonly gameResults: readonly GameStatsAggregateRow[];
  readonly bans: readonly BanRecord[];
}

export type DeletePlayerOutcome = "deleted" | "not_found";

/** Glabātuve, kas atbalsta pārvaldību (visi backendi implementē visus). */
export type GovernanceStore = AuthStore &
  AdminStore &
  PlayerStatsStore &
  Pick<StoragePort, "anonymizeUserInMatches">;

export class AdminPlayerGovernanceService {
  constructor(
    private readonly store: GovernanceStore,
    private readonly wallet: WalletService,
    private readonly audit: AdminAuditService,
    private readonly clock: () => number,
    /** Atvieno dzīvās WS sesijas pēc dzēšanas (push, kā ban); `undefined` = nav gateway. */
    private readonly onUserDeleted?: ((userId: string) => void) | undefined
  ) {}

  /** Pilns spēlētāja eksports (allowlist) vai `undefined`, ja konts neeksistē. */
  async exportPlayer(userId: string): Promise<AdminPlayerExport | undefined> {
    const user = await this.store.getUserById(userId);
    if (!user) {
      return undefined;
    }
    const [balance, stats, language, avatar, logins, ledger, gameResults, bans] = await Promise.all([
      this.wallet.getBalance(userId),
      this.store.getUserStats(userId),
      this.store.getUserLanguage(userId),
      this.store.getUserAvatar(userId),
      this.store.exportUserLoginHistory(userId),
      this.store.exportUserLedger(userId),
      this.store.getPlayerGameStats(userId),
      this.store.exportUserBans(userId)
    ]);
    return {
      // Allowlist: NEKAD passwordHash / passwordReset / tokenu hash.
      account: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      balance,
      stats: toStats(stats),
      language: language ?? "en",
      hasCustomAvatar: avatar !== undefined,
      logins,
      ledger,
      gameResults,
      bans
    };
  }

  /**
   * Hard-delete spēlētāju (Fāze 4B.2, D5). Snapshot → audit (backup) → anonimizē matches →
   * hard-delete (CASCADE). `not_found`, ja konts neeksistē; tad nekas nemainās.
   */
  async deletePlayer(
    userId: string,
    ctx: { readonly ip?: string | undefined }
  ): Promise<DeletePlayerOutcome> {
    // 1. Pilns snapshot (ja konts nav → not_found pirms jebkādas mutācijas).
    const snapshot = await this.exportPlayer(userId);
    if (!snapshot) {
      return "not_found";
    }
    // 2. Audit ar PILNU snapshot = backup. Tiek persistēts PIRMS destrukcijas; ja met → abort.
    await this.audit.record({
      action: "player.delete",
      targetType: "player",
      targetId: userId,
      summary: `Hard-deleted "${snapshot.account.username}" (full snapshot stored)`,
      diff: { snapshot },
      ip: ctx.ip
    });
    // 3. Anonimizē partiju datus (noņem userId/clientId no players_json; idempotents).
    await this.store.anonymizeUserInMatches(userId);
    // 4. Hard-delete kontu (FK CASCADE).
    await this.store.hardDeleteUser(userId);
    // 5. Atvieno dzīvās WS sesijas (push, kā ban) — autentificēta WS nedrīkst pārdzīvot dzēšanu (Codex).
    this.onUserDeleted?.(userId);
    return "deleted";
  }
}

function toStats(
  stats: UserStatsRecord | undefined
): { readonly wins: number; readonly losses: number; readonly gamesPlayed: number } | null {
  return stats ? { wins: stats.wins, losses: stats.losses, gamesPlayed: stats.gamesPlayed } : null;
}
