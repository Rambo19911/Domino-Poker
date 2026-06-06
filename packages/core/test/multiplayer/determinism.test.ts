import { describe, expect, it } from "vitest";

import { tileKey } from "../../src/dominoTile";
import {
  createSeededRng,
  shuffleMultiplayerDominoSet
} from "../../src/multiplayer/determinism";

describe("multiplayer determinism", () => {
  it("produces a stable random sequence for the same seed", () => {
    const first = createSeededRng("room-1-round-1");
    const second = createSeededRng("room-1-round-1");

    expect(Array.from({ length: 8 }, () => first())).toEqual(
      Array.from({ length: 8 }, () => second())
    );
  });

  it("shuffles dominoes identically for the same seed", () => {
    const first = shuffleMultiplayerDominoSet("room-1-round-1").map(tileKey);
    const second = shuffleMultiplayerDominoSet("room-1-round-1").map(tileKey);

    expect(first).toEqual(second);
  });

  it("preserves the existing seeded multiplayer shuffle order", () => {
    expect(shuffleMultiplayerDominoSet("room-1-round-1").map(tileKey)).toEqual([
      "5-6",
      "3-4",
      "3-5",
      "3-6",
      "2-4",
      "2-5",
      "2-6",
      "3-3",
      "0-5",
      "0-6",
      "1-1",
      "1-2",
      "1-3",
      "0-2",
      "0-3",
      "0-4",
      "6-6",
      "0-0",
      "0-1",
      "1-4",
      "1-5",
      "1-6",
      "2-2",
      "2-3",
      "4-4",
      "4-5",
      "4-6",
      "5-5"
    ]);
  });

  it("keeps a full unique domino set after deterministic shuffle", () => {
    const shuffled = shuffleMultiplayerDominoSet("room-1-round-1").map(tileKey);

    expect(shuffled).toHaveLength(28);
    expect(new Set(shuffled).size).toBe(28);
  });

  it("rejects empty multiplayer seeds", () => {
    expect(() => shuffleMultiplayerDominoSet("")).toThrow(
      "Multiplayer seed must not be empty."
    );
  });
});
