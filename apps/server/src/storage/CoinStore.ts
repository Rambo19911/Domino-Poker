/**
 * Zelta monētu maku glabātuves saskarne — atsevišķa "spēja" (kā `AuthStore`), ko
 * implementē GAN `SqliteStorage` (lokāli/dev), GAN `PostgresStorage` (prod). Nauda
 * ir VESELI skaitļi; serveris ir autoritatīvs. Visas izmaiņas iet caur `applyLedger`
 * (atomiski + idempotenti), nekad tieši `UPDATE coin_balances`.
 *
 * Modelis: `coin_balances` = autoritatīvā bilance; `coin_ledger` = append-only audita
 * žurnāls ar `UNIQUE (user_id, reason, ref)` idempotences sargu. Vienreizēja darbība
 * (tas pats `(userId, reason, ref)`) tiek piemērota TIEŠI VIENU reizi — atkārtots
 * izsaukums (reconnect / race / atkārtots event) ir drošs no-op.
 */

/** Naudas kustības iemesls (atbilst `coin_ledger.reason` CHECK enum). */
export type LedgerReason = "signup" | "sp_reward" | "mp_entry" | "mp_refund" | "mp_payout";

/** Viena (idempotenta) naudas kustība, ko piemēro `applyLedger`. */
export interface LedgerEntryInput {
  /** Ledger rindas PK (uuid; idempotenci nodrošina nevis šis, bet `(userId, reason, ref)`). */
  readonly id: string;
  readonly userId: string;
  /** + kredīts / − debets; nedrīkst būt 0. */
  readonly delta: number;
  readonly reason: LedgerReason;
  /** Per-darbības konteksts (signup→userId, sp_reward→gameToken, mp_*→entryId/matchId). */
  readonly ref: string;
  /**
   * Minimālā atļautā bilance PĒC kustības (noklusējums 0). Debetam: ja `balance +
   * delta < minBalance`, kustība tiek noraidīta (`{ ok: false, reason: "insufficient" }`).
   */
  readonly minBalance?: number;
  /** Servera laiks (ms). */
  readonly now: number;
}

/**
 * `applyLedger` rezultāts. `applied` = vai TIKKO tika ierakstīta jauna kustība
 * (`true`) vai tas bija idempotents no-op (`false`, atslēga jau eksistēja). `balance`
 * ir pašreizējā bilance abos gadījumos. `insufficient` = debets pārsniegtu `minBalance`.
 */
export type ApplyLedgerResult =
  | { readonly ok: true; readonly applied: boolean; readonly balance: number }
  | { readonly ok: false; readonly reason: "insufficient" };

export interface CoinStore {
  /** Pašreizējā bilance vai 0, ja makam vēl nav rindas. */
  getBalance(userId: string): Promise<number>;

  /**
   * Atomiski (vienā transakcijā) piemēro vienu naudas kustību: ieraksta ledger
   * (idempotenti pēc `(userId, reason, ref)`) UN atjauno `coin_balances`. Debetam
   * piespiež `minBalance` sargu (bilance nedrīkst kļūt zem tā). Idempotents:
   * atkārtots izsaukums ar to pašu atslēgu neatkārto delta.
   */
  applyLedger(entry: LedgerEntryInput): Promise<ApplyLedgerResult>;

  /**
   * Summē ledger `delta` dotam `(userId, reason)`, kur `created_at >= sinceMs`.
   * Lieto anti-cheat griestiem (piem. SP balvu dienas limits). 0, ja nav rindu.
   */
  sumLedgerSince(userId: string, reason: LedgerReason, sinceMs: number): Promise<number>;
}

/** Runtime pārbaude, vai glabātuve atbalsta maku (abas to dara; sargs index.ts). */
export function isCoinStore(value: unknown): value is CoinStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CoinStore).getBalance === "function" &&
    typeof (value as CoinStore).applyLedger === "function" &&
    typeof (value as CoinStore).sumLedgerSince === "function"
  );
}
