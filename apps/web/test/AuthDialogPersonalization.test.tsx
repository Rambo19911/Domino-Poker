// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog, type AuthDialogProps } from "../components/auth/AuthDialog";
import type { AuthUser } from "../lib/auth/authApi";
import { en } from "../lib/locales/en";

const user: AuthUser = { id: "u1", username: "Rihards", avatar: "avatar-01" };

function makeProps(overrides: Partial<AuthDialogProps> = {}): AuthDialogProps {
  return {
    labels: en,
    locale: "en",
    status: "authenticated",
    user,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    onClose: vi.fn(),
    playClick: vi.fn(),
    ...overrides
  };
}

describe("AuthDialog — Personalization tab (theme switcher)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
  });

  it("shows a Personalization tab for authenticated users with the Default theme selected", () => {
    render(<AuthDialog {...makeProps()} />);
    const tab = screen.getByRole("tab", { name: "Personalization" });
    act(() => tab.click());

    const radio = screen.getByRole("radio", { name: "Default" }) as HTMLInputElement;
    expect(radio.checked).toBe(true); // vienīgā tēma, atzīmēta
  });

  it("does NOT show the Personalization tab for anonymous users", () => {
    render(<AuthDialog {...makeProps({ status: "anonymous", user: null })} />);
    expect(screen.queryByRole("tab", { name: "Personalization" })).toBeNull();
  });

  it("selecting the default theme is a no-op (no data-theme attr, no stored key)", () => {
    render(<AuthDialog {...makeProps()} />);
    act(() => screen.getByRole("tab", { name: "Personalization" }).click());

    // Klikšķis uz jau-izvēlētās noklusējuma tēmas neko nemaina (selectTheme early-return).
    act(() => (screen.getByRole("radio", { name: "Default" }) as HTMLInputElement).click());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("domino-poker-theme")).toBeNull();
  });
});
