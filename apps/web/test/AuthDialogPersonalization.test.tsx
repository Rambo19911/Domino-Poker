// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    getToken: vi.fn(() => "test-token"),
    balance: 1_000_000, // > THEME_PRICE → "Pirkt" pogas iespējotas
    onBalanceChange: vi.fn(),
    onClose: vi.fn(),
    playClick: vi.fn(),
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Maršrutē `/store/owned` (GET) un `/store/buy` (POST) atbildes testa fetch mock-am. */
function mockStoreFetch(opts: { owned?: string[]; buyStatus?: number; buyBody?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/store/owned")) {
        return jsonResponse({ owned: opts.owned ?? [] });
      }
      if (u.endsWith("/store/buy")) {
        return jsonResponse(
          opts.buyBody ?? { owned: true, alreadyOwned: false, balance: 0 },
          opts.buyStatus ?? 200
        );
      }
      return jsonResponse({}, 404);
    })
  );
}

function openPersonalization(): void {
  act(() => screen.getByRole("tab", { name: "Personalization" }).click());
}

describe("AuthDialog — Personalization tab (theme switcher + store)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockStoreFetch({ owned: [] }); // noklusējums: nekas nepieder
  });
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it("shows a Personalization tab for authenticated users with the Default theme selected", () => {
    render(<AuthDialog {...makeProps()} />);
    openPersonalization();
    const radio = screen.getByRole("radio", { name: "Default" }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("does NOT show the Personalization tab for anonymous users", () => {
    render(<AuthDialog {...makeProps({ status: "anonymous", user: null })} />);
    expect(screen.queryByRole("tab", { name: "Personalization" })).toBeNull();
  });

  it("selecting the default theme is a no-op (no data-theme attr, no stored key)", () => {
    render(<AuthDialog {...makeProps()} />);
    openPersonalization();
    act(() => (screen.getByRole("radio", { name: "Default" }) as HTMLInputElement).click());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("domino-poker-theme")).toBeNull();
  });

  it("free Default is selectable; unowned purchasable themes are locked with a Buy button", () => {
    render(<AuthDialog {...makeProps()} />);
    openPersonalization();
    // Default = vienīgā izvēlamā (radio); 6 pērkamās = bloķētas (nav radio), katra ar "Buy".
    expect(screen.getByRole("radio", { name: "Default" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Bubbles" })).toBeNull();
    expect(screen.getAllByRole("button", { name: new RegExp(en.themeBuy) })).toHaveLength(6);
  });

  it("owned themes are selectable (no Buy button)", () => {
    mockStoreFetch({ owned: ["theme.bubbles"] });
    render(<AuthDialog {...makeProps()} />);
    openPersonalization();
    // Pēc /store/owned ielādes Bubbles kļūst par izvēlamu radio.
    return waitFor(() => {
      expect(screen.getByRole("radio", { name: "Bubbles" })).toBeTruthy();
      expect(screen.getAllByRole("button", { name: new RegExp(en.themeBuy) })).toHaveLength(5);
    });
  });

  it("buying a theme unlocks it, applies it, and reports the new balance", async () => {
    const onBalanceChange = vi.fn();
    mockStoreFetch({ owned: [], buyBody: { owned: true, alreadyOwned: false, balance: 800_000 } });
    render(<AuthDialog {...makeProps({ onBalanceChange })} />);
    openPersonalization();

    act(() => screen.getAllByRole("button", { name: new RegExp(en.themeBuy) })[0]?.click());

    await waitFor(() => expect(onBalanceChange).toHaveBeenCalledWith(800_000));
    // Nopirktā tēma kļūst izvēlama (radio) → kopā 2 izvēlami (Default + nopirktā).
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(2));
  });

  it("shows an error when the purchase is rejected for insufficient coins", async () => {
    const onBalanceChange = vi.fn();
    mockStoreFetch({ owned: [], buyStatus: 402, buyBody: { error: "insufficient_coins", balance: 100 } });
    render(<AuthDialog {...makeProps({ onBalanceChange })} />);
    openPersonalization();

    act(() => screen.getAllByRole("button", { name: new RegExp(en.themeBuy) })[0]?.click());

    expect((await screen.findByRole("alert")).textContent).toContain(en.themeInsufficientCoins);
    expect(onBalanceChange).not.toHaveBeenCalled();
  });

  it("reconciles: a stored unowned theme resets to Default after ownership loads", async () => {
    window.localStorage.setItem("domino-poker-theme", "bubbles");
    mockStoreFetch({ owned: [] }); // bubbles nepieder
    render(<AuthDialog {...makeProps()} />);
    openPersonalization();

    await waitFor(() => {
      expect(window.localStorage.getItem("domino-poker-theme")).toBeNull();
      expect((screen.getByRole("radio", { name: "Default" }) as HTMLInputElement).checked).toBe(true);
    });
  });
});
