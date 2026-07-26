import { describe, expect, it } from "vitest";

import { randomInt, type RandomSource } from "../../src/slots/index";

function sourceOf(values: number[]): RandomSource {
  let index = 0;
  return {
    nextUint32() {
      if (index >= values.length) throw new Error("source exhausted");
      return values[index++] as number;
    }
  };
}

describe("randomInt", () => {
  it("maps values below the rejection limit with modulo", () => {
    expect(randomInt(sourceOf([0]), 128)).toBe(0);
    expect(randomInt(sourceOf([129]), 128)).toBe(1);
    expect(randomInt(sourceOf([123]), 124)).toBe(123);
  });

  it("rejects values at or above the limit and retries", () => {
    const n = 124;
    const limit = Math.floor(2 ** 32 / n) * n;
    expect(randomInt(sourceOf([limit, limit + 5, 7]), n)).toBe(7);
  });

  it("never returns out-of-range results across the boundary", () => {
    const n = 128;
    const limit = Math.floor(2 ** 32 / n) * n;
    expect(limit).toBe(2 ** 32); // 128 divides 2^32 exactly: no rejection region
    expect(randomInt(sourceOf([2 ** 32 - 1]), n)).toBe(127);
  });

  it("rejects invalid bounds", () => {
    expect(() => randomInt(sourceOf([0]), 0)).toThrow();
    expect(() => randomInt(sourceOf([0]), -3)).toThrow();
    expect(() => randomInt(sourceOf([0]), 1.5)).toThrow();
  });
});
