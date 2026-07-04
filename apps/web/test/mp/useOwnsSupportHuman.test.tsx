// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { SUPPORT_HUMAN_ITEM_ID } from "@domino-poker/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store/storeApi", () => ({ apiFetchOwned: vi.fn() }));
import { apiFetchOwned } from "../../lib/store/storeApi";
import { useOwnsSupportHuman } from "../../lib/store/useOwnsSupportHuman";

beforeEach(() => {
  vi.mocked(apiFetchOwned).mockReset();
});

describe("useOwnsSupportHuman (B daļa)", () => {
  it("is false for an anonymous user (no fetch)", () => {
    const { result } = renderHook(() => useOwnsSupportHuman(null));
    expect(result.current).toBe(false);
    expect(apiFetchOwned).not.toHaveBeenCalled();
  });

  it("becomes true once /store/owned confirms ownership", async () => {
    vi.mocked(apiFetchOwned).mockResolvedValue({ ok: true, data: { owned: [SUPPORT_HUMAN_ITEM_ID] } });
    const { result } = renderHook(({ token }) => useOwnsSupportHuman(token), {
      initialProps: { token: "tok-a" as string | null }
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays false when the user does not own the bot", async () => {
    vi.mocked(apiFetchOwned).mockResolvedValue({ ok: true, data: { owned: ["theme.rain"] } });
    const { result } = renderHook(() => useOwnsSupportHuman("tok-a"));
    await waitFor(() => expect(apiFetchOwned).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("resets to false on token change and stays false if the new fetch errors", async () => {
    vi.mocked(apiFetchOwned).mockResolvedValueOnce({ ok: true, data: { owned: [SUPPORT_HUMAN_ITEM_ID] } });
    const { result, rerender } = renderHook(({ token }) => useOwnsSupportHuman(token), {
      initialProps: { token: "tok-a" as string | null }
    });
    await waitFor(() => expect(result.current).toBe(true));

    // Jauns lietotājs; /store/owned atgriež kļūdu → īpašnieka `true` NEnoplūst.
    vi.mocked(apiFetchOwned).mockResolvedValueOnce({ ok: false, status: 500, error: "err" });
    rerender({ token: "tok-b" });
    expect(result.current).toBe(false); // sinhrona atiestatīšana pie tokena maiņas
    await waitFor(() => expect(result.current).toBe(false));
  });
});
