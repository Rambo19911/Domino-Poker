import { pathToFileURL } from "node:url";

import { simulateRandomGame, type RandomGameResult } from "./playGame.js";

export interface SimulationRunSummary {
  readonly total: number;
  readonly terminal: number;
  readonly failures: readonly { readonly seed: string; readonly error: string }[];
  readonly totalCommands: number;
  readonly totalTurns: number;
  readonly totalTimeouts: number;
  readonly totalDisconnects: number;
}

/**
 * Palaiž `count` nejaušas pilnas partijas ar fiksētu sēklas bāzi. Katra partija
 * iekšēji izsauc `assertInvariants` pēc katras komandas; šeit apkopojam tikai
 * terminālā state sasniegšanu un kļūdas.
 */
export function runSimulations(
  count: number,
  baseSeed: string,
  options: {
    readonly numberOfRounds?: number | undefined;
    readonly timeoutProbability?: number | undefined;
    readonly disconnectProbability?: number | undefined;
  } = {}
): SimulationRunSummary {
  const failures: { seed: string; error: string }[] = [];
  let terminal = 0;
  let totalCommands = 0;
  let totalTurns = 0;
  let totalTimeouts = 0;
  let totalDisconnects = 0;

  for (let index = 0; index < count; index += 1) {
    const seed = `${baseSeed}-${index}`;
    try {
      const result: RandomGameResult = simulateRandomGame(seed, options);
      if (result.reachedTerminal) {
        terminal += 1;
      } else {
        failures.push({ seed, error: `did not reach gameEnd (phase ${result.finalPhase})` });
      }
      totalCommands += result.commandCount;
      totalTurns += result.turnCount;
      totalTimeouts += result.timeoutCount;
      totalDisconnects += result.disconnectCount;
    } catch (error) {
      failures.push({
        seed,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    total: count,
    terminal,
    failures,
    totalCommands,
    totalTurns,
    totalTimeouts,
    totalDisconnects
  };
}

export interface SimulationScenario {
  readonly name: string;
  readonly options: {
    readonly numberOfRounds?: number | undefined;
    readonly timeoutProbability?: number | undefined;
    readonly disconnectProbability?: number | undefined;
  };
}

/**
 * Apjoma testa scenāriji — katrs ar `perScenario` spēlēm, lai 10 000 spēļu
 * gate pārbaude aptver visus darbības ceļus (parasti, timeout, disconnect un
 * kombinēti), ne tikai parastos gājienus.
 */
export const defaultVolumeScenarios: readonly SimulationScenario[] = [
  { name: "plain", options: {} },
  { name: "timeout", options: { timeoutProbability: 0.3 } },
  { name: "disconnect", options: { disconnectProbability: 0.3 } },
  {
    name: "combined",
    options: { timeoutProbability: 0.3, disconnectProbability: 0.3 }
  }
];

/**
 * Palaiž `perScenario` spēles katram scenārijam un apkopo rezultātus. Kopējais
 * spēļu skaits = `perScenario * scenarios.length`. Katram scenārijam atsevišķs
 * sēklas prefikss, lai sēklas nepārklājas.
 */
export function runVolumeSuite(
  perScenario: number,
  baseSeed: string,
  scenarios: readonly SimulationScenario[] = defaultVolumeScenarios
): SimulationRunSummary {
  const summaries = scenarios.map((scenario) =>
    runSimulations(perScenario, `${baseSeed}:${scenario.name}`, scenario.options)
  );

  return summaries.reduce(mergeSummaries, emptySummary());
}

function emptySummary(): SimulationRunSummary {
  return {
    total: 0,
    terminal: 0,
    failures: [],
    totalCommands: 0,
    totalTurns: 0,
    totalTimeouts: 0,
    totalDisconnects: 0
  };
}

function mergeSummaries(
  left: SimulationRunSummary,
  right: SimulationRunSummary
): SimulationRunSummary {
  return {
    total: left.total + right.total,
    terminal: left.terminal + right.terminal,
    failures: [...left.failures, ...right.failures],
    totalCommands: left.totalCommands + right.totalCommands,
    totalTurns: left.totalTurns + right.totalTurns,
    totalTimeouts: left.totalTimeouts + right.totalTimeouts,
    totalDisconnects: left.totalDisconnects + right.totalDisconnects
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }
  return parsed;
}

function parseProbability(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Expected a probability within [0, 1], received "${value}".`);
  }
  return parsed;
}

function main(): void {
  const baseSeed = process.env.SIM_SEED ?? process.argv[3] ?? "sim";
  const startedAt = Date.now();

  // SIM_SUITE=1 → scenāriju mikss (plain/timeout/disconnect/kombinēts), kur
  // SIM_COUNT ir spēļu skaits PĒC scenārija (gate noklusējums 2500 → 10000).
  const summary = process.env.SIM_SUITE === "1"
    ? runVolumeSuite(
        parsePositiveInt(process.env.SIM_COUNT ?? process.argv[2], 2_500),
        baseSeed
      )
    : runSimulations(
        parsePositiveInt(process.env.SIM_COUNT ?? process.argv[2], 1_000),
        baseSeed,
        {
          numberOfRounds: process.env.SIM_ROUNDS
            ? parsePositiveInt(process.env.SIM_ROUNDS, 7)
            : undefined,
          timeoutProbability: parseProbability(process.env.SIM_TIMEOUT_PROB),
          disconnectProbability: parseProbability(process.env.SIM_DISCONNECT_PROB)
        }
      );

  const elapsedMs = Date.now() - startedAt;

  console.log(
    `Simulated ${summary.terminal}/${summary.total} full games to terminal state ` +
      `(${summary.totalCommands} commands, ${summary.totalTurns} turns, ` +
      `${summary.totalTimeouts} timeouts, ${summary.totalDisconnects} disconnects, ${elapsedMs} ms).`
  );

  if (summary.failures.length > 0) {
    console.error(`FAILED: ${summary.failures.length} simulation(s) did not pass.`);
    for (const failure of summary.failures.slice(0, 10)) {
      console.error(`  - ${failure.seed}: ${failure.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("All simulations reached a legal terminal state.");
}

// Palaižam tikai tiešas izpildes gadījumā (ne, kad importē testi).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
