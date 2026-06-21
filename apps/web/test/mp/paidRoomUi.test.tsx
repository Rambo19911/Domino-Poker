// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en } from "../../lib/locales/en";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { MpLobbyDialogs } from "../../components/mp/MpLobbyDialogs";
import { RoomFeeChip } from "../../components/mp/RoomFeeChip";

afterEach(cleanup);

const audio = { play: () => {}, isMuted: false, toggleMute: () => {} } as unknown as AudioSettings;

describe("RoomFeeChip (Phase 4 paid-room badge)", () => {
  it("shows the fee with a coin icon when entryFee > 0", () => {
    const { container } = render(<RoomFeeChip entryFee={100} labels={en} />);
    const chip = container.querySelector(".mpRoomFee");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("100");
    expect(chip?.getAttribute("aria-label")).toContain("100");
  });

  it("renders nothing for a free room (entryFee 0)", () => {
    const { container } = render(<RoomFeeChip entryFee={0} labels={en} />);
    expect(container.querySelector(".mpRoomFee")).toBeNull();
  });
});

describe("CreateRoomDialog entry-fee field (Phase 4)", () => {
  it("shows the entry-fee field for a logged-in host (has balance)", () => {
    const { container } = renderAndReturnContainer(5000);
    expect(screen.getByText(en.mpEntryFee)).toBeTruthy();
    expect(container.querySelector(".mpEntryFeeField")).not.toBeNull();
  });

  it("hides the entry-fee field for an anonymous host (no wallet)", () => {
    const { container } = renderAndReturnContainer(undefined);
    expect(container.querySelector(".mpEntryFeeField")).toBeNull();
    expect(screen.queryByText(en.mpEntryFee)).toBeNull();
  });

  it("submits the chosen entry fee through onCreate", () => {
    const onCreate = vi.fn();
    const { container } = renderAndReturnContainer(5000, onCreate);
    const feeInput = container.querySelector<HTMLInputElement>(".mpEntryFeeField input")!;
    fireEvent.change(feeInput, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: en.mpCreateRoom }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ entryFee: 100 });
  });

  it("lets the host clear the rounds field and submit 1 round", () => {
    const onCreate = vi.fn();
    const { container } = renderAndReturnContainer(5000, onCreate);
    const roundsInput = container.querySelector<HTMLInputElement>(".mpFieldRow .mpNumberField input")!;
    // Notīrām (bija 7) — lauks NEDRĪKST uzreiz lēkt atpakaļ uz noklusējumu.
    fireEvent.change(roundsInput, { target: { value: "" } });
    expect(roundsInput.value).toBe("");
    fireEvent.change(roundsInput, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: en.mpCreateRoom }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ numberOfRounds: 1 });
  });

  it("normalizes an out-of-range rounds value to the max on blur", () => {
    const { container } = renderAndReturnContainer(5000);
    const roundsInput = container.querySelector<HTMLInputElement>(".mpFieldRow .mpNumberField input")!;
    fireEvent.change(roundsInput, { target: { value: "999" } });
    fireEvent.blur(roundsInput);
    expect(roundsInput.value).toBe("50"); // saspraudums pie max, kad lauks pamests
  });

  it("falls back to the default rounds when submitted empty", () => {
    const onCreate = vi.fn();
    const { container } = renderAndReturnContainer(5000, onCreate);
    const roundsInput = container.querySelector<HTMLInputElement>(".mpFieldRow .mpNumberField input")!;
    fireEvent.change(roundsInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: en.mpCreateRoom }));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ numberOfRounds: 7 });
  });

  it("blocks submit and warns when the fee exceeds the balance", () => {
    const onCreate = vi.fn();
    const { container } = renderAndReturnContainer(50, onCreate);
    const feeInput = container.querySelector<HTMLInputElement>(".mpEntryFeeField input")!;
    fireEvent.change(feeInput, { target: { value: "9999" } });
    expect(screen.getByText(en.mpEntryFeeTooHigh)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.mpCreateRoom }));
    expect(onCreate).not.toHaveBeenCalled();
  });
});

/** Render helper that also returns the container for class-based queries. */
function renderAndReturnContainer(hostBalance: number | undefined, onCreate = vi.fn()) {
  const result = render(
    <MpLobbyDialogs
      isCreateOpen
      isJoinCodeOpen={false}
      isRulesOpen={false}
      isDeleteRoomOpen={false}
      isConnected
      hostBalance={hostBalance}
      audio={audio}
      labels={en}
      onCreate={onCreate}
      onCancelCreate={() => {}}
      onJoin={() => {}}
      onCancelJoin={() => {}}
      onCloseRules={() => {}}
      onConfirmDeleteRoom={() => {}}
      onCancelDeleteRoom={() => {}}
    />
  );
  return { container: result.container, onCreate };
}
