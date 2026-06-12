// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppStrings } from "../../lib/i18n";
import type { ClientError } from "../../lib/mp/clientView";
import { useLobbyTransientErrors } from "../../lib/mp/useLobbyTransientErrors";

const t = {
  mpChatRateLimited: "chat-rate-limited",
  mpChatInvalid: "chat-invalid"
} as unknown as AppStrings;

const chatError: ClientError = { code: "RATE_LIMITED", message: "slow down" };
const lobbyErr: ClientError = { code: "ROOM_FULL", message: "room is full" };

function renderErrors(initial: ClientError | undefined) {
  return renderHook(({ err }: { err: ClientError | undefined }) => useLobbyTransientErrors(err, t), {
    initialProps: { err: initial }
  });
}

describe("useLobbyTransientErrors (transient lobby/chat error timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  // cleanup() PIRMS useRealTimers(): hooka effect cleanup (clearTimeout) jānostrādā,
  // kamēr fake pulkstenis vēl aktīvs, lai testi paliek idempotenti (nav globāla
  // afterEach → RTL auto-cleanup neizpildās).
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("routes a chat-class error to the chat bucket and clears it after 4s", () => {
    const { result } = renderErrors(chatError);
    expect(result.current.chatError).toBe("chat-rate-limited");
    expect(result.current.lobbyError).toBeNull();

    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.chatError).toBe("chat-rate-limited"); // vēl nav izgaisis
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.chatError).toBeNull(); // izgaisis pēc 4000 ms
  });

  it("routes a non-chat error to the lobby bucket (message) and clears it after 6s", () => {
    const { result } = renderErrors(lobbyErr);
    expect(result.current.lobbyError).toBe("room is full");
    expect(result.current.chatError).toBeNull();

    act(() => vi.advanceTimersByTime(5999));
    expect(result.current.lobbyError).toBe("room is full");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.lobbyError).toBeNull(); // izgaisis pēc 6000 ms
  });

  it("clears BOTH buckets immediately when lastError becomes undefined", () => {
    const { result, rerender } = renderErrors(chatError);
    expect(result.current.chatError).toBe("chat-rate-limited");

    act(() => rerender({ err: undefined }));
    expect(result.current.chatError).toBeNull();
    expect(result.current.lobbyError).toBeNull();
  });

  it("does NOT clear the opposite bucket when a new error arrives (single-bucket set)", () => {
    // Vispirms lobby kļūda (6 s grozs), tad uzreiz čata kļūda — lobby paliek redzama
    // (pretējais grozs netiek tīrīts), kamēr tā taimeris vēl nav nostrādājis.
    const { result, rerender } = renderErrors(lobbyErr);
    expect(result.current.lobbyError).toBe("room is full");

    act(() => rerender({ err: chatError }));
    expect(result.current.chatError).toBe("chat-rate-limited");
    expect(result.current.lobbyError).toBe("room is full"); // NETIEK notīrīta

    // Jaunā kļūda re-palaida efektu → iepriekšējā efekta cleanup atcēla veco 6 s
    // lobby taimeri, tāpēc lobby paliek redzama arī pēc 6000 ms (līdz nākamai kļūdai).
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.lobbyError).toBe("room is full");
    // Čata 4 s taimeris joprojām nostrādā.
    expect(result.current.chatError).toBeNull();
  });
});
