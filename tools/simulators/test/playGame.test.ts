import { describe, expect, it } from "vitest";

import { simulateRandomGame } from "../src/playGame";
import { runSimulations } from "../src/runSimulations";

describe("random full-game simulator", () => {
  it("drives a single random game to a legal gameEnd terminal state", () => {
    const result = simulateRandomGame("single-game");

    expect(result.reachedTerminal).toBe(true);
    expect(result.finalPhase).toBe("gameEnd");
    expect(result.turnCount).toBeGreaterThan(0);
    expect(result.commandCount).toBeGreaterThan(result.turnCount);
  });

  it("never opens two turns at once and always advances turnId", () => {
    // simulateRandomGame met izņēmumu, ja kāds no šiem nosacījumiem pārkāpts,
    // tāpēc tīra izpilde + monotona turnId virkne ir pati pārbaude.
    const result = simulateRandomGame("turn-ordering");

    const sequences = result.turnIds.map((turnId) =>
      Number.parseInt(turnId.replace("turn-", ""), 10)
    );
    const ascending = sequences.every(
      (value, index) => index === 0 || value > sequences[index - 1]!
    );
    expect(ascending).toBe(true);
    expect(new Set(result.turnIds).size).toBe(result.turnIds.length);
  });

  it("is fully deterministic for the same seed", () => {
    const first = simulateRandomGame("determinism-seed");
    const second = simulateRandomGame("determinism-seed");

    expect(second).toEqual(first);
  });

  it("produces different play-outs for different seeds", () => {
    const a = simulateRandomGame("seed-a");
    const b = simulateRandomGame("seed-b");

    // Sēklas atšķiras → faktiskajām izvēlēm (solījumi/gājieni) jāatšķiras.
    expect(a.decisions).not.toEqual(b.decisions);
  });

  it("runs a batch of random games that all reach a legal terminal state", () => {
    const summary = runSimulations(200, "batch");

    expect(summary.terminal).toBe(summary.total);
    expect(summary.failures).toEqual([]);
  });

  it("respects a custom round count", () => {
    const single = simulateRandomGame("one-round", { numberOfRounds: 1 });

    expect(single.reachedTerminal).toBe(true);
    expect(single.rounds).toBe(1);
  });
});

describe("timeout simulator", () => {
  it("drives a fully-AFK game (every turn times out) to a legal terminal state", () => {
    const result = simulateRandomGame("all-timeouts", { timeoutProbability: 1 });

    // Katrs turns atrisināts caur TURN_TIMEOUT auto-darbību, un harness met
    // izņēmumu, ja auto-darbība būtu nelegāla → tīra termināla state ir pati
    // pārbaude, ka timeout nekad nerada nelegālu gājienu/solījumu.
    expect(result.reachedTerminal).toBe(true);
    expect(result.finalPhase).toBe("gameEnd");
    expect(result.timeoutCount).toBe(result.turnCount);
  });

  it("mixes timeouts and normal actions for a partial timeout probability", () => {
    const result = simulateRandomGame("mixed-timeouts", { timeoutProbability: 0.5 });

    expect(result.reachedTerminal).toBe(true);
    expect(result.timeoutCount).toBeGreaterThan(0);
    expect(result.timeoutCount).toBeLessThan(result.turnCount);
  });

  it("uses a separate RNG stream so timeoutProbability 0 matches the default", () => {
    const withZero = simulateRandomGame("stream-seed", { timeoutProbability: 0 });
    const withoutOption = simulateRandomGame("stream-seed");

    expect(withZero).toEqual(withoutOption);
  });

  it("is deterministic for the same seed and timeout probability", () => {
    const first = simulateRandomGame("timeout-determinism", { timeoutProbability: 0.4 });
    const second = simulateRandomGame("timeout-determinism", { timeoutProbability: 0.4 });

    expect(second).toEqual(first);
  });

  it("runs a batch of timeout-heavy games that all reach a legal terminal state", () => {
    const summary = runSimulations(100, "timeout-batch", { timeoutProbability: 0.8 });

    expect(summary.terminal).toBe(summary.total);
    expect(summary.failures).toEqual([]);
    expect(summary.totalTimeouts).toBeGreaterThan(0);
  });

  it("rejects an out-of-range timeout probability", () => {
    expect(() => simulateRandomGame("bad-prob", { timeoutProbability: 1.5 })).toThrow(
      "timeoutProbability"
    );
  });
});

describe("disconnect/reconnect simulator", () => {
  it("toggles connection state without corrupting the game (reaches terminal)", () => {
    const result = simulateRandomGame("disconnect-game", {
      disconnectProbability: 0.5
    });

    // assertInvariants pēc katras komandas + tīra termināla state pierāda, ka
    // nejaušs disconnect/reconnect nebojā state.
    expect(result.reachedTerminal).toBe(true);
    expect(result.finalPhase).toBe("gameEnd");
    expect(result.disconnectCount).toBeGreaterThan(0);
  });

  it("forces disconnected players' turns through timeouts every cycle", () => {
    const result = simulateRandomGame("always-disconnect", {
      disconnectProbability: 1
    });

    expect(result.reachedTerminal).toBe(true);
    // Ar p=1 cilvēka savienojums pārslēdzas katrā viņa turnā → gan disconnect,
    // gan reconnect notiek, un atvienotie turni atrisinās caur timeout.
    expect(result.disconnectCount).toBeGreaterThan(0);
    expect(result.reconnectCount).toBeGreaterThan(0);
    expect(result.timeoutCount).toBeGreaterThan(0);
  });

  it("uses a separate RNG stream so disconnectProbability 0 matches the default", () => {
    const withZero = simulateRandomGame("dc-stream", { disconnectProbability: 0 });
    const withoutOption = simulateRandomGame("dc-stream");

    expect(withZero).toEqual(withoutOption);
  });

  it("is deterministic for the same seed and disconnect probability", () => {
    const first = simulateRandomGame("dc-determinism", { disconnectProbability: 0.6 });
    const second = simulateRandomGame("dc-determinism", { disconnectProbability: 0.6 });

    expect(second).toEqual(first);
  });

  it("survives combined timeout and disconnect churn across a batch", () => {
    const summary = runSimulations(100, "chaos-batch", {
      timeoutProbability: 0.4,
      disconnectProbability: 0.4
    });

    expect(summary.terminal).toBe(summary.total);
    expect(summary.failures).toEqual([]);
    expect(summary.totalDisconnects).toBeGreaterThan(0);
  });

  it("rejects an out-of-range disconnect probability", () => {
    expect(() =>
      simulateRandomGame("bad-dc", { disconnectProbability: -0.2 })
    ).toThrow("disconnectProbability");
  });
});
