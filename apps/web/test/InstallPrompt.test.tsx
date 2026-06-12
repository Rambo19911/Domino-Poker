// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallPrompt } from "../components/InstallPrompt";
import type { AppStrings } from "../lib/i18n";

const t = {
  installPromptTitle: "install-title",
  installPromptText: "install-text",
  installPromptInstall: "install-button",
  installPromptDismiss: "dismiss-button",
  installPromptIosHint: "ios-hint"
} as unknown as AppStrings;

const SNOOZE_KEY = "domino-poker-install-snooze";

function fakePromptEvent(outcome: "accepted" | "dismissed") {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome })
  } as unknown as NonNullable<Window["__dominoInstallPromptEvent"]>;
}

describe("InstallPrompt (PWA install banner)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__dominoInstallPromptEvent = undefined;
  });

  afterEach(() => {
    cleanup();
    window.__dominoInstallPromptEvent = undefined;
  });

  it("renders nothing when no install event was captured (e.g. already installed)", () => {
    // `beforeinstallprompt` NEizšaujas instalētā aplikācijā → events nav notverts.
    render(<InstallPrompt labels={t} />);
    expect(screen.queryByText("install-text")).toBeNull();
  });

  it("shows the Android banner when the early-captured event is present", () => {
    window.__dominoInstallPromptEvent = fakePromptEvent("accepted");
    render(<InstallPrompt labels={t} />);
    expect(screen.getByText("install-text")).toBeTruthy();
    expect(screen.getByText("install-button")).toBeTruthy();
  });

  it("shows the banner when the event arrives AFTER mount (late installability)", () => {
    render(<InstallPrompt labels={t} />);
    expect(screen.queryByText("install-text")).toBeNull();

    window.__dominoInstallPromptEvent = fakePromptEvent("accepted");
    act(() => {
      window.dispatchEvent(new Event("domino:installprompt"));
    });
    expect(screen.getByText("install-text")).toBeTruthy();
  });

  it("dismiss hides the banner, writes a snooze, and a remount stays hidden", () => {
    window.__dominoInstallPromptEvent = fakePromptEvent("accepted");
    render(<InstallPrompt labels={t} />);

    act(() => {
      screen.getByText("dismiss-button").click();
    });
    expect(screen.queryByText("install-text")).toBeNull();
    expect(window.localStorage.getItem(SNOOZE_KEY)).toBeTruthy();

    // Atkārtots mount snooze periodā → banneris nerādās (nav uzbāzīgs).
    cleanup();
    render(<InstallPrompt labels={t} />);
    expect(screen.queryByText("install-text")).toBeNull();
  });

  it("snoozes when the BROWSER prompt is dismissed (not only our button)", async () => {
    const event = fakePromptEvent("dismissed");
    window.__dominoInstallPromptEvent = event;
    render(<InstallPrompt labels={t} />);

    await act(async () => {
      screen.getByText("install-button").click();
      await Promise.resolve(); // ļauj userChoice noresolvoties
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SNOOZE_KEY)).toBeTruthy();
    expect(screen.queryByText("install-text")).toBeNull();
  });

  it("does NOT snooze when the browser prompt is accepted", async () => {
    window.__dominoInstallPromptEvent = fakePromptEvent("accepted");
    render(<InstallPrompt labels={t} />);

    await act(async () => {
      screen.getByText("install-button").click();
      await Promise.resolve();
    });
    expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    expect(screen.queryByText("install-text")).toBeNull();
  });
});
