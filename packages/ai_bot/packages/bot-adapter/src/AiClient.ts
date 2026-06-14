import os from "node:os";
import { Worker } from "node:worker_threads";
import { aggregateBestMove, type MoveEvaluation } from "@domino-poker/ai";
import type { Move, PlayerView } from "@domino-poker/engine";
import { parseFromWorker, type BotConfig, type FromWorkerMessage, type ToWorkerMessage } from "./protocol.js";

const WORKER_URL = new URL("./ai.worker.js", import.meta.url);

export type AiClientOptions = {
  workers?: number;
  seed?: number;
  config?: BotConfig;
};

export type MoveResult = {
  move: Move;
  evaluations: MoveEvaluation[];
};

// Host adapter (plan §5/§6): owns the worker pool, broadcasts state, and turns parallel worker
// replies into a single decision. requestMove/requestBid resolve on a Promise, so the host UI
// thread is never blocked by search (root parallelism + anytime budget).
export class AiClient {
  private readonly workers: Worker[] = [];
  private readonly ready: Promise<void>;
  private nextRequestId = 1;
  private disposed = false;

  constructor(options: AiClientOptions = {}) {
    const count = Math.max(1, options.workers ?? defaultWorkerCount());
    const baseSeed = (options.seed ?? 0x1234) >>> 0;
    const readies: Promise<void>[] = [];

    for (let index = 0; index < count; index += 1) {
      const worker = new Worker(WORKER_URL);
      this.workers.push(worker);
      readies.push(this.awaitReady(worker));
      const config: BotConfig = options.config ?? {};
      this.post(worker, { type: "INIT", seed: (baseSeed + index * 0x9e37) >>> 0, config });
    }

    this.ready = Promise.all(readies).then(() => undefined);
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  sync(view: PlayerView): void {
    this.broadcast({ type: "SYNC", view });
  }

  ponderOn(): void {
    this.broadcast({ type: "PONDER_ON" });
  }

  ponderOff(): void {
    this.broadcast({ type: "PONDER_OFF" });
  }

  async requestMove(budgetMs: number): Promise<MoveResult> {
    await this.ready;
    const requestId = this.nextRequestId++;
    const replies = await this.collect("MOVE", requestId, { type: "REQUEST_MOVE", requestId, budgetMs });
    return { move: aggregateBestMove(replies.map((reply) => reply.evaluations)), evaluations: replies.flatMap((reply) => reply.evaluations) };
  }

  async requestBid(budgetMs: number): Promise<number> {
    await this.ready;
    const requestId = this.nextRequestId++;
    const replies = await this.collect("BID", requestId, { type: "REQUEST_BID", requestId, budgetMs });
    return modeBid(replies.map((reply) => reply.bid));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }

  private awaitReady(worker: Worker): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (raw: unknown): void => {
        if (parseFromWorker(raw).type === "READY") {
          worker.off("message", onMessage);
          worker.off("error", reject);
          resolve();
        }
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
    });
  }

  private collect<T extends "MOVE" | "BID">(
    type: T,
    requestId: number,
    message: ToWorkerMessage
  ): Promise<Array<Extract<FromWorkerMessage, { type: T }>>> {
    return new Promise((resolve, reject) => {
      const replies: Array<Extract<FromWorkerMessage, { type: T }>> = [];
      let pending = this.workers.length;
      const cleanups: Array<() => void> = [];

      for (const worker of this.workers) {
        const onMessage = (raw: unknown): void => {
          const parsed = parseFromWorker(raw);
          if (parsed.type === type && "requestId" in parsed && parsed.requestId === requestId) {
            replies.push(parsed as Extract<FromWorkerMessage, { type: T }>);
            worker.off("message", onMessage);
            pending -= 1;
            if (pending === 0) {
              for (const cleanup of cleanups) {
                cleanup();
              }
              resolve(replies);
            }
          }
        };
        worker.on("message", onMessage);
        worker.once("error", reject);
        cleanups.push(() => worker.off("error", reject));
      }

      for (const worker of this.workers) {
        this.post(worker, message);
      }
    });
  }

  private broadcast(message: ToWorkerMessage): void {
    for (const worker of this.workers) {
      this.post(worker, message);
    }
  }

  private post(worker: Worker, message: ToWorkerMessage): void {
    if (this.disposed) {
      return;
    }
    worker.postMessage(message);
  }
}

// Each worker already applied the bot's objective to choose its bid; the pool takes the consensus
// (most common bid; ties break toward the higher, more valuable bid).
function modeBid(bids: number[]): number {
  const counts = new Map<number, number>();
  for (const bid of bids) {
    counts.set(bid, (counts.get(bid) ?? 0) + 1);
  }
  let bestBid = 0;
  let bestCount = -1;
  for (const [bid, count] of counts) {
    if (count > bestCount || (count === bestCount && bid > bestBid)) {
      bestCount = count;
      bestBid = bid;
    }
  }
  return bestBid;
}

function defaultWorkerCount(): number {
  const parallelism = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, parallelism - 1);
}
