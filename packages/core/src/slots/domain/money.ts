export type Coins = bigint;

/**
 * Multiplies a coin amount by a paytable multiplier stored in hundredths.
 * Allowed line bets are multiples of 20, which (together with the paytable
 * validation rules) makes the division always exact; a non-zero remainder
 * means a configuration bug and must throw. See paytable.ts validateBetSteps.
 */
export function multiplyByHundredths(amount: Coins, hundredths: number): Coins {
  if (!Number.isInteger(hundredths) || hundredths < 0) {
    throw new Error(`Invalid multiplier hundredths: ${hundredths}`);
  }
  const product = amount * BigInt(hundredths);
  if (product % 100n !== 0n) {
    throw new Error(`Non-integer coin result: ${amount} * ${hundredths} / 100`);
  }
  return product / 100n;
}
