// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextField } from "../components/ui/TextField";

afterEach(cleanup);

describe("TextField (ui primitive)", () => {
  it("renders a text input by default and wires the visible label to it", () => {
    render(<TextField label="Username" defaultValue="" />);
    const input = screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement;
    expect(input.type).toBe("text");
    const label = screen.getByText("Username");
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.id).not.toBe("");
  });

  it("renders without a visible label (aria-label only — chat case)", () => {
    render(<TextField aria-label="Chat message" />);
    const input = screen.getByRole("textbox", { name: "Chat message" });
    expect(input.parentElement?.querySelector("label")).toBeNull();
  });

  it("links a hint via aria-describedby", () => {
    render(<TextField label="Email" hint="We never share it" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    const hint = screen.getByText("We never share it");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("error sets aria-invalid, marks the wrapper, links the message, and hides the hint", () => {
    render(<TextField label="Email" hint="optional" error="Invalid email" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    const errorEl = screen.getByText("Invalid email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(errorEl.id);
    expect(input.closest(".uiField")?.getAttribute("data-invalid")).toBe("true");
    expect(screen.queryByText("optional")).toBeNull(); // hint aizvietots ar error
  });

  it("is a controlled passthrough — onChange fires with the typed value", () => {
    const onChange = vi.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ada" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("forwards native input props (type, maxLength, placeholder, disabled)", () => {
    render(
      <TextField
        label="Email"
        type="email"
        maxLength={254}
        placeholder="you@example.com"
        disabled
      />
    );
    const input = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.maxLength).toBe(254);
    expect(input.getAttribute("placeholder")).toBe("you@example.com");
    expect(input.disabled).toBe(true);
  });

  it("merges an extra className onto the field wrapper", () => {
    render(<TextField label="Code" className="mpCodeField" />);
    const wrapper = screen.getByRole("textbox", { name: "Code" }).closest(".uiField");
    expect(wrapper?.classList.contains("mpCodeField")).toBe(true);
  });
});
