// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../components/ui/Button";

afterEach(cleanup);

describe("Button (ui primitive)", () => {
  it("renders children with defaults (primary / md / type=button, enabled)", () => {
    render(<Button>Play</Button>);
    const btn = screen.getByRole("button", { name: "Play" });
    expect(btn.getAttribute("data-variant")).toBe("primary");
    expect(btn.getAttribute("data-size")).toBe("md");
    expect(btn.getAttribute("type")).toBe("button");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.classList.contains("uiButton")).toBe(true);
  });

  it("reflects variant and size in data attributes", () => {
    render(
      <Button variant="danger" size="sm">
        Leave
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Leave" });
    expect(btn.getAttribute("data-variant")).toBe("danger");
    expect(btn.getAttribute("data-size")).toBe("sm");
  });

  it("sets data-icon-only only when iconOnly is true", () => {
    const { rerender } = render(<Button aria-label="Sound">S</Button>);
    expect(screen.getByRole("button").getAttribute("data-icon-only")).toBeNull();
    rerender(
      <Button iconOnly aria-label="Sound">
        S
      </Button>
    );
    expect(screen.getByRole("button").getAttribute("data-icon-only")).toBe("true");
  });

  it("disabled renders a disabled button", () => {
    render(<Button disabled>Start</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading marks aria-busy, disables the button, and shows a spinner", () => {
    render(<Button loading>Start</Button>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true); // nedarbīga tāpat kā disabled
    expect(btn.querySelector(".uiButtonSpinner")).not.toBeNull();
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    (screen.getByRole("button") as HTMLButtonElement).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick while loading (non-actionable)", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Go
      </Button>
    );
    (screen.getByRole("button") as HTMLButtonElement).click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges an extra className onto the base uiButton class", () => {
    render(<Button className="installBannerInstall">Install</Button>);
    const btn = screen.getByRole("button");
    expect(btn.classList.contains("uiButton")).toBe(true);
    expect(btn.classList.contains("installBannerInstall")).toBe(true);
  });

  it("allows overriding the button type (e.g. submit in a form)", () => {
    render(<Button type="submit">Create</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });
});
