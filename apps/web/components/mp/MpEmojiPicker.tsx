"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

const CHAT_EMOJIS = [
  "🙂", "😄", "😁", "😂", "🤣", "😅",
  "😉", "😎", "🤔", "😮", "🥳", "😏",
  "😢", "😭", "😡", "😴", "🤯", "🫡",
  "👍", "👎", "👏", "🙌", "🤝", "🙏",
  "🔥", "✨", "💪", "❤️", "🎲", "🏆"
] as const;

export function MpEmojiPicker({
  inputRef,
  value,
  maxLength,
  label,
  insertLabel,
  onChange
}: {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly maxLength: number;
  readonly label: string;
  readonly insertLabel: string;
  readonly onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [inputRef, isOpen]);

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const availableLength = maxLength - (value.length - (end - start));
    if (emoji.length > availableLength) {
      setIsOpen(false);
      input?.focus();
      return;
    }

    const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    const nextCursor = Math.min(start + emoji.length, nextValue.length);

    onChange(nextValue);
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="mpEmojiPicker" ref={wrapperRef}>
      <button
        className="mpEmojiToggle"
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <EmojiIcon />
      </button>
      {isOpen ? (
        <div className="mpEmojiPanel" id={panelId} role="listbox" aria-label={label}>
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="mpEmojiOption"
              type="button"
              role="option"
              aria-label={insertLabel.replace("{emoji}", emoji)}
              onClick={() => insertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmojiIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 10h.01" />
      <path d="M15.5 10h.01" />
      <path d="M8.8 14.2a4.4 4.4 0 0 0 6.4 0" />
    </svg>
  );
}
