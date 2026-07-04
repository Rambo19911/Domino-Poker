// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { HintDeniedEvent, HintGrantedEvent } from "@domino-poker/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameSnapshot } from "../../lib/mp/clientView";
import { useMpHint, type UseMpHintParams } from "../../lib/mp/useMpHint";

// Mock bota aprēķinu (izvairās no Web Worker testā); atgriež fiksētu gājienu 1-2 (calledPip 3).
vi.mock("../../lib/mp/botView", () => ({
  computeMpHint: vi.fn(() => Promise.resolve({ tile: { side1: 1, side2: 2 }, declaredNumber: 3 }))
}));
import { computeMpHint } from "../../lib/mp/botView";

const snapshot = {} as GameSnapshot;

function setup(overrides: Partial<UseMpHintParams> = {}) {
  let handler: ((event: HintGrantedEvent | HintDeniedEvent) => void) | undefined;
  const requestHint = vi.fn<() => string | undefined>(() => "req-1");
  const base: UseMpHintParams = {
    snapshot,
    turnId: "t1",
    currentRound: 1,
    isViewerMoveTurn: true,
    owned: true,
    requestHint,
    registerHintResponse: (h) => {
      handler = h;
    }
  };
  const { result, rerender } = renderHook((props: UseMpHintParams) => useMpHint(props), {
    initialProps: { ...base, ...overrides }
  });
  return { result, rerender, requestHint, base, emit: (event: HintGrantedEvent | HintDeniedEvent) => act(() => handler?.(event)) };
}

const granted = (requestId: string, hintsRemaining: number): HintGrantedEvent => ({
  type: "HINT_GRANTED",
  roomId: "room-1",
  requestId,
  turnId: "t1",
  hintsRemaining
});

beforeEach(() => {
  vi.mocked(computeMpHint).mockClear();
  vi.mocked(computeMpHint).mockResolvedValue({ tile: { side1: 1, side2: 2 }, declaredNumber: 3 });
});

describe("useMpHint (B daļa)", () => {
  it("starts with a full quota, enabled on the viewer's move turn", () => {
    const { result } = setup();
    expect(result.current.hintsRemaining).toBe(3);
    expect(result.current.hintEnabled).toBe(true);
    expect(result.current.recommendedTileKey).toBeNull();
  });

  it("requests a hint, then highlights the computed move on HINT_GRANTED", async () => {
    const { result, requestHint, emit } = setup();
    act(() => result.current.useHint());
    expect(requestHint).toHaveBeenCalledTimes(1);
    expect(result.current.hintComputing).toBe(true);

    emit(granted("req-1", 2));

    await waitFor(() => expect(result.current.recommendedTileKey).toBe("1-2"));
    expect(result.current.recommendedDeclaredNumber).toBe(3);
    expect(result.current.hintsRemaining).toBe(2);
    expect(result.current.hintComputing).toBe(false);
    expect(computeMpHint).toHaveBeenCalledTimes(1);
  });

  it("syncs the counter to zero on a no_quota denial (no compute)", () => {
    const { result, emit } = setup();
    act(() => result.current.useHint());
    emit({ type: "HINT_DENIED", roomId: "room-1", requestId: "req-1", reason: "no_quota", hintsRemaining: 0 });

    expect(result.current.hintsRemaining).toBe(0);
    expect(result.current.hintComputing).toBe(false);
    expect(computeMpHint).not.toHaveBeenCalled();
  });

  it("ignores a response whose requestId does not match the latest request (D9)", () => {
    const { result, emit } = setup();
    act(() => result.current.useHint());
    emit(granted("stale-req", 2)); // cits requestId → ignorēts

    expect(result.current.recommendedTileKey).toBeNull();
    expect(result.current.hintsRemaining).toBe(3); // skaitītājs nemainās
    expect(computeMpHint).not.toHaveBeenCalled();
  });

  it("drops a stale computed hint when the turn changed before it resolved (D11)", async () => {
    let resolveCompute: (move: { tile: { side1: number; side2: number }; declaredNumber: number | undefined }) => void = () => {};
    vi.mocked(computeMpHint).mockReturnValue(
      new Promise((resolve) => {
        resolveCompute = resolve;
      })
    );
    const { result, rerender, base, emit } = setup();
    act(() => result.current.useHint());
    emit(granted("req-1", 2));
    // Turns mainās, kamēr worker vēl rēķina.
    rerender({ ...base, turnId: "t2" });
    await act(async () => {
      resolveCompute({ tile: { side1: 1, side2: 2 }, declaredNumber: 3 });
    });

    expect(result.current.recommendedTileKey).toBeNull(); // novecojis rezultāts netiek pielietots
    expect(result.current.hintComputing).toBe(false);
  });

  it("resets the quota and clears the recommendation on a new round", async () => {
    const { result, rerender, base, emit } = setup();
    act(() => result.current.useHint());
    emit(granted("req-1", 2));
    await waitFor(() => expect(result.current.recommendedTileKey).toBe("1-2"));

    rerender({ ...base, currentRound: 2 });

    expect(result.current.hintsRemaining).toBe(3);
    expect(result.current.recommendedTileKey).toBeNull();
  });

  it("does not double-spend on two rapid useHint() calls before a response (synchronous guard)", () => {
    const { result, requestHint } = setup();
    act(() => {
      result.current.useHint();
      result.current.useHint(); // otrais tajā pašā tickā — inFlightRef bloķē
    });
    expect(requestHint).toHaveBeenCalledTimes(1);
  });

  it("does not request when it is not the viewer's move turn", () => {
    const { result, requestHint } = setup({ isViewerMoveTurn: false });
    act(() => result.current.useHint());
    expect(requestHint).not.toHaveBeenCalled();
    expect(result.current.hintEnabled).toBe(false);
  });
});
