// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DominoTile } from "@domino-poker/core";
import type { MpTrickPlay } from "../../lib/mp/gameTableView";
import { useTrickFreeze } from "../../lib/mp/useTrickFreeze";

function play(side1: number, side2: number): MpTrickPlay {
  return {
    gameSeatIndex: 0,
    visualSeat: 0,
    displayId: undefined,
    isAI: false,
    tile: { side1, side2 } as DominoTile,
    declaredNumber: undefined
  };
}

type Input = {
  completedTrickCount: number;
  lastCompletedTrick: readonly MpTrickPlay[] | undefined;
  trick: readonly MpTrickPlay[];
};

const liveTrick = [play(1, 1)];
const completed = [play(2, 2), play(3, 3), play(4, 4), play(5, 5)];

function renderFreeze(initial: Input) {
  return renderHook(({ table }: { table: Input }) => useTrickFreeze(table), {
    initialProps: { table: initial }
  });
}

describe("useTrickFreeze (client trick-completion hold)", () => {
  beforeEach(() => vi.useFakeTimers());
  // cleanup() PIRMS useRealTimers(): hooka cleanup (clearTimeout) jānostrādā, kamēr
  // fake pulkstenis vēl aktīvs (nav globāla afterEach → RTL auto-cleanup neizpildās).
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does NOT freeze on initial mount even when completedTrickCount is already nonzero", () => {
    const { result } = renderFreeze({ completedTrickCount: 3, lastCompletedTrick: completed, trick: liveTrick });
    expect(result.current.frozen).toBe(false);
    expect(result.current.displayTrick).toBe(liveTrick); // rāda dzīvo triku, ne aizturēto
  });

  it("freezes the last completed trick when completedTrickCount increases, then clears after 1500ms", () => {
    const { result, rerender } = renderFreeze({ completedTrickCount: 0, lastCompletedTrick: undefined, trick: liveTrick });
    expect(result.current.frozen).toBe(false);

    // Triks pabeigts: skaitlis pieaug, serveris jau notīrīja `trick` ([]).
    act(() => rerender({ table: { completedTrickCount: 1, lastCompletedTrick: completed, trick: [] } }));
    expect(result.current.frozen).toBe(true);
    expect(result.current.displayTrick).toBe(completed); // aizturēts pabeigtais triks

    act(() => vi.advanceTimersByTime(1499));
    expect(result.current.frozen).toBe(true); // vēl aizturēts
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.frozen).toBe(false); // izgaisis pēc 1500 ms
    expect(result.current.displayTrick).toEqual([]); // atgriežas pie dzīvā (tukšā) trika
  });

  it("does NOT freeze when completedTrickCount is unchanged (re-render with same count)", () => {
    const { result, rerender } = renderFreeze({ completedTrickCount: 2, lastCompletedTrick: completed, trick: liveTrick });
    act(() => rerender({ table: { completedTrickCount: 2, lastCompletedTrick: completed, trick: liveTrick } }));
    expect(result.current.frozen).toBe(false);
  });
});
