import type { GameState, Move, PlayerView, Rng, SeatTuple, TrickState } from "@domino-poker/engine";
import {
  appendTrickMove,
  createEmptyTrick,
  currentTrickSeat,
  legalMoves,
  moveKey,
  score,
  tileBit,
  trickWinner
} from "@domino-poker/engine";
import { sampleDeal, sampleWeightedDeal, type WeightedBidder, type WeightModel } from "./dealer.js";
import { inferConstraints, type Constraints } from "./inference.js";
import { chooseRolloutMove } from "./rollout.js";
import { DEFAULT_PROFILE, type OpponentProfile } from "./profiling.js";

// Determinization strategy bound to a fixed position: maps a PRNG to a full set of hands.
export type Determinizer = (rng: Rng) => SeatTuple<number>;

// Back-propagation objective. "points" is the L6 relative-points reward (maximize score).
// "inclusion" rewards hitting the bid exactly (taken == bid) - the project's acceptance goal,
// which a points-maximizer does not pursue at bid 0 (where extra tricks still raise the score).
export type RewardKind = "points" | "inclusion";

// ISMCTS max^n single-threaded play engine (plan 4.5, M4 without parallelization/pondering).
// The tree is an information-set tree from the bot's seat: a node is a public move
// sequence from the current decision point. Each iteration determinizes the opponents'
// hidden hands (4.2), descends the tree restricted to that determinization, expands one
// leaf, rolls out with the heuristic policy (4.3), and back-propagates the max^n reward (L6).

export const UCB_C = 0.7;

// Reward normalization range for L6: raw_i = score_i - mean(other scores) lies in [-205, 205]
// (best 155 vs three -50, worst -50 vs others) so (raw + 205) / 410 maps onto [0, 1].
const REWARD_OFFSET = 205;
const REWARD_SPAN = 410;

export type MoveEvaluation = {
  move: Move;
  visits: number;
  reward: number;
};

export type MoveStats = {
  iterations: number;
  evaluations: MoveEvaluation[];
};

export type ChooseMoveOptions = {
  iterations: number;
  // Optional UCB exploration constant override. Defaults to the L7 value (0.7); exposed so
  // M7 can calibrate it against the tournament without editing the source.
  explorationC?: number;
  // Optional per-seat opponent profiles (M6). When given, determinizations are Bayes-weighted by
  // how plausibly each already-bid opponent would have made its bid (4.2B); otherwise uniform.
  profiles?: SeatTuple<OpponentProfile>;
  // Optional determinizer override (M7 ceiling measurement / tests). Replaces the view-derived
  // sampler entirely - e.g. a cheating oracle that returns the true hands. Production never sets
  // this (the adapter only has a PlayerView), so the perfect-information path stays out of the app.
  determinizer?: Determinizer;
  // Back-propagation objective; defaults to "points" (L6). "inclusion" makes the search play to
  // land taken == bid (the project's acceptance goal).
  rewardKind?: RewardKind;
};

type Child = {
  move: Move;
  visits: number;
  avail: number;
  reward: Float64Array;
  node: Node | null;
};

type Node = {
  children: Map<string, Child>;
};

export function chooseMove(view: PlayerView, rng: Rng, options: ChooseMoveOptions): { move: Move; stats: MoveStats } {
  const iterations = options.iterations;
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new RangeError(`ISMCTS iterations must be a positive integer: ${iterations}`);
  }
  const explorationC = options.explorationC ?? UCB_C;

  const rootSeat = currentTrickSeat(view.trick);
  if (rootSeat !== view.seat) {
    throw new Error(`ISMCTS can only move for its own seat ${view.seat}, current seat is ${rootSeat}.`);
  }

  const rootLegal = legalMoves(view.hand, view.trick).map(cloneMove);
  if (rootLegal.length === 1) {
    return { move: rootLegal[0] as Move, stats: { iterations: 0, evaluations: [{ move: rootLegal[0] as Move, visits: 0, reward: 0 }] } };
  }

  const determinize = options.determinizer ?? buildDeterminizer(view, inferConstraints(view), options.profiles);
  const rewardKind = options.rewardKind ?? "points";
  const root: Node = { children: new Map() };
  const reward = new Float64Array(4);
  const path: Child[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    runIteration(root, determinize, view, rng, explorationC, reward, path, rewardKind);
  }

  return { move: selectFinalMove(root), stats: buildStats(root, iterations) };
}

// One ISMCTS iteration: determinize, descend the tree under that determinization, roll out,
// and back-propagate the max^n reward. Shared by the one-shot chooseMove and IsmctsSearcher.
function runIteration(
  root: Node,
  determinize: Determinizer,
  view: PlayerView,
  rng: Rng,
  explorationC: number,
  reward: Float64Array,
  path: Child[],
  rewardKind: RewardKind
): void {
  const hands = determinize(rng);
  const state = buildSearchState(view, hands);
  path.length = 0;

  descend(root, state, path, explorationC);
  rollout(state, rng);
  backpropagate(state, path, reward, rewardKind);
}

// Build the determinization strategy for a fixed position. Without profiles it is the uniform
// constraint-directed sampler (M4/M5 behaviour, identical RNG use); with profiles and at least
// one opponent that has already bid, it is the Bayes-weighted sampler (4.2B/C).
function buildDeterminizer(view: PlayerView, constraints: Constraints, profiles?: SeatTuple<OpponentProfile>): Determinizer {
  if (profiles === undefined) {
    return (rng) => sampleDeal(constraints, rng).hands;
  }

  const bidders: WeightedBidder[] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat !== view.seat && (view.bids[seat] as number) >= 0) {
      bidders.push({ seat: seat as 0 | 1 | 2 | 3, bid: view.bids[seat] as number, profile: profiles[seat] ?? DEFAULT_PROFILE });
    }
  }

  if (bidders.length === 0) {
    return (rng) => sampleDeal(constraints, rng).hands;
  }

  const model: WeightModel = { firstSeat: view.firstSeat, bidders };
  return (rng) => sampleWeightedDeal(constraints, model, rng).hands;
}

export type SearcherConfig = {
  explorationC?: number;
  profiles?: SeatTuple<OpponentProfile>;
  rewardKind?: RewardKind;
};

// Stateful ISMCTS searcher for M5: keeps its tree across real moves (tree reuse) and can be
// iterated at any time (pondering while it is not the bot's turn). Root-parallel workers each
// own one searcher with its own PRNG; the caller sums their rootVisits() to pick a move.
export class IsmctsSearcher {
  private readonly rng: Rng;
  private readonly explorationC: number;
  private readonly profiles: SeatTuple<OpponentProfile> | undefined;
  private readonly rewardKind: RewardKind;
  private readonly reward = new Float64Array(4);
  private readonly path: Child[] = [];
  private root: Node = { children: new Map() };
  private view: PlayerView | null = null;
  private determinize: Determinizer | null = null;
  private syncedHistoryLength = 0;
  private iterationsRun = 0;

  constructor(rng: Rng, config: SearcherConfig = {}) {
    this.rng = rng;
    this.explorationC = config.explorationC ?? UCB_C;
    this.profiles = config.profiles;
    this.rewardKind = config.rewardKind ?? "points";
  }

  // Point the searcher at the current public position. If the new history extends the previous
  // one and every intervening real move was explored, the matching subtree is kept; otherwise
  // the tree is rebuilt. Constraints and the determinizer are always rebuilt from the fresh view.
  sync(view: PlayerView): void {
    const reused = this.view !== null && this.tryReuse(view);
    if (!reused) {
      this.root = { children: new Map() };
      this.iterationsRun = 0;
    }
    this.view = view;
    this.determinize = buildDeterminizer(view, inferConstraints(view), this.profiles);
    this.syncedHistoryLength = view.history.length;
  }

  private tryReuse(view: PlayerView): boolean {
    if (view.history.length < this.syncedHistoryLength) {
      return false;
    }
    let node: Node = this.root;
    for (let index = this.syncedHistoryLength; index < view.history.length; index += 1) {
      const event = view.history[index];
      if (event === undefined) {
        return false;
      }
      const child = node.children.get(moveKey(event.move));
      if (child === undefined || child.node === null) {
        return false;
      }
      node = child.node;
    }
    this.root = node;
    return true;
  }

  iterate(iterations: number): void {
    if (this.view === null || this.determinize === null) {
      throw new Error("IsmctsSearcher.iterate called before sync.");
    }
    for (let index = 0; index < iterations; index += 1) {
      runIteration(this.root, this.determinize, this.view, this.rng, this.explorationC, this.reward, this.path, this.rewardKind);
      this.iterationsRun += 1;
    }
  }

  // Per-move visit counts at the current root, for cross-searcher aggregation.
  rootVisits(): MoveEvaluation[] {
    return buildStats(this.root, this.iterationsRun).evaluations;
  }

  // Most-visited move at the current root; falls back to a legal move if no iterations ran.
  bestMove(): Move {
    if (this.view === null) {
      throw new Error("IsmctsSearcher.bestMove called before sync.");
    }
    if (this.root.children.size === 0) {
      return cloneMove(legalMoves(this.view.hand, this.view.trick)[0] as Move);
    }
    return selectFinalMove(this.root);
  }
}

// Root parallelization: sum the per-move visit counts produced by independent searchers and
// return the move with the highest total visits (robust choice, plan 4.5 / 5).
export function aggregateBestMove(evaluationsList: MoveEvaluation[][]): Move {
  const totals = new Map<string, { move: Move; visits: number }>();
  for (const evaluations of evaluationsList) {
    for (const evaluation of evaluations) {
      const key = moveKey(evaluation.move);
      const current = totals.get(key);
      if (current === undefined) {
        totals.set(key, { move: evaluation.move, visits: evaluation.visits });
      } else {
        current.visits += evaluation.visits;
      }
    }
  }

  let best: { move: Move; visits: number } | null = null;
  for (const entry of totals.values()) {
    if (best === null || entry.visits > best.visits) {
      best = entry;
    }
  }

  if (best === null) {
    throw new Error("aggregateBestMove received no evaluations.");
  }
  return best.move;
}

function descend(root: Node, state: GameState, path: Child[], explorationC: number): void {
  let node = root;

  while (state.phase === "PLAYING") {
    const seat = currentTrickSeat(state.trick);
    const legal = legalMoves(state.hands[seat], state.trick);

    // Ensure a child exists for every legal move and bump its availability count.
    let untried: Child | null = null;
    for (let index = 0; index < legal.length; index += 1) {
      const move = legal[index] as Move;
      const key = moveKey(move);
      let child = node.children.get(key);
      if (child === undefined) {
        child = { move: cloneMove(move), visits: 0, avail: 0, reward: new Float64Array(4), node: null };
        node.children.set(key, child);
      }
      child.avail += 1;
      if (untried === null && child.visits === 0) {
        untried = child;
      }
    }

    if (untried !== null) {
      // Expansion: play one untried legal move, then hand off to rollout.
      stepForward(state, untried.move);
      untried.node ??= { children: new Map() };
      path.push(untried);
      return;
    }

    let best: Child | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < legal.length; index += 1) {
      const child = node.children.get(moveKey(legal[index] as Move)) as Child;
      const exploitation = (child.reward[seat] as number) / child.visits;
      const exploration = explorationC * Math.sqrt(Math.log(child.avail) / child.visits);
      const value = exploitation + exploration;
      if (value > bestValue) {
        bestValue = value;
        best = child;
      }
    }

    const chosen = best as Child;
    stepForward(state, chosen.move);
    chosen.node ??= { children: new Map() };
    path.push(chosen);
    node = chosen.node;
  }
}

function rollout(state: GameState, rng: Rng): void {
  while (state.phase === "PLAYING") {
    stepForward(state, chooseRolloutMove(state, rng));
  }
}

function backpropagate(state: GameState, path: Child[], reward: Float64Array, rewardKind: RewardKind): void {
  computeReward(state, reward, rewardKind);
  for (let index = 0; index < path.length; index += 1) {
    const child = path[index] as Child;
    child.visits += 1;
    child.reward[0] = (child.reward[0] as number) + (reward[0] as number);
    child.reward[1] = (child.reward[1] as number) + (reward[1] as number);
    child.reward[2] = (child.reward[2] as number) + (reward[2] as number);
    child.reward[3] = (child.reward[3] as number) + (reward[3] as number);
  }
}

function computeReward(state: GameState, reward: Float64Array, rewardKind: RewardKind): void {
  if (rewardKind === "inclusion") {
    // Maximize the probability of landing taken == bid exactly (the acceptance objective). A small
    // shaping term for near-misses keeps a gradient when no determinization line hits exactly.
    for (let seat = 0; seat < 4; seat += 1) {
      const miss = Math.abs((state.taken[seat] as number) - (state.bids[seat] as number));
      reward[seat] = miss === 0 ? 1 : Math.max(0, 0.5 - 0.1 * miss);
    }
    return;
  }

  const s0 = score(state.bids[0], state.taken[0]);
  const s1 = score(state.bids[1], state.taken[1]);
  const s2 = score(state.bids[2], state.taken[2]);
  const s3 = score(state.bids[3], state.taken[3]);
  const total = s0 + s1 + s2 + s3;
  reward[0] = normalizeReward(s0 - (total - s0) / 3);
  reward[1] = normalizeReward(s1 - (total - s1) / 3);
  reward[2] = normalizeReward(s2 - (total - s2) / 3);
  reward[3] = normalizeReward(s3 - (total - s3) / 3);
}

function normalizeReward(raw: number): number {
  const value = (raw + REWARD_OFFSET) / REWARD_SPAN;
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function selectFinalMove(root: Node): Move {
  let best: Child | null = null;
  let bestVisits = -1;
  for (const child of root.children.values()) {
    if (child.visits > bestVisits) {
      bestVisits = child.visits;
      best = child;
    }
  }

  if (best === null) {
    throw new Error("ISMCTS produced no root children.");
  }
  return best.move;
}

function buildStats(root: Node, iterations: number): MoveStats {
  const evaluations: MoveEvaluation[] = [];
  for (const child of root.children.values()) {
    evaluations.push({
      move: child.move,
      visits: child.visits,
      reward: child.visits > 0 ? (child.reward[0] as number) / child.visits : 0
    });
  }
  return { iterations, evaluations };
}

function buildSearchState(view: PlayerView, hands: SeatTuple<number>): GameState {
  return {
    hands: [hands[0], hands[1], hands[2], hands[3]],
    bids: [view.bids[0], view.bids[1], view.bids[2], view.bids[3]],
    taken: [view.taken[0], view.taken[1], view.taken[2], view.taken[3]],
    firstSeat: view.firstSeat,
    trick: cloneTrick(view.trick),
    history: makeHistoryWithLength(view.history.length),
    phase: "PLAYING"
  };
}

// The search never reads play-event contents, only `history.length` (rollout's tricksLeft
// and the phase==SCORED transition at 28 moves). A single shared event lets stepForward grow
// the length with zero allocation while keeping the array element type honest.
const SHARED_EVENT: GameState["history"][number] = { seat: 0, move: { tile: 0, calledPip: -1 }, trickNo: 0, posInTrick: 0 };

function makeHistoryWithLength(length: number): GameState["history"] {
  const history: GameState["history"] = [];
  for (let index = 0; index < length; index += 1) {
    history.push(SHARED_EVENT);
  }
  return history;
}

// Forward-only state transition for the search hot path: mutates in place with no clone
// and no re-validation (selection/rollout moves are legal by construction). All rule
// decisions still come from the engine (appendTrickMove, trickWinner) so no rule logic
// is duplicated (plan §7).
function stepForward(state: GameState, move: Move): void {
  const seat = currentTrickSeat(state.trick);
  state.hands[seat] &= ~tileBit(move.tile);
  const nextTrick = appendTrickMove(state.trick, seat, move);
  state.history.push(SHARED_EVENT);

  if (nextTrick.plays.length === 4) {
    const winner = trickWinner(nextTrick);
    state.taken[winner] += 1;
    state.trick = createEmptyTrick(winner);
    if (state.history.length === 28) {
      state.phase = "SCORED";
    }
    return;
  }

  state.trick = nextTrick;
}

function cloneTrick(trick: TrickState): TrickState {
  return {
    leader: trick.leader,
    plays: trick.plays.map((play) => ({ seat: play.seat, move: play.move })),
    calledPip: trick.calledPip,
    leadIsTrump: trick.leadIsTrump,
    maxTrumpRank: trick.maxTrumpRank,
    anyTrumpPlayed: trick.anyTrumpPlayed,
    isEmpty: trick.isEmpty
  };
}

function cloneMove(move: Move): Move {
  return { tile: move.tile, calledPip: move.calledPip };
}
