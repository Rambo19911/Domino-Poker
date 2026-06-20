// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoinBalance } from "../components/CoinBalance";
import { LobbyProfile } from "../components/auth/LobbyProfile";
import type { AuthUser } from "../lib/auth/authApi";
import { getAppStrings } from "../lib/i18n";

afterEach(cleanup);

const t = getAppStrings("en");
const user: AuthUser = { id: "u1", username: "Rihards", avatar: "avatar-01", avatarVersion: 1 };

describe("CoinBalance", () => {
  it("renders the value (formatted) with a coin icon and an accessible label", () => {
    const { container } = render(<CoinBalance value={5000} label="Gold balance" />);
    expect(container.querySelector(".coinBalanceValue")?.textContent).toBe((5000).toLocaleString());
    expect(container.querySelector("svg.coinBalanceIcon")).not.toBeNull();
    expect(container.querySelector(".coinBalance")?.getAttribute("aria-label")).toBe(
      "Gold balance: 5000"
    );
  });
});

describe("LobbyProfile gold balance", () => {
  it("shows the balance under the profile when authenticated", () => {
    const { container } = render(
      <LobbyProfile labels={t} status="authenticated" user={user} balance={5000} onOpen={() => {}} />
    );
    const balance = container.querySelector(".lobbyProfileBalance");
    expect(balance).not.toBeNull();
    expect(balance?.querySelector(".coinBalanceValue")?.textContent).toBe((5000).toLocaleString());
  });

  it("omits the balance when it is not yet loaded (null)", () => {
    const { container } = render(
      <LobbyProfile labels={t} status="authenticated" user={user} balance={null} onOpen={() => {}} />
    );
    expect(container.querySelector(".lobbyProfileBalance")).toBeNull();
  });

  it("renders nothing for anonymous users (no profile, no balance)", () => {
    const { container } = render(
      <LobbyProfile labels={t} status="anonymous" user={null} balance={5000} onOpen={() => {}} />
    );
    expect(container.querySelector(".lobbyProfile")).toBeNull();
  });
});
