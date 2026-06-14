export function score(bid: number, taken: number): number {
  if (!Number.isInteger(bid) || bid < 0 || bid > 7) {
    throw new RangeError(`Bid must be an integer from 0 to 7: ${bid}`);
  }

  if (!Number.isInteger(taken) || taken < 0 || taken > 7) {
    throw new RangeError(`Taken tricks must be an integer from 0 to 7: ${taken}`);
  }

  if (bid === 7) {
    return taken === 7 ? 155 : -50;
  }

  if (taken === bid) {
    return bid * 15;
  }

  if (taken > bid) {
    return taken * 5;
  }

  return (taken - bid) * 5;
}
