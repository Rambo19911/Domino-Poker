export type ShuffleRng = () => number;

export function shuffleWithCutAndOverhand<T>(
  items: readonly T[],
  rng: ShuffleRng
): T[] {
  const cutItems = randomCut(items, rng);
  const mixedItems = overhandShuffle(cutItems, rng);
  return randomCut(mixedItems, rng);
}

function randomCut<T>(items: readonly T[], rng: ShuffleRng): T[] {
  if (items.length <= 1) return [...items];
  const cutIndex = Math.floor(rng() * items.length);
  return [...items.slice(cutIndex), ...items.slice(0, cutIndex)];
}

function overhandShuffle<T>(items: readonly T[], rng: ShuffleRng): T[] {
  const source = [...items];
  let mixed: T[] = [];
  const minPacketSize = 2;
  const maxPacketSize = 6;

  while (source.length > 0) {
    const packetSize = Math.min(
      source.length,
      minPacketSize + Math.floor(rng() * (maxPacketSize - minPacketSize + 1))
    );
    const packet = source.splice(0, packetSize);
    mixed = rng() < 0.75 ? [...packet, ...mixed] : [...mixed, ...packet];
  }

  return mixed;
}
