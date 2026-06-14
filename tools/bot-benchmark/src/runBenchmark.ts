import { performance } from "node:perf_hooks";
import process from "node:process";

import {
  applyBid,
  applyMove,
  createGameState,
  createPlayerView,
  currentTrickSeat,
  mulberry32,
  scores,
  seatOffset,
  shuffleInPlace,
  TILE_COUNT,
  tileMask,
  type GameState,
  type Rng,
  type Seat,
  type SeatTuple
} from "@domino-poker/engine";
import { chooseInclusionBid, IsmctsSearcher } from "@domino-poker/ai";

/**
 * Single-player bot benchmark (headless, single-threaded).
 *
 * The strong ISMCTS bot that drives the single-player CPU seats runs ENTIRELY in the
 * player's browser (a Web Worker — see apps/web/lib/bot/botWorker.ts), never on the server.
 * This tool measures that CLIENT-side compute cost: it plays full self-play games with the same
 * search kernel the worker uses (chooseInclusionBid for bids, IsmctsSearcher with rewardKind
 * "inclusion" iterated in MOVE_CHUNK=64 blocks for moves, a fresh mulberry32 per decision) and
 * reports per-decision wall-clock per difficulty. It does NOT include the browser pipeline
 * (core<->engine conversion, structured clone, worker startup) — measure that separately in Chrome.
 *
 * Use it to answer "is each difficulty usable on a given device?" — NOT server scaling
 * (hundreds of simultaneous single-player games are hundreds of independent browsers, so the
 * server only serves static assets). These desktop/VPS-core numbers are an optimistic BASELINE:
 * a low-end phone core is ~3-6x slower, so weak-device latency is the high end (multiply by 3-6x).
 *
 * Usage (from repo root, after `npm run build -w @domino-poker/bot-benchmark`):
 *   node tools/bot-benchmark/dist/runBenchmark.js                       # 3 games per level
 *   node tools/bot-benchmark/dist/runBenchmark.js --games=5 --difficulty=epic
 *   node tools/bot-benchmark/dist/runBenchmark.js --difficulty=medium,hard
 */

// Mirrors apps/web/lib/bot/difficulty.ts (single source of the level budgets).
const DIFFICULTIES = {
  medium: { bidSamples: 1000, moveIterations: 8000 },
  hard: { bidSamples: 3000, moveIterations: 30000 },
  epic: { bidSamples: 5000, moveIterations: 50000 }
} as const;

type DifficultyName = keyof typeof DIFFICULTIES;

// Mirrors botWorker.ts exactly: the move search iterates in 64-iteration blocks, so the
// effective budget overshoots the nominal one (e.g. epic 50000 -> 50048). Faithful timing.
const MOVE_CHUNK = 64;

interface DurationStats {
  readonly count: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

function stats(samples: readonly number[]): DurationStats {
  if (samples.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    meanMs: sum / sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[sorted.length - 1]!
  };
}

// Benchmark-internal deal: shuffle the 28 tiles into four 7-tile hands. This is NOT the game's
// shuffle/deal (that lives in packages/core and is untouched) — it only feeds the bot realistic
// positions to time.
function dealHands(rng: Rng): SeatTuple<number> {
  const tiles = Array.from({ length: TILE_COUNT }, (_, index) => index);
  shuffleInPlace(tiles, rng);
  return [
    tileMask(tiles.slice(0, 7)),
    tileMask(tiles.slice(7, 14)),
    tileMask(tiles.slice(14, 21)),
    tileMask(tiles.slice(21, 28))
  ];
}

function countBids(bids: SeatTuple<number>): number {
  return bids.reduce((total, bid) => total + (bid !== -1 ? 1 : 0), 0);
}

interface GameTimings {
  readonly bid: number[];
  readonly move: number[];
}

// Plays one full self-play game (all 4 seats are the bot) and records each decision's wall-clock.
// Like botWorker, each decision gets a FRESH mulberry32 (the worker builds one per request) — the
// seed only affects which line the search explores, not the timing, but it mirrors the real lifecycle.
function playOneGame(
  deal: SeatTuple<number>,
  firstSeat: Seat,
  level: { bidSamples: number; moveIterations: number },
  gameSeed: number,
  timings: GameTimings
): void {
  let state: GameState = createGameState(deal, firstSeat);
  let decision = 0;
  const decisionRng = (): Rng =>
    mulberry32((gameSeed ^ Math.imul((decision += 1), 0x9e3779b1)) >>> 0);

  while (state.phase === "BIDDING") {
    const seat = seatOffset(state.firstSeat, countBids(state.bids));
    const view = createPlayerView(state, seat);
    const started = performance.now();
    const bid = chooseInclusionBid(view, decisionRng(), { samples: level.bidSamples }).bid;
    timings.bid.push(performance.now() - started);
    state = applyBid(state, seat, bid);
  }

  while (state.phase === "PLAYING") {
    const seat = currentTrickSeat(state.trick);
    const view = createPlayerView(state, seat);
    const started = performance.now();
    const searcher = new IsmctsSearcher(decisionRng(), { rewardKind: "inclusion" });
    searcher.sync(view);
    let iterations = 0;
    while (iterations < level.moveIterations) {
      searcher.iterate(MOVE_CHUNK);
      iterations += MOVE_CHUNK;
    }
    const move = searcher.bestMove();
    timings.move.push(performance.now() - started);
    state = applyMove(state, move);
  }

  // Sanity: a finished game must have scored (4 bids + 7 tricks). Throws would surface a broken
  // self-play loop rather than silently reporting bogus timings.
  if (state.phase !== "SCORED") {
    throw new Error(`benchmark: game did not reach SCORED (phase ${state.phase}).`);
  }
  void scores(state);
}

interface LevelReport {
  readonly difficulty: DifficultyName;
  readonly games: number;
  readonly bid: DurationStats;
  readonly move: DurationStats;
  readonly wallClockMs: number;
}

function benchmarkLevel(difficulty: DifficultyName, games: number, baseSeed: number): LevelReport {
  const level = DIFFICULTIES[difficulty];
  const timings: GameTimings = { bid: [], move: [] };
  const started = performance.now();
  for (let game = 0; game < games; game += 1) {
    // Reproducible per-game seed; vary the first seat for positional variety.
    const gameSeed = (baseSeed ^ Math.imul(game + 1, 0x9e3779b1)) >>> 0;
    const deal = dealHands(mulberry32(gameSeed));
    playOneGame(deal, (game & 3) as Seat, level, gameSeed, timings);
  }
  return {
    difficulty,
    games,
    bid: stats(timings.bid),
    move: stats(timings.move),
    wallClockMs: performance.now() - started
  };
}

interface BenchConfig {
  readonly games: number;
  readonly difficulties: readonly DifficultyName[];
  readonly seed: number;
}

function parseArgs(argv: readonly string[]): BenchConfig {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (match) flags.set(match[1] as string, match[2] as string);
  }
  const requested = (flags.get("difficulty") ?? "all").toLowerCase();
  const all: DifficultyName[] = ["medium", "hard", "epic"];
  const difficulties =
    requested === "all"
      ? all
      : (requested.split(",").filter((name): name is DifficultyName => name in DIFFICULTIES));
  return {
    games: Math.max(1, Number(flags.get("games") ?? 3)),
    difficulties: difficulties.length > 0 ? difficulties : all,
    seed: Number(flags.get("seed") ?? 12345)
  };
}

function fmt(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).padStart(8);
}

function printReport(reports: readonly LevelReport[]): void {
  console.log("\n===== SINGLE-PLAYER BOT BENCHMARK (single core, headless Node) =====");
  console.log(
    "Note: client-side cost only; the bot never runs on the server. A low-end phone core is" +
      " ~3-6x slower than this machine.\n"
  );
  const header =
    "level   games | move p50 |  move p95 | move max |  bid p50 |  bid p95 | moves/s | game~s";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const report of reports) {
    const movesPerSec = report.move.meanMs > 0 ? 1000 / report.move.meanMs : 0;
    const perGameSec = report.wallClockMs / report.games / 1000;
    console.log(
      `${report.difficulty.padEnd(7)} ${String(report.games).padStart(5)} |` +
        `${fmt(report.move.p50Ms)} |${fmt(report.move.p95Ms)} |${fmt(report.move.maxMs)} |` +
        `${fmt(report.bid.p50Ms)} |${fmt(report.bid.p95Ms)} |${fmt(movesPerSec)} |${fmt(perGameSec)}`
    );
  }
  console.log("-".repeat(header.length));
  console.log(
    "move p50/p95/max = ms per move decision; bid p50/p95 = ms per bid; moves/s = single-core" +
      " move throughput; game~s = wall-clock seconds for one full 4-seat self-play game.\n"
  );
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));
  console.log(
    `[bench] games=${config.games}/level difficulties=${config.difficulties.join(",")} seed=${config.seed}`
  );
  const reports = config.difficulties.map((difficulty, index) =>
    benchmarkLevel(difficulty, config.games, (config.seed + index * 7919) >>> 0)
  );
  printReport(reports);
}

main();
