import { isValidAvatarId } from "@domino-poker/shared";

import type { AdminResetResult } from "../auth/AuthService.js";
import type { AuthService } from "../auth/AuthService.js";
import type { EmailLocale } from "../auth/EmailSender.js";
import type { WalletService } from "../wallet/WalletService.js";
import type { AdminAuditService } from "./AdminAuditService.js";
import type { AdminPlayerStore } from "./AdminPlayerService.js";

/**
 * Admin spēlētāju RAKSTĪŠANAS serviss (Fāze 2, sadaļas 4/8/11). Atsevišķs no lasīšanas
 * `AdminPlayerService` (CQRS-veidā): mutācijas iet šeit, ar obligātu audit.
 *
 * **Audit dzīvo ŠEIT, ne route slānī (apzināts arhitektūras lēmums):** katra mutācijas
 * metode pati raksta `AdminAuditService.record` rindu, tāpēc "nav mutācijas bez audit"
 * (Codex invariants) ir strukturāli neaizmirstams. Coins gadījumā audit notiek TIKAI tad,
 * ja ledger tiešām mainījās (`applied`), lai idempotents atkārtojums NEradītu dublētu vai
 * maldinošu audit rindu (Codex). Mutācija + audit ir DIVI atsevišķi DB raksti (NE viena
 * transakcija pāri spējām) — pieņemts viena-admina panelim; tas ir pārklājums, ne atomiskums.
 */

/** Konta rediģēšanas iznākums (Fāze 2.1). */
export type AdminUpdateAccountOutcome =
  | "updated"
  | "username_taken"
  | "email_taken"
  | "invalid_avatar"
  | "not_found";

/** Statistikas korekcijas iznākums (Fāze 2.2). */
export type AdminCorrectStatsOutcome = "updated" | "not_found";

/** Valūtas korekcijas iznākums (Fāze 2.3). `applied=false` = idempotents atkārtojums. */
export type AdminAdjustCoinsOutcome =
  | { readonly kind: "ok"; readonly balance: number; readonly applied: boolean }
  | { readonly kind: "insufficient" }
  | { readonly kind: "not_found" };

/** Konta rediģēšanas ievade (tikai dotie lauki tiek mainīti; pārējie saglabājas). */
export interface AdminAccountEdit {
  readonly displayName?: string | undefined;
  readonly email?: string | undefined;
  readonly avatar?: string | undefined;
}

/** Audit konteksts (admin IP no sesijas). */
export interface AdminActorContext {
  readonly ip?: string | undefined;
}

export class AdminPlayerWriteService {
  constructor(
    private readonly store: AdminPlayerStore,
    private readonly wallet: WalletService,
    private readonly auth: AuthService,
    private readonly audit: AdminAuditService,
    private readonly clock: () => number,
    /**
     * Opcionāls signāls pēc FAKTISKAS username maiņas (kā `authRoutes.onUsernameChanged`;
     * injicē `index.ts` to pašu kompozīcijas saknes callback): leaderboard keša
     * invalidācija + lietotāja dzīvo WS sesiju klusa pārstartēšana, lai admina
     * pārsauktais spēlētājs pie galda/čatā nepaliek ar veco (atbrīvoto) vārdu.
     */
    private readonly onUsernameChanged?: (userId: string) => void
  ) {}

  /** Konta rediģēšana (Fāze 2.1): display name / e-pasts / avatars → audit diff. */
  async updateAccount(
    userId: string,
    edit: AdminAccountEdit,
    ctx: AdminActorContext
  ): Promise<AdminUpdateAccountOutcome> {
    const before = await this.store.getUserById(userId);
    if (!before) {
      return "not_found";
    }

    const username = edit.displayName ?? before.username;
    const usernameNorm = normalize(username);

    let email = before.email;
    let emailNorm = before.emailNorm;
    let emailChanged = false;
    if (edit.email !== undefined) {
      const nextNorm = normalize(edit.email);
      emailChanged = nextNorm !== (before.emailNorm ?? "");
      email = edit.email.trim();
      emailNorm = nextNorm;
    }

    let avatar = before.avatar;
    if (edit.avatar !== undefined) {
      // Admin iestata TIKAI preset id (NE `'custom'` augšupielādi).
      if (!isValidAvatarId(edit.avatar)) {
        return "invalid_avatar";
      }
      avatar = edit.avatar;
    }

    const result = await this.store.adminUpdateAccount(userId, {
      username: username.trim(),
      usernameNorm,
      email,
      emailNorm,
      avatar,
      updatedAt: this.clock()
    });
    if (result === "not_found") {
      return "not_found";
    }
    if (result === "conflict") {
      // Atrisina, KURŠ lauks aizņemts (kā `AuthService.register`).
      const byUsername = await this.store.getUserByUsernameNorm(usernameNorm);
      if (byUsername && byUsername.id !== userId) {
        return "username_taken";
      }
      return "email_taken";
    }

    // E-pasta maiņa → vecie reset tokeni (uz veco e-pastu) ir recovery risks (Codex) → dzēš.
    if (emailChanged) {
      await this.store.deleteUnusedPasswordResetTokens(userId);
    }

    await this.audit.record({
      action: "player.account.update",
      targetType: "player",
      targetId: userId,
      summary: `Edited account "${before.username}"`,
      diff: {
        before: { username: before.username, email: before.email ?? null, avatar: before.avatar },
        after: { username: username.trim(), email: email ?? null, avatar }
      },
      ip: ctx.ip
    });
    // TIKAI pie faktiskas username maiņas — tie paši pēc-pārsaukšanas efekti kā
    // spēlētāja pašapkalpošanās ceļam (sk. konstruktora doc).
    if (username.trim() !== before.username) {
      this.onUsernameChanged?.(userId);
    }
    return "updated";
  }

  /**
   * Statistikas korekcija (Fāze 2.2, D3): SET `user_stats` agregātu ar obligātu iemeslu.
   * `gamesPlayed = wins + losses` (saglabā invariantu; katra ieskaitītā spēle ir uzvara
   * vai zaudējums). Per-game `player_game_results` NETIEK pārrakstīta.
   */
  async correctStats(
    userId: string,
    input: { readonly wins: number; readonly losses: number; readonly reason: string },
    ctx: AdminActorContext
  ): Promise<AdminCorrectStatsOutcome> {
    const user = await this.store.getUserById(userId);
    if (!user) {
      return "not_found";
    }
    const before = await this.store.getUserStats(userId);
    const gamesPlayed = input.wins + input.losses;
    await this.store.adminSetUserStats(
      userId,
      { gamesPlayed, wins: input.wins, losses: input.losses },
      this.clock()
    );
    await this.audit.record({
      action: "player.stats.adjust",
      targetType: "player",
      targetId: userId,
      summary: `Corrected stats for "${user.username}"`,
      diff: {
        before: before
          ? { wins: before.wins, losses: before.losses, gamesPlayed: before.gamesPlayed }
          : null,
        after: { wins: input.wins, losses: input.losses, gamesPlayed },
        reason: input.reason
      },
      ip: ctx.ip
    });
    return "updated";
  }

  /**
   * Valūtas korekcija (Fāze 2.3, sadaļa 11): `delta` (+/−) caur `WalletService.adminAdjust`
   * (idempotents pēc `adjustmentId`; bilance < 0 nedrīkst). Audit TIKAI ja ledger mainījās
   * (`applied`) — idempotents atkārtojums neraksta dublētu rindu (Codex).
   */
  async adjustCoins(
    userId: string,
    input: { readonly delta: number; readonly reason: string; readonly adjustmentId: string },
    ctx: AdminActorContext
  ): Promise<AdminAdjustCoinsOutcome> {
    const user = await this.store.getUserById(userId);
    if (!user) {
      return { kind: "not_found" };
    }
    const before = await this.wallet.getBalance(userId);
    const result = await this.wallet.adminAdjust(userId, input.adjustmentId, input.delta);
    if (!result.ok) {
      return { kind: "insufficient" };
    }
    if (result.applied) {
      await this.audit.record({
        action: "player.coins.adjust",
        targetType: "player",
        targetId: userId,
        summary: `Adjusted balance for "${user.username}" by ${input.delta > 0 ? "+" : ""}${input.delta}`,
        diff: { before, after: result.balance, delta: input.delta, reason: input.reason },
        ip: ctx.ip
      });
    }
    return { kind: "ok", balance: result.balance, applied: result.applied };
  }

  /** Mīkstais paroles reset (Fāze 2.1): nosūta reset e-pastu; vecā parole paliek derīga. */
  async sendResetEmail(
    userId: string,
    locale: EmailLocale,
    ctx: AdminActorContext
  ): Promise<AdminResetResult> {
    const result = await this.auth.adminSendResetEmail(userId, locale);
    if (result === "sent") {
      await this.audit.record({
        action: "player.password.reset_email",
        targetType: "player",
        targetId: userId,
        summary: "Sent password reset email",
        ip: ctx.ip
      });
    }
    return result;
  }

  /** Cietais paroles reset (Fāze 2.1): anulē paroli + atsauc sesijas + reset e-pasts. */
  async forcePasswordReset(
    userId: string,
    locale: EmailLocale,
    ctx: AdminActorContext
  ): Promise<AdminResetResult> {
    const result = await this.auth.adminForcePasswordReset(userId, locale);
    if (result === "sent") {
      await this.audit.record({
        action: "player.password.force_reset",
        targetType: "player",
        targetId: userId,
        summary: "Forced password reset (revoked all sessions + sent email)",
        ip: ctx.ip
      });
    }
    return result;
  }
}

/** Normalizē identifikatoru salīdzināšanai (lowercase + trim) — kā `AuthService`. */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}
