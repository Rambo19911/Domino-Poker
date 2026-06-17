"use client";

import type { ChatMessage } from "@domino-poker/shared";

import type { AppStrings } from "../../lib/i18n";
import { translateChatMessage } from "../../lib/mp/chatTranslation";

export type ChatTranslationState =
  | { readonly status: "loading" }
  | { readonly status: "translated"; readonly text: string }
  | { readonly status: "error" };

export function MpChatTranslationButton({
  labels: t,
  message,
  state,
  onStateChange
}: {
  readonly labels: AppStrings;
  readonly message: ChatMessage;
  readonly state: ChatTranslationState | undefined;
  readonly onStateChange: (state: ChatTranslationState) => void;
}) {
  const translate = async () => {
    if (state?.status === "loading") return;
    onStateChange({ status: "loading" });
    const result = await translateChatMessage(message.text, t.localeCode);
    onStateChange(
      result.ok ? { status: "translated", text: result.translatedText } : { status: "error" }
    );
  };

  return (
    <button
      className="mpChatTranslateButton"
      type="button"
      aria-label={t.mpTranslateMessage}
      title={t.mpTranslateMessage}
      disabled={state?.status === "loading"}
      onClick={translate}
    >
      <TranslateIcon />
    </button>
  );
}

export function MpChatTranslationText({
  labels: t,
  state
}: {
  readonly labels: AppStrings;
  readonly state: ChatTranslationState | undefined;
}) {
  if (state?.status === "translated") {
    return <blockquote className="mpChatTranslation">{state.text}</blockquote>;
  }
  if (state?.status === "error") {
    return <span className="mpChatTranslation mpChatTranslationError">{t.mpTranslationFailed}</span>;
  }
  return null;
}

function TranslateIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h8" />
      <path d="M8 3v2" />
      <path d="M6 9c1.2 2 3.1 3.5 5.5 4.5" />
      <path d="M11 5c-.6 2.7-2.2 5-5 7" />
      <path d="M13 19l3.5-8 3.5 8" />
      <path d="M14.2 16h4.6" />
    </svg>
  );
}
