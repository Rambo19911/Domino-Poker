import type { DominoId } from "./symbols";
import { createDominoId } from "./symbols";

export type DominoTier =
  | "royal-trump"
  | "high-trump"
  | "low-trump"
  | "ace"
  | "high-regular"
  | "mid-regular"
  | "low-regular";

// Fixed strength order from docs/01 section 3.2; index = rank - 1.
const RANK_ORDER: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 1],
  [1, 6],
  [1, 5],
  [1, 4],
  [1, 3],
  [1, 2],
  [0, 1],
  [6, 6],
  [5, 5],
  [4, 4],
  [3, 3],
  [2, 2],
  [0, 6],
  [5, 6],
  [4, 6],
  [3, 6],
  [4, 5],
  [2, 6],
  [3, 5],
  [2, 5],
  [3, 4],
  [2, 4],
  [0, 5],
  [2, 3],
  [0, 4],
  [0, 3],
  [0, 2]
];

const RANK_BY_ID = new Map<DominoId, number>(
  RANK_ORDER.map(([a, b], index) => [createDominoId(a, b), index + 1])
);

export function createDoubleSixSet(): readonly DominoId[] {
  const ids: DominoId[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      ids.push(createDominoId(a, b));
    }
  }
  return ids;
}

export const DOMINO_IDS: readonly DominoId[] = createDoubleSixSet();

export function getDominoRank(id: DominoId): number {
  const rank = RANK_BY_ID.get(id);
  if (rank === undefined) {
    throw new Error(`Unknown domino id: ${id}`);
  }
  return rank;
}

export function getDominoTier(id: DominoId): DominoTier {
  const rank = getDominoRank(id);
  if (rank <= 2) return "royal-trump";
  if (rank <= 5) return "high-trump";
  if (rank <= 8) return "low-trump";
  if (rank <= 14) return "ace";
  if (rank <= 20) return "high-regular";
  if (rank <= 25) return "mid-regular";
  return "low-regular";
}

export function isTrumpDomino(id: DominoId): boolean {
  const tier = getDominoTier(id);
  return tier === "royal-trump" || tier === "high-trump" || tier === "low-trump";
}

export function isAceDomino(id: DominoId): boolean {
  return getDominoTier(id) === "ace";
}
