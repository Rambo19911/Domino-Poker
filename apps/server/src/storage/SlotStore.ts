/**
 * Domino Slots griezienu norēķinu glabātuves saskarne — atsevišķa "spēja" (kā
 * `CoinStore`/`AuthStore`), ko implementē GAN `SqliteStorage`, GAN `PostgresStorage`.
 *
 * KĀPĒC ŠIS EKSISTĒ ATSEVIŠĶI NO `applyLedger`: grieziens ir DIVAS naudas kustības —
 * likme (debets) un izmaksa (kredīts). `applyLedger` ir atomisks tikai vienai kustībai,
 * tāpēc divi secīgi izsaukumi atstātu logu, kurā avārija paņem likmi, bet neieskaita
 * izmaksu. `settleSlotSpin` abas kustības PLUS audita rindu ieraksta VIENĀ transakcijā.
 *
 * Idempotence: atslēga ir `(userId, spinId)`, ko glabā `slot_spins` saliktā primārā
 * atslēga (migrācija 0016). `spinId` ģenerē klients, tāpēc tas ir lietotāja tvērumā —
 * globāla atslēga ļautu vienam lietotājam trāpīt cita ierakstā.
 *
 * ATKĀRTOJUMA SEMANTIKA (svarīgi drošībai): idempotence attiecas uz VEIKSMĪGI
 * norēķinātiem griezieniem. Ja `(userId, spinId)` jau eksistē, metode atgriež IERAKSTĪTO
 * griezienu un `applied: false` — tā NEPIEMĒRO naudu otrreiz un NEIERAKSTA jauno, tikko
 * ģenerēto režģi. Tāpēc klients nevar pārmest kauliņus, atkārtoti sūtot to pašu `spinId`.
 *
 * Nepietiekamu līdzekļu gadījums `spinId` NEREZERVĒ (nekas netiek ierakstīts), tāpēc to
 * pašu id vēlāk var izmantot jaunam griezienam. Tā nav priekšrocība: noraidīts
 * pieprasījums klientam neatklāj nekādu iznākumu, un režģi ģenerē serveris.
 */

/** Viena grieziena norēķins: likme, izmaksa un audits, ko piemēro vienā transakcijā. */
export interface SlotSpinSettleInput {
  /** Klienta ģenerēts UUID; idempotences atslēga kopā ar `userId`. */
  readonly spinId: string;
  readonly userId: string;
  /** Likme uz līniju (serveris to validē pret `SLOT_MATH_CONFIG.lineBetSteps`). */
  readonly lineBet: number;
  /** Kopējā likme = 11 x lineBet; debetējamā summa (> 0). */
  readonly totalBet: number;
  /** Kopējais laimests (>= 0). Ja 0, `slot_payout` ledger rinda netiek rakstīta. */
  readonly payout: number;
  /** Serializēts režģis atkārtošanai (necaurspīdīgs glabātuvei). */
  readonly gridJson: string;
  /** Serializēti līniju iznākumi atkārtošanai (necaurspīdīgi glabātuvei). */
  readonly winsJson: string;
  readonly mathVersion: string;
  /** `coin_ledger.id` likmes rindai (uuid; idempotenci dod `(user, reason, ref)`). */
  readonly betLedgerId: string;
  /** `coin_ledger.id` izmaksas rindai; neizmantots, ja `payout` ir 0. */
  readonly payoutLedgerId: string;
  /** Servera laiks (ms). */
  readonly now: number;
}

/** Noturīgi ierakstīts grieziens — atgriezts gan pēc svaiga norēķina, gan atkārtojuma. */
export interface SlotSpinRecord {
  readonly spinId: string;
  readonly lineBet: number;
  readonly totalBet: number;
  readonly payout: number;
  readonly gridJson: string;
  readonly winsJson: string;
  readonly mathVersion: string;
  readonly createdAt: number;
}

/**
 * `applied` = vai TIKKO tika norēķināts jauns grieziens (`true`) vai tas bija
 * idempotents atkārtojums (`false`). `balance` ir bilance PĒC norēķina abos gadījumos.
 * `insufficient` = likme pārsniegtu pieejamo bilanci; nekas netiek ierakstīts, un
 * `balance` ir neizmainītā pašreizējā bilance.
 */
export type SlotSpinSettleResult =
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly balance: number;
      readonly spin: SlotSpinRecord;
    }
  | { readonly ok: false; readonly reason: "insufficient"; readonly balance: number };

/**
 * Neapstrādāta `slot_spins` rinda. Kolonnu nosaukumi ir identiski abos backendos;
 * atšķiras tikai skaitļu attēlojums (SQLite INTEGER → `number | bigint`, PG BIGINT →
 * `string`), tāpēc pārveidotājs ir kopīgs un koercē ar `Number()`.
 */
export interface SlotSpinRow {
  readonly spin_id: string;
  readonly line_bet: number | string | bigint;
  readonly total_bet: number | string | bigint;
  readonly payout: number | string | bigint;
  readonly grid_json: string;
  readonly wins_json: string;
  readonly math_version: string;
  readonly created_at: number | string | bigint;
}

export function slotSpinRowToRecord(row: SlotSpinRow): SlotSpinRecord {
  return {
    spinId: row.spin_id,
    lineBet: Number(row.line_bet),
    totalBet: Number(row.total_bet),
    payout: Number(row.payout),
    gridJson: row.grid_json,
    winsJson: row.wins_json,
    mathVersion: row.math_version,
    createdAt: Number(row.created_at)
  };
}

export interface SlotStore {
  /**
   * Atomiski (VIENĀ transakcijā) norēķina vienu griezienu: idempotences pārbaude pēc
   * `(userId, spinId)` → likmes seguma pārbaude → `slot_spins` audita rinda →
   * `slot_bet` debets → `slot_payout` kredīts (ja > 0) → `coin_balances` atjaunināšana.
   * Nepietiekamu līdzekļu gadījumā NEKAS netiek ierakstīts.
   */
  settleSlotSpin(input: SlotSpinSettleInput): Promise<SlotSpinSettleResult>;

  /** Ierakstītais grieziens vai `undefined`. Lieto atkārtošanai un auditam. */
  getSlotSpin(userId: string, spinId: string): Promise<SlotSpinRecord | undefined>;
}

/** Runtime pārbaude, vai glabātuve atbalsta slotus (abas to dara; sargs `index.ts`). */
export function isSlotStore(value: unknown): value is SlotStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SlotStore).settleSlotSpin === "function" &&
    typeof (value as SlotStore).getSlotSpin === "function"
  );
}
