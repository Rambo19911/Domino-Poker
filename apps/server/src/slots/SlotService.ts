import { randomFillSync } from "node:crypto";

import {
  SLOT_MATH_CONFIG,
  evaluateSpin,
  generateGrid,
  type Grid,
  type LineBet,
  type LineOutcome,
  type RandomSource
} from "@domino-poker/core/slots";

import type { WalletService } from "../wallet/WalletService.js";

/**
 * Domino Slots aplikācijas slānis. **Serveris ir vienīgā autoritāte**: RNG, režģis un
 * laimests tiek ģenerēti ŠEIT no `@domino-poker/core/slots`, un klients nesūta neko
 * citu kā `spinId` + `lineBet`. Norēķins iet caur `WalletService.settleSlotSpin`, kas
 * likmi, izmaksu un auditu ieraksta vienā transakcijā.
 *
 * Atkārtojums: atbilde vienmēr tiek būvēta no NORĒĶINĀTĀ ieraksta (`result.spin`), ne no
 * tikko ģenerētā režģa. Tāpēc atkārtots `spinId` klientam parāda tieši to iznākumu, par
 * kuru tika samaksāts.
 */

/** Viena līnija, JSON-drošā formā (`winCoins` no `bigint` uz `number`). */
export interface SlotLineView {
  readonly lineIndex: number;
  readonly category: string | null;
  readonly startColumn: number;
  readonly length: number;
  readonly targetSymbol: string | null;
  readonly multiplierHundredths: number;
  readonly winCoins: number;
}

/** Grieziens klientam. Režģis satur `fromFullWildColumn`, ko renderētājs animē. */
export interface SlotSpinView {
  readonly spinId: string;
  readonly lineBet: number;
  readonly totalBet: number;
  readonly payout: number;
  readonly grid: Grid;
  readonly lines: readonly SlotLineView[];
  readonly jackpotCount: number;
  readonly scatterWin: number;
  readonly mathVersion: string;
}

export type SlotSpinOutcome =
  | { readonly ok: true; readonly applied: boolean; readonly balance: number; readonly spin: SlotSpinView }
  | { readonly ok: false; readonly reason: "insufficient"; readonly balance: number }
  | { readonly ok: false; readonly reason: "unsupported" };

/** `winsJson` krava — viss, kas nav jau atsevišķā `slot_spins` kolonnā. */
interface StoredWins {
  readonly lines: readonly SlotLineView[];
  readonly jackpotCount: number;
  readonly scatterWin: number;
}

export interface SlotServiceOptions {
  readonly wallet: WalletService;
  /** Injicējams testiem; produkcijā noklusējums ir `crypto`-balstīts avots. */
  readonly random?: RandomSource;
}

/**
 * Buferēts kriptogrāfiskais avots. `Math.random` NETIEK lietots nekad — iznākums ir
 * nauda, tāpēc vajadzīgs CSPRNG (docs/01 sadaļa 8).
 */
export function createCryptoRandomSource(bufferWords = 256): RandomSource {
  const buffer = new Uint32Array(bufferWords);
  let index = buffer.length;
  return {
    nextUint32(): number {
      if (index >= buffer.length) {
        randomFillSync(buffer);
        index = 0;
      }
      return buffer[index++] as number;
    }
  };
}

/** Atļautās likmes; tas pats avots, ko lieto maršruta Zod shēma. */
const LINE_BETS: ReadonlySet<number> = new Set(SLOT_MATH_CONFIG.lineBetSteps);

/** `bigint` → `number` ar sargu; monētas vienmēr ietilpst, bet kļūda nedrīkst būt klusa. */
function toSafeNumber(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) {
    throw new Error(`Slot ${name} out of safe range: ${value}`);
  }
  return Number(value);
}

function toLineView(line: LineOutcome): SlotLineView {
  return {
    lineIndex: line.lineIndex,
    category: line.category,
    startColumn: line.startColumn,
    length: line.length,
    targetSymbol: line.targetSymbol,
    multiplierHundredths: line.multiplierHundredths,
    winCoins: toSafeNumber(line.winCoins, "line win")
  };
}

export class SlotService {
  private readonly wallet: WalletService;
  private readonly random: RandomSource;

  constructor(options: SlotServiceOptions) {
    this.wallet = options.wallet;
    this.random = options.random ?? createCryptoRandomSource();
  }

  /**
   * Ģenerē un norēķina vienu griezienu. `lineBet` JAU jābūt validētam pret
   * `SLOT_MATH_CONFIG.lineBetSteps` maršruta robežā — evaluators paļaujas uz to, jo
   * neatļauta likme izraisītu daļskaitļa monētas (sk. `betScale.test.ts`).
   */
  async spin(userId: string, spinId: string, lineBet: LineBet): Promise<SlotSpinOutcome> {
    // Aizsardzība dziļumā: `LineBet` savienojums pazūd kompilācijā, tāpēc netipēts vai
    // nākotnes izsaucējs varētu padot neatļautu likmi. Maršruts to jau validē, bet
    // invariants pieder ŠIM slānim, jo tieši šeit tas tiek nodots evaluatoram.
    if (!(LINE_BETS as ReadonlySet<number>).has(lineBet)) {
      throw new Error(`Unsupported slot line bet: ${lineBet}`);
    }
    const grid = generateGrid(this.random);
    const evaluation = evaluateSpin(grid, lineBet);
    const totalBet = toSafeNumber(evaluation.totalBet, "total bet");
    const payout = toSafeNumber(evaluation.totalWin, "payout");
    const wins: StoredWins = {
      lines: evaluation.lines.map(toLineView),
      jackpotCount: evaluation.jackpotCount,
      scatterWin: toSafeNumber(evaluation.scatterWin, "scatter win")
    };

    const result = await this.wallet.settleSlotSpin({
      userId,
      spinId,
      lineBet,
      totalBet,
      payout,
      gridJson: JSON.stringify(grid),
      winsJson: JSON.stringify(wins),
      mathVersion: SLOT_MATH_CONFIG.mathVersion
    });
    if (!result.ok) return result;

    // Vienmēr no IERAKSTĪTĀ, ne no `grid`/`wins` augstāk: atkārtojumā tie atšķiras.
    const stored = JSON.parse(result.spin.winsJson) as StoredWins;
    return {
      ok: true,
      applied: result.applied,
      balance: result.balance,
      spin: {
        spinId: result.spin.spinId,
        lineBet: result.spin.lineBet,
        totalBet: result.spin.totalBet,
        payout: result.spin.payout,
        grid: JSON.parse(result.spin.gridJson) as Grid,
        lines: stored.lines,
        jackpotCount: stored.jackpotCount,
        scatterWin: stored.scatterWin,
        mathVersion: result.spin.mathVersion
      }
    };
  }
}
