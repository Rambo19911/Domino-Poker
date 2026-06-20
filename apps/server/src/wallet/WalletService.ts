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

  constructor(options: WalletServiceOptions) {
    this.coins = options.coins;
    this.clock = options.clock;
    this.createId = options.createId ?? (() => randomUUID());
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
}
