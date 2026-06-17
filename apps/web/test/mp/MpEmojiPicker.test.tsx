// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MpEmojiPicker } from "../../components/mp/MpEmojiPicker";

afterEach(cleanup);

describe("MpEmojiPicker", () => {
  it("inserts the selected emoji at the current cursor position", () => {
    render(<Harness initialValue="hi " maxLength={20} />);

    const input = screen.getByRole("textbox", { name: "Chat" }) as HTMLInputElement;
    input.setSelectionRange(3, 3);

    fireEvent.click(screen.getByRole("button", { name: "Choose emoji" }));
    fireEvent.click(screen.getByRole("option", { name: "Insert 👍" }));

    expect(input.value).toBe("hi 👍");
  });

  it("does not split emoji when the configured chat length limit has no room", () => {
    render(<Harness initialValue="1234" maxLength={5} />);

    const input = screen.getByRole("textbox", { name: "Chat" }) as HTMLInputElement;
    input.setSelectionRange(4, 4);

    fireEvent.click(screen.getByRole("button", { name: "Choose emoji" }));
    fireEvent.click(screen.getByRole("option", { name: "Insert 👍" }));

    expect(input.value).toBe("1234");
  });
});

function Harness({
  initialValue,
  maxLength
}: {
  readonly initialValue: string;
  readonly maxLength: number;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form>
      <MpEmojiPicker
        inputRef={inputRef}
        value={value}
        maxLength={maxLength}
        label="Choose emoji"
        insertLabel="Insert {emoji}"
        onChange={setValue}
      />
      <input
        ref={inputRef}
        aria-label="Chat"
        maxLength={maxLength}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
    </form>
  );
}
