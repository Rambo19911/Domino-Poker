import { SLOT_MATH_CONFIG } from '@domino-poker/core/slots';
import type { Coins } from '@domino-poker/core/slots';
import type { LineBet } from '@domino-poker/core/slots';
import type { SpinResult } from '@domino-poker/core/slots';

export type GamePhase =
  | 'BOOT'
  | 'LOADING'
  | 'IDLE'
  | 'SPINNING'
  | 'SETTLING'
  | 'PRESENTING_WIN'
  | 'RULES_OPEN'
  | 'AUTOSPIN_CONFIG'
  | 'ERROR';

export interface AutoSpinState {
  readonly remaining: number;
  readonly stopRequested: boolean;
}

/**
 * Grieziena atteikuma iemesli. Standalone spēlei pietika ar diviem lokāliem
 * gadījumiem; servera-autoritatīvā versijā pievienojas HTTP kļūmes.
 */
export type SpinError = 'NOT_ENOUGH_COINS' | 'SESSION_EXPIRED' | 'RATE_LIMITED' | 'SPIN_FAILED';

export interface GameState {
  readonly phase: GamePhase;
  readonly balance: Coins;
  readonly lineBet: LineBet;
  readonly lastWin: Coins;
  readonly autoSpin: AutoSpinState | null;
  readonly pendingSpin: SpinResult | null;
  readonly error: SpinError | null;
}

export function totalBetOf(lineBet: LineBet): Coins {
  return BigInt(lineBet) * BigInt(SLOT_MATH_CONFIG.activeLines);
}
