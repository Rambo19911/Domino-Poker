// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IconButton } from "../components/ui/IconButton";

afterEach(cleanup);

const Icon = () => <span className="testIcon" aria-hidden="true" />;

describe("IconButton (ui primitive)", () => {
  it("exposes the label as the accessible name and renders the icon child", () => {
    render(
      <IconButton label="Settings">
        <Icon />
      </IconButton>
    );
    const btn = screen.getByRole("button", { name: "Settings" });
    expect(btn.classList.contains("uiIconButton")).toBe(true);
    expect(btn.getAttribute("data-size")).toBe("md");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.querySelector(".testIcon")).not.toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("reflects size in data-size", () => {
    render(
      <IconButton label="Close" size="sm">
        <Icon />
      </IconButton>
    );
    expect(screen.getByRole("button", { name: "Close" }).getAttribute("data-size")).toBe("sm");
  });

  it("disabled renders a disabled button", () => {
    render(
      <IconButton label="Exit" disabled>
        <Icon />
      </IconButton>
    );
    expect((screen.getByRole("button", { name: "Exit" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading marks aria-busy, disables, and replaces the icon with a spinner", () => {
    render(
      <IconButton label="Save" loading>
        <Icon />
      </IconButton>
    );
    const btn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector(".uiButtonSpinner")).not.toBeNull();
    expect(btn.querySelector(".testIcon")).toBeNull(); // ikona aizvietota
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Help" onClick={onClick}>
        <Icon />
      </IconButton>
    );
    (screen.getByRole("button", { name: "Help" }) as HTMLButtonElement).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick while loading", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Help" loading onClick={onClick}>
        <Icon />
      </IconButton>
    );
    (screen.getByRole("button", { name: "Help" }) as HTMLButtonElement).click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges an extra className onto the base uiIconButton class", () => {
    render(
      <IconButton label="Sound" className="mpHeaderIconButton">
        <Icon />
      </IconButton>
    );
    const btn = screen.getByRole("button", { name: "Sound" });
    expect(btn.classList.contains("uiIconButton")).toBe(true);
    expect(btn.classList.contains("mpHeaderIconButton")).toBe(true);
  });

  it("forwards aria-pressed for toggle icon buttons", () => {
    render(
      <IconButton label="Mute" aria-pressed={true}>
        <Icon />
      </IconButton>
    );
    expect(screen.getByRole("button", { name: "Mute" }).getAttribute("aria-pressed")).toBe("true");
  });
});
