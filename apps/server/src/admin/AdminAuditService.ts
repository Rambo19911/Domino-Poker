import { randomUUID } from "node:crypto";

import type { AdminAuditEntry, AdminStore } from "./AdminStore.js";

/**
 * Admin audita žurnāls (sk. `docs/TODO/admin-panel-plan.md`, Fāze 0, sadaļa 22). KATRA
 * mutējoša admin DARBĪBA raksta vienu append-only rindu (laiks, darbība, mērķis, JSON diff).
 * Tas ir Codex obligātais invariants: admin darbība bez audit ieraksta nav atļauta.
 *
 * **Apjoms (Codex):** "admin darbība" = autentificēta admina veikta operācija + sesijas dzīves
 * cikls (`admin.login`/`admin.logout`) + drošības signāli (`admin.verify_failed`). 2FA
 * autentifikācijas mehānisma IEKŠĒJAIS stāvoklis (OTP koda izveide, attempts skaitītāja
 * inkrements) NAV "admin darbība" — tas ir auth-procesa stāvoklis, ko apzināti NEauditē
 * (citādi žurnāls būtu troksnis un daļēji uzbrucēja kontrolēts). Fāzē 1+ katra spēlētāju
 * datu mutācija (konts/statistika/valūta/bani) raksta audit rindu ar `before/after` diff.
 */

/** Vienas audita darbības apraksts (id + laiku pievieno serviss). */
export interface AdminAuditInput {
  /** Mašīnlasāms darbības kods, piem. `"player.coins.adjust"`. */
  readonly action: string;
  /** Mērķa tips, piem. `"player"`/`"ban"` (vai nav, ja globāla darbība). */
  readonly targetType?: string | undefined;
  /** Mērķa id, piem. lietotāja id. */
  readonly targetId?: string | undefined;
  /** Cilvēklasāms kopsavilkums audita sarakstam. */
  readonly summary: string;
  /** Strukturēts izmaiņu diff (JSON-serializējams), piem. `{ before, after }`. */
  readonly diff?: unknown;
  /** Admin IP (audita izsekojamībai). */
  readonly ip?: string | undefined;
}

export class AdminAuditService {
  constructor(
    private readonly store: AdminStore,
    private readonly clock: () => number
  ) {}

  /** Ieraksta vienu audita rindu. */
  async record(input: AdminAuditInput): Promise<void> {
    await this.store.appendAdminAudit({
      id: randomUUID(),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      diff: input.diff,
      ip: input.ip,
      createdAt: this.clock()
    });
  }

  /** Jaunākie audita ieraksti (jaunākie pirmie) UI Audit History skatam. */
  async list(limit: number, offset: number): Promise<readonly AdminAuditEntry[]> {
    return this.store.listAdminAudit(limit, offset);
  }
}
