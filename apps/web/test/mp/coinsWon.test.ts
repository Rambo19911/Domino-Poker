import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { initialClientView, reduceServerEvent } from "../../lib/mp/clientView";

/** Fāze 6: poda izmaksas summa (`coinsWon`) plūsma klienta skatā spēles beigu summary. */
describe("reduceServerEvent coinsWon", () => {
  it("stores coinsWon from a payout WALLET_UPDATED alongside the new balance", () => {
    const view = reduceServerEvent(initialClientView, {
      type: "WALLET_UPDATED",
      balance: 5350,
      coinsWon: 350
    } as ServerEvent);
    expect(view.wallet?.balance).toBe(5350);
    expect(view.coinsWon).toBe(350);
  });

  it("a balance-only WALLET_UPDATED (debit/refund) does not overwrite a prior coinsWon", () => {
    const afterPayout = reduceServerEvent(initialClientView, {
      type: "WALLET_UPDATED",
      balance: 5350,
      coinsWon: 350
    } as ServerEvent);
    const afterDebit = reduceServerEvent(afterPayout, {
      type: "WALLET_UPDATED",
      balance: 4850
    } as ServerEvent);
    expect(afterDebit.wallet?.balance).toBe(4850);
    expect(afterDebit.coinsWon).toBe(350);
  });

  it("clears coinsWon when a new game starts (GAME_STARTING)", () => {
    const withWin = reduceServerEvent(initialClientView, {
      type: "WALLET_UPDATED",
      balance: 5350,
      coinsWon: 350
    } as ServerEvent);
    const next = reduceServerEvent(withWin, {
      type: "GAME_STARTING",
      roomId: "r1",
      startsAt: 1000
    } as ServerEvent);
    expect(next.coinsWon).toBeUndefined();
  });

  it("clears coinsWon when leaving the room (ROOM_LEFT)", () => {
    const withWin = reduceServerEvent(initialClientView, {
      type: "WALLET_UPDATED",
      balance: 5350,
      coinsWon: 350
    } as ServerEvent);
    const next = reduceServerEvent(withWin, { type: "ROOM_LEFT", roomId: "r1" } as ServerEvent);
    expect(next.coinsWon).toBeUndefined();
  });
});
