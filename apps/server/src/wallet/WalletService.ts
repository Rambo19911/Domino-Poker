import { randomUUID } from "node:crypto";

import { STARTING_COINS } from "@domino-poker/shared";

import type { CoinStore } from "../storage/CoinStore.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";

export interface WalletServiceOptions {
  readonly coins: CoinStore;
  readonly clock: Clock;
  /** Ledger rindas id ģenerators (injicējams testiem); noklusējums `randomUUID`. */
  readonly createId?: () => string;
}

/**
 * Zelta monētu maka aplikācijas slānis — biznesa noteikumi (summas no
 * `@domino-poker/shared` ekonomikas konstantēm) virs `CoinStore` (DB). Serveris ir
 * autoritatīvs; visas izmaiņas iet caur šejieni, nekad tieši storage.
 *
 * **Starta bonusa stratēģija (repair-on-read):** bonuss tiek piešķirts slinki, kad
 * maks pirmo reizi tiek aizskarts. `grantSignupBonus` (reģistrācijā) un `getBalance`
 * (jebkurš lasījums) abi to nodrošina idempotenti (ledger atslēga `signup/userId`).
 * Tas vienlaikus sedz: jaunu lietotāju, esošo lietotāju retroaktīvu backfill (A5) un
 * noturību, ja reģistrācijas bonusa raksts kādreiz neizdotos.
 */
export class WalletService {
  private readonly coins: CoinStore;
  private readonly clock: Clock;
  private readonly createId: () => string;
  /** Per-lietotāja secības ķēde (serializē griestu-pārbaudi + kreditēšanu; pašattīrās). */
  private readonly userChains = new Map<string, Promise<void>>();

  constructor(options: WalletServiceOptions) {
    this.coins = options.coins;
    this.clock = options.clock;
    this.createId = options.createId ?? (() => randomUUID());
  }

  /**
   * Serializē darbības uz vienu lietotāju (in-process; vienas instances, kā
   * `RateLimiter`). Novērš sacensību starp "summē-līdz-griestiem" lasījumu un
   * kreditēšanu, kad viens lietotājs vienlaikus pabeidz divas SP spēles.
   */
  private withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.userChains.get(userId) ?? Promise.resolve();
    const run = prev.then(fn, fn); // gaida iepriekšējo (arī ja tas neizdevās), tad palaiž fn
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.userChains.set(userId, tail);
    void tail.then(() => {
      if (this.userChains.get(userId) === tail) {
        this.userChains.delete(userId);
      }
    });
    return run;
  }

  /**
   * Idempotenti piešķir starta bonusu (`signup/userId`). Drošs saukt vairākkārt —
   * tikai pirmais reālais grants notiek. Atgriež bilanci pēc nodrošināšanas.
   */
  async grantSignupBonus(userId: string): Promise<number> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: STARTING_COINS,
      reason: "signup",
      ref: userId,
      now: this.clock()
    });
    // Kredīts nekad nevar būt "insufficient"; sargs tipam.
    return result.ok ? result.balance : 0;
  }

  /**
   * Konta bilance. Repair-on-read: vispirms idempotenti nodrošina starta bonusu
   * (jauns lietotājs / esošo backfill), tad atgriež pašreizējo bilanci.
   */
  async getBalance(userId: string): Promise<number> {
    return this.grantSignupBonus(userId);
  }

  /**
   * Ieskaita SP balvu (Fāze 2). Idempotents pēc `gameToken` (ref) — atkārtots
   * pieprasījums ar to pašu tokenu neieskaita divreiz (papildu DB-līmeņa sargs virs
   * vienreizējā in-memory tokena). Atgriež `applied` (vai TIKKO tika ieskaitīts, NE
   * idempotents no-op) + bilanci. `applied` ļauj `/sp/complete` ziņot ĪSTO `awarded`
   * (dublikātā 0), kreditējot katrā izsaukumā recoverability dēļ.
   */
  async creditSpReward(
    userId: string,
    gameToken: string,
    amount: number
  ): Promise<{ applied: boolean; balance: number }> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: amount,
      reason: "sp_reward",
      ref: gameToken,
      now: this.clock()
    });
    return result.ok
      ? { applied: result.applied, balance: result.balance }
      : { applied: false, balance: await this.coins.getBalance(userId) };
  }

  /**
   * MP dalības maksas debets (Fāze 3). Atomiski atskaita `fee` no `userId` bilances,
   * ja pietiek (`minBalance: 0`). Idempotents pēc `entryId` (vienreizēja sēdvietas
   * ieņemšanas atslēga, NE roomId — citādi refund→rejoin tai pašai istabai būtu
   * no-op = bezmaksas sēdvieta). `entryId` korelē debetu ar tā refundu/payout.
   * `{ ok:false }` ja bilance nepietiek (sēdvieta netiek piešķirta).
   */
  async debitEntryFee(
    userId: string,
    entryId: string,
    fee: number
  ): Promise<{ ok: true; balance: number } | { ok: false; reason: "insufficient" }> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: -fee,
      reason: "mp_entry",
      ref: entryId,
      minBalance: 0,
      now: this.clock()
    });
    return result.ok ? { ok: true, balance: result.balance } : result;
  }

  /**
   * MP dalības maksas refunds (Fāze 3). Idempotents pēc `entryId` — atkārtots refund
   * (piem. leave + TTL sweep vienlaikus) neieskaita divreiz. Refundē TIEŠI to
   * sēdvietas ieņemšanu, ko `debitEntryFee` atskaitīja. Atgriež bilanci pēc kreditēšanas.
   */
  async refundEntryFee(userId: string, entryId: string, fee: number): Promise<number> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: fee,
      reason: "mp_refund",
      ref: entryId,
      now: this.clock()
    });
    return result.ok ? result.balance : this.coins.getBalance(userId);
  }

  /**
   * MP poda izmaksa vienam uzvarētājam (Fāze 3). Idempotents pēc `matchId` — viena
   * izmaksa uz lietotāju uz spēli (atkārtots GAME_OVER neizmaksā divreiz). Atgriež
   * bilanci pēc kreditēšanas. (Poda dalījumu (70/30, A1/A2) aprēķina `splitPot`
   * augstāk, pirms šī izsaukuma.)
   */
  async payoutCoins(userId: string, matchId: string, amount: number): Promise<number> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: amount,
      reason: "mp_payout",
      ref: matchId,
      now: this.clock()
    });
    return result.ok ? result.balance : this.coins.getBalance(userId);
  }

  /**
   * Admin manuāla bilances korekcija (Fāze 2.3, sadaļa 11). Atomiski piemēro `delta`
   * (+ piešķiršana / − samazināšana) ar `minBalance: 0` (bilance NEDRĪKST kļūt negatīva →
   * `{ ok:false, reason:"insufficient" }`). Idempotents pēc `adjustmentId` (vienreizēja
   * korekcijas atslēga = ledger `ref`): atkārtots SŪTĪJUMS ar to PAŠU id (tīkla retry /
   * dubultklikšķis) ir drošs no-op (`applied:false`), bet JAUNS nodoms prasa JAUNU id.
   * `applied` ļauj izsaucējam auditēt TIKAI reālu izmaiņu (NE idempotentu atkārtojumu — Codex).
   * Iemeslu (`admin_adjust`) enforcē TS tips; cilvēklasāmo pamatojumu glabā audit slānis.
   */
  async adminAdjust(
    userId: string,
    adjustmentId: string,
    delta: number
  ): Promise<{ ok: true; applied: boolean; balance: number } | { ok: false; reason: "insufficient" }> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta,
      reason: "admin_adjust",
      ref: adjustmentId,
      minBalance: 0,
      now: this.clock()
    });
    return result.ok ? { ok: true, applied: result.applied, balance: result.balance } : result;
  }

  /**
   * Pērk kataloga preci (kosmētika, piem. tēma) par `price` monētām (Fāze 4). Atomiski
   * atskaita, ja pietiek (`minBalance: 0`). Idempotents pēc `(userId, theme_purchase,
   * itemId)` — atkārtots/vienlaicīgs pirkums NEdebetē divreiz un paliek īpašumā. Ledger
   * rinda VIENLAIKUS ir debets UN īpašumtiesību ieraksts (exactly-once, bez atsevišķas
   * inventāra tabulas; `UNIQUE(user_id,reason,ref)`). `applied=false` = jau piederēja.
   * `{ ok:false }` ja bilance nepietiek.
   */
  async purchaseItem(
    userId: string,
    itemId: string,
    price: number
  ): Promise<{ ok: true; applied: boolean; balance: number } | { ok: false; reason: "insufficient" }> {
    const result = await this.coins.applyLedger({
      id: this.createId(),
      userId,
      delta: -price,
      reason: "theme_purchase",
      ref: itemId,
      minBalance: 0,
      now: this.clock()
    });
    return result.ok ? { ok: true, applied: result.applied, balance: result.balance } : result;
  }

  /** Lietotāja piederošās preces (itemId), atvasinātas no ledger `theme_purchase` ierakstiem. */
  async listOwnedItems(userId: string): Promise<readonly string[]> {
    return this.coins.listLedgerRefs(userId, "theme_purchase");
  }

  /** Kopā SP balvās nopelnītās monētas pēdējās 24h (dienas griestu pārbaudei). */
  async spRewardLast24h(userId: string, now: number): Promise<number> {
    return this.coins.sumLedgerSince(userId, "sp_reward", now - 24 * 60 * 60 * 1000);
  }

  /**
   * Ieskaita SP balvu ar dienas griestu HARD ierobežojumu, atomiski uz lietotāju
   * (per-user lock). Apgriež (`clamp`) balvu līdz atlikušajam griestu apjomam, lai
   * 24h kopsumma NEKAD nepārsniedz `dailyCap` (arī pie vienlaicīgām spēlēm). Atgriež
   * faktiski piešķirto (var būt daļējs vai 0) + bilanci.
   */
  async creditSpRewardCapped(
    userId: string,
    gameToken: string,
    amount: number,
    dailyCap: number,
    now: number
  ): Promise<{ awarded: number; balance: number }> {
    return this.withUserLock(userId, async () => {
      const earned = await this.spRewardLast24h(userId, now);
      const grantable = Math.max(0, Math.min(amount, dailyCap - earned));
      if (grantable <= 0) {
        return { awarded: 0, balance: await this.getBalance(userId) };
      }
      // Kreditē; `applied=false` nozīmē, ka šim tokenam jau bija ieraksts (idempotents
      // no-op) → ziņojam awarded:0, nevis nepatiesi apgalvojam jaunas monētas.
      const { applied, balance } = await this.creditSpReward(userId, gameToken, grantable);
      return { awarded: applied ? grantable : 0, balance };
    });
  }
}
