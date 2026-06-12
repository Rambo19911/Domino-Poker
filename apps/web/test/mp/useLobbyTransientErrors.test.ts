import { describe, expect, it } from "vitest";

import type { AppStrings } from "../../lib/i18n";
import { chatErrorText } from "../../lib/mp/useLobbyTransientErrors";

// chatErrorText izšķir, vai servera kļūda iet izgaistošajā ČATA grozā (4 s) vai
// vispārējā LOBBY grozā (6 s). Tikai šīs divas izšķiršanas vērtības tiek lasītas.
const t = {
  mpChatRateLimited: "chat-rate-limited",
  mpChatInvalid: "chat-invalid"
} as unknown as AppStrings;

describe("chatErrorText (lobby transient error classification)", () => {
  it("routes chat-class codes to the chat bucket", () => {
    expect(chatErrorText("RATE_LIMITED", t)).toBe("chat-rate-limited");
    expect(chatErrorText("INVALID_MESSAGE", t)).toBe("chat-invalid");
  });

  it("routes all other codes to the lobby bucket (undefined)", () => {
    expect(chatErrorText("ROOM_FULL", t)).toBeUndefined();
    expect(chatErrorText("NOT_YOUR_TURN", t)).toBeUndefined();
    expect(chatErrorText("FORBIDDEN", t)).toBeUndefined();
    expect(chatErrorText("", t)).toBeUndefined();
  });
});
