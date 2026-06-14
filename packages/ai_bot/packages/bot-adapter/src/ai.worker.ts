import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { mulberry32, type PlayerView, type Rng } from "@domino-poker/engine";
import { chooseBid, chooseInclusionBid, IsmctsSearcher, type RewardKind, type SearcherConfig } from "@domino-poker/ai";
import { parseToWorker, type FromWorkerMessage } from "./protocol.js";

// Worker entry point (plan §5), instanced W times by AiClient. Hosts one ISMCTS searcher and
// answers move/bid requests with an anytime time budget so the host thread never blocks.

const PONDER_CHUNK = 48;
const SEARCH_CHUNK = 32;
const DEFAULT_BID_SAMPLES = 256;

if (parentPort === null) {
  throw new Error("ai.worker must be run as a worker thread.");
}
const port = parentPort;

let rng: Rng = mulberry32(0);
let searcher: IsmctsSearcher | null = null;
let bidSamples = DEFAULT_BID_SAMPLES;
let objective: RewardKind = "inclusion";
let evTolerance: number | undefined;
let lastView: PlayerView | null = null;
let pondering = false;
let ponderScheduled = false;

function send(message: FromWorkerMessage): void {
  port.postMessage(message);
}

function schedulePonder(): void {
  if (pondering && !ponderScheduled && searcher !== null && lastView !== null) {
    ponderScheduled = true;
    setImmediate(ponderTick);
  }
}

function ponderTick(): void {
  ponderScheduled = false;
  if (!pondering || searcher === null) {
    return;
  }
  searcher.iterate(PONDER_CHUNK);
  schedulePonder();
}

function searchWithinBudget(budgetMs: number): number {
  if (searcher === null) {
    throw new Error("REQUEST received before INIT.");
  }
  const deadline = performance.now() + budgetMs;
  let iterations = 0;
  do {
    searcher.iterate(SEARCH_CHUNK);
    iterations += SEARCH_CHUNK;
  } while (performance.now() < deadline);
  return iterations;
}

port.on("message", (raw: unknown) => {
  const message = parseToWorker(raw);
  switch (message.type) {
    case "INIT": {
      rng = mulberry32(message.seed);
      objective = message.config.objective ?? "inclusion";
      bidSamples = message.config.bidSamples ?? DEFAULT_BID_SAMPLES;
      evTolerance = message.config.evTolerance;
      const searcherConfig: SearcherConfig = { rewardKind: objective };
      if (message.config.explorationC !== undefined) {
        searcherConfig.explorationC = message.config.explorationC;
      }
      searcher = new IsmctsSearcher(rng, searcherConfig);
      send({ type: "READY" });
      return;
    }
    case "SYNC": {
      lastView = message.view;
      searcher?.sync(message.view);
      schedulePonder();
      return;
    }
    case "PONDER_ON": {
      pondering = true;
      schedulePonder();
      return;
    }
    case "PONDER_OFF": {
      pondering = false;
      return;
    }
    case "REQUEST_BID": {
      if (lastView === null) {
        throw new Error("REQUEST_BID received before SYNC.");
      }
      const bid = objective === "inclusion"
        ? chooseInclusionBid(lastView, rng, evTolerance !== undefined ? { samples: bidSamples, evTolerance } : { samples: bidSamples }).bid
        : chooseBid(lastView, rng, { samples: bidSamples }).bid;
      send({ type: "BID", requestId: message.requestId, bid });
      return;
    }
    case "REQUEST_MOVE": {
      if (searcher === null) {
        throw new Error("REQUEST_MOVE received before INIT.");
      }
      const iterations = searchWithinBudget(message.budgetMs);
      send({ type: "MOVE", requestId: message.requestId, move: searcher.bestMove(), evaluations: searcher.rootVisits(), iterations });
      schedulePonder();
      return;
    }
    default: {
      const exhaustive: never = message;
      throw new Error(`Unhandled message: ${JSON.stringify(exhaustive)}`);
    }
  }
});
