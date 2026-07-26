import { SLOT_MATH_CONFIG } from "@domino-poker/core/slots";
import { describe, expect, it, vi } from "vitest";

import {
  GameController,
  createInitialState,
  type SpinResponse
} from "../../components/slots/app/GameController";
import { GameStore } from "../../components/slots/app/GameStore";
import { totalBetOf } from "../../components/slots/app/gameState";

/**
 * T7.8 — `GameController` dzīves cikls ap AIZVĒRŠANU un ap NORAIDĪTU griezienu.
 *
 * Šie ir naudas invarianti, ne prezentācija: pēc `dispose` nedrīkst rasties jauna likme,
 * un noraidīts grieziens nedrīkst atstāt novecojušu bilanci. Renderētājs (Pixi) šeit
 * netiek montēts — kontrolieris ir tīra TS un tam nav DOM atkarību.
 */

const LINE_BET = SLOT_MATH_CONFIG.defaultLineBet;

function harness(spin: (spinId: string, lineBet: number) => Promise<SpinResponse>) {
  const store = new GameStore(createInitialState());
  const published: number[] = [];
  const spinCalls: string[] = [];
  const controller = new GameController({
    store,
    createSpinId: () => "spin-1",
    onBalanceChange: (balance) => published.push(balance),
    spin: (spinId, lineBet) => {
      spinCalls.push(spinId);
      return spin(spinId, lineBet);
    }
  });
  // `boot` ieliek IDLE fāzi; bez tā `requestSpin` atteiktos jau uz fāzes sarga.
  controller.boot(1_000_000);
  return { store, controller, published, spinCalls };
}

describe("GameController — aizvēršanas un noraidījuma dzīves cikls (T7.8)", () => {
  it("NEATKĀRTO tīkla kļūmi pēc dispose — citādi atkārtojums būtu PIRMĀ likme uz aizvērtas spēles", async () => {
    // Pirmais pieprasījums varēja serveri nekad nesasniegt; atkārtojums pēc aizvēršanas
    // tad noliktu īstu likmi. Idempotence pret to nepasargā — tā sedz DUBULTU norēķinu.
    const h = harness(async () => {
      h.controller.dispose();
      return { ok: false, reason: "network" };
    });

    await h.controller.requestSpin();

    expect(h.spinCalls).toEqual(["spin-1"]);
  });

  it("atkārto tīkla kļūmi tieši vienreiz, kamēr spēle ir dzīva", async () => {
    const h = harness(async () => ({ ok: false, reason: "network" }));

    await h.controller.requestSpin();

    expect(h.spinCalls).toEqual(["spin-1", "spin-1"]);
  });

  it("izsūta griezienu arī tad, ja LOKĀLĀ bilance ir zemāka par likmi (stale-low, T7.7)", async () => {
    // Vecā lokālā pārbaude šeit atteica pieprasījumu, tāpēc novecojusi-uz-leju bilance
    // nekad netika izlabota: bez izsūtīšanas nav atbildes, bez atbildes nav labojuma.
    const h = harness(async () => ({ ok: false, reason: "insufficient", balance: 500_000 }));
    h.store.patch({ balance: 0n });

    await h.controller.requestSpin();

    expect(h.spinCalls).toEqual(["spin-1"]);
    expect(h.store.getState().balance).toBe(500_000n);
    expect(h.published).toEqual([500_000]);
  });

  it("pieliek autoritatīvo bilanci no 402 un tomēr parāda NOT_ENOUGH_COINS", async () => {
    const h = harness(async () => ({ ok: false, reason: "insufficient", balance: 40 }));

    await h.controller.requestSpin();

    expect(h.store.getState().balance).toBe(40n);
    expect(h.store.getState().error).toBe("NOT_ENOUGH_COINS");
  });

  it("neizmaina bilanci, ja kļūdas atbildē autoritatīvās summas nav", async () => {
    const h = harness(async () => ({ ok: false, reason: "rate_limited" }));

    await h.controller.requestSpin();

    expect(h.store.getState().balance).toBe(1_000_000n);
    expect(h.published).toEqual([]);
    expect(h.store.getState().error).toBe("RATE_LIMITED");
  });

  it("publicē norēķināto bilanci arī tad, ja atbilde pienāk PĒC dispose (Fāzes 5 prasība)", async () => {
    // Aizvēršana grieziena vidū: `onReelsStopped` nekad nenostrādās, bet nauda serverī
    // JAU ir kustējusies, tāpēc lobijam summa jāsaņem tik un tā.
    const h = harness(async () => {
      h.controller.dispose();
      return {
        ok: true,
        value: { balance: 777, payout: 0, result: null as never }
      };
    });

    await h.controller.requestSpin();

    expect(h.published).toEqual([777]);
  });

  it("publicē 402 bilanci arī tad, ja noraidījums pienāk PĒC dispose", async () => {
    // Simetrija ar veiksmes ceļu: aizvēršana nedrīkst atstāt lobiju ar novecojušu
    // skaitli tikai tāpēc, ka atbilde bija noraidījums, nevis norēķins.
    const h = harness(async () => {
      h.controller.dispose();
      return { ok: false, reason: "insufficient", balance: 15 };
    });

    await h.controller.requestSpin();

    expect(h.published).toEqual([15]);
    // Store pieder jau iznīcinātai spēlei — to aiztikt nedrīkst.
    expect(h.store.getState().error).toBeNull();
  });

  it("pēc dispose bez autoritatīvas summas neko nepublicē", async () => {
    const h = harness(async () => {
      h.controller.dispose();
      return { ok: false, reason: "rate_limited" };
    });

    await h.controller.requestSpin();

    expect(h.published).toEqual([]);
  });

  it("`dispose` ir drošs atkārtoti un bloķē jebkuru turpmāku griezienu", async () => {
    const spin = vi.fn(async (): Promise<SpinResponse> => ({ ok: false, reason: "failed" }));
    const h = harness(spin);

    h.controller.dispose();
    h.controller.dispose();
    const started = await h.controller.requestSpin();

    expect(started).toBe(false);
    expect(spin).not.toHaveBeenCalled();
  });

  it("totalBetOf sedz visas 11 aktīvās līnijas (likmes mēroga sanity)", () => {
    expect(totalBetOf(LINE_BET)).toBe(BigInt(LINE_BET) * BigInt(SLOT_MATH_CONFIG.activeLines));
  });
});
