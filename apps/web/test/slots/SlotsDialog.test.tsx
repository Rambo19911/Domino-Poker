// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SlotsGameProps } from "../../components/slots/SlotsGame";
import type { AppStrings } from "../../lib/i18n";
import type { AudioSettings } from "../../lib/useAudioSettings";

/**
 * T7.8 — `SlotsDialog` dzīves cikls. Pixi netiek montēts: šie testi pārbauda tieši to
 * robežu, ko Fāze 6 uzbūvēja ap spēli — kad spēle vispār dzīvo, kad tā drīkst likt
 * likmi un kuras bilances publikācijas sasniedz lobiju.
 *
 * `SlotsGameLoader` ir aizstāts ar mock, kas tikai pieraksta saņemtos props; reālais
 * ielādētājs velk PixiJS un 4,5 MiB grafiku, kas jsdom/happy-dom vidē nav ne iespējams,
 * ne jēdzīgs.
 */

const mounted: SlotsGameProps[] = [];

vi.mock("../../components/slots/SlotsGameLoader", () => ({
  default: (props: SlotsGameProps) => {
    mounted.push(props);
    return <div data-testid="slots-game" />;
  }
}));

const { SlotsDialog } = await import("../../components/SlotsDialog");
const { PresenceContext } = await import("../../components/usePresence");

const t = { close: "close-label" } as unknown as AppStrings;
const audio = { play: vi.fn(), isMuted: false, effectsVolume: 0.5 } as unknown as AudioSettings;

/** Vienīgais, ko `canWager` no matchMedia lasa, ir `matches`. */
function setCompactViewport(compact: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: compact,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }) as unknown as typeof window.matchMedia;
}

function renderDialog(
  overrides: {
    balance?: number | null;
    getToken?: () => string | undefined;
    onBalanceChange?: (next: number) => void;
    onClose?: () => void;
    status?: "open" | "closing";
  } = {}
) {
  const {
    balance = 5_000,
    getToken = () => "token-a",
    onBalanceChange = vi.fn(),
    onClose = vi.fn(),
    status = "open"
  } = overrides;

  const view = render(
    <PresenceContext.Provider value={status}>
      <SlotsDialog
        audio={audio}
        labels={t}
        getToken={getToken}
        balance={balance}
        onBalanceChange={onBalanceChange}
        onClose={onClose}
      />
    </PresenceContext.Provider>
  );
  return { view, onBalanceChange, onClose };
}

describe("SlotsDialog (T7.8)", () => {
  beforeEach(() => {
    mounted.length = 0;
    setCompactViewport(false);
  });

  afterEach(cleanup);

  it("negaida ar spēli, kamēr bilance nav autoritatīva", () => {
    // `null` = `/auth/me` vēl nav atbildējis. Montēt spēli nozīmētu rādīt izdomātu
    // skaitli HUD, tāpēc tiek rādīts vietturis.
    renderDialog({ balance: null });

    expect(screen.queryByTestId("slots-game")).toBeNull();
    expect(mounted).toHaveLength(0);
  });

  it("montē spēli, tiklīdz bilance ir zināma", () => {
    renderDialog({ balance: 5_000 });

    expect(screen.getByTestId("slots-game")).toBeTruthy();
    expect(mounted[0]?.initialBalance).toBe(5_000);
  });

  it("atmontē spēli UZREIZ izejas fāzē, nevis gaida 200 ms animāciju", () => {
    renderDialog({ status: "closing" });

    expect(screen.queryByTestId("slots-game")).toBeNull();
  });

  it("aizvēršanas klikšķis SINHRONI aizver naudas vārtu", () => {
    // Šis ir Fāzes 6 centrālais invariants: pēc aizvēršanas nodoma `getToken` atdod
    // `null`, un `SlotsGame.spin` pārtrauc PIRMS jebkura HTTP izsaukuma.
    const { onClose } = renderDialog();
    const gate = mounted[0];
    expect(gate?.getToken()).toBe("token-a");

    fireEvent.click(screen.getByLabelText("close-label"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(gate?.getToken()).toBeNull();
  });

  it("bloķē likmi, kad viewport ir zem darbvirsmas sliekšņa", () => {
    // `LobbyScreen` aizver dialogu caur `setSlotsOpen(false)`, kas NEIET caur
    // `handleClose`; slieksnis tāpēc jāmēra tieši izsaukuma brīdī.
    renderDialog();
    const gate = mounted[0];
    expect(gate?.getToken()).toBe("token-a");

    setCompactViewport(true);

    expect(gate?.getToken()).toBeNull();
  });

  it("nesūta bilanci lobijam, ja sesija ir mainījusies", () => {
    // Novēlots norēķins pēc logout/login pieder CITAM kontam.
    let token: string | undefined = "token-a";
    const { onBalanceChange } = renderDialog({ getToken: () => token });

    token = "token-b";
    mounted[0]?.onBalanceChange(999);

    expect(onBalanceChange).not.toHaveBeenCalled();
  });

  it("nesūta bilanci lobijam, ja jaunāka spēle jau ir pārņēmusi", () => {
    const first = renderDialog();
    const stale = mounted[0];
    cleanup();
    renderDialog();

    stale?.onBalanceChange(111);

    expect(first.onBalanceChange).not.toHaveBeenCalled();
  });

  it("sūta bilanci, kad sesija sakrīt un jaunākas spēles nav (Fāzes 5 prasība)", () => {
    const { onBalanceChange } = renderDialog();

    mounted[0]?.onBalanceChange(4_200);

    expect(onBalanceChange).toHaveBeenCalledWith(4_200);
  });

  it("skaņu lasa no globālajiem iestatījumiem, nevis no savas pogas", () => {
    renderDialog();

    expect(mounted[0]?.getSoundSettings()).toEqual({ muted: false, volume: 0.5 });
  });
});
