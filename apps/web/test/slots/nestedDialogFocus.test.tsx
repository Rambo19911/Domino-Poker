// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "../../components/Dialog";

/**
 * T7.4 — ārējais fokusa slazds pret spēles LIGZDOTAJIEM native dialogiem.
 *
 * Domino Slots Rules/Auto Spin lieto `showModal()`. `useDialogFocus` klausās `document`
 * CAPTURE fāzē, tāpēc bez skaidra vārta tas nostrādātu PIRMS iekšējā dialoga Escape
 * apstrādātāja un aizvērtu VISU slotu dialogu, nevis tikai augšējo. Tas ir vienīgais
 * vieta, kur šī uzvedība tiek pārbaudīta — pārējiem lobija dialogiem ligzdotu native
 * `<dialog>` nav.
 */

describe("Dialog fokusa slazds ar ligzdotu native dialogu (T7.4)", () => {
  afterEach(cleanup);

  it("atdod Escape ligzdotajam `dialog[open]`, nevis aizver ārējo dialogu", () => {
    const onEscape = vi.fn();
    render(
      <Dialog ariaLabelledBy="x" className="slotsDialog" onEscape={onEscape}>
        <h2 id="x">slots</h2>
        <dialog open data-testid="inner">
          <button type="button">inner control</button>
        </dialog>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it("aizver ārējo dialogu ar Escape, kad ligzdotais dialogs ir aizvērts", () => {
    const onEscape = vi.fn();
    render(
      <Dialog ariaLabelledBy="x" className="slotsDialog" onEscape={onEscape}>
        <h2 id="x">slots</h2>
        <dialog data-testid="inner">
          <button type="button">inner control</button>
        </dialog>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("neslazdo Tab, kamēr ligzdotais dialogs ir atvērts (to dara `showModal()`)", () => {
    render(
      <Dialog ariaLabelledBy="x" className="slotsDialog" onEscape={vi.fn()}>
        <h2 id="x">slots</h2>
        <button type="button">outer control</button>
        <dialog open>
          <button type="button">inner control</button>
        </dialog>
      </Dialog>
    );

    const inner = screen.getByText("inner control");
    inner.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    // Vārts nostrādāja: slazds neiejaucās, tāpēc noklusējums nav atcelts un fokuss
    // paliek ligzdotā dialoga vadīklā.
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(inner);
  });
});
