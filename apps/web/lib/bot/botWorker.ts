// Web Worker, kas hostē apmācīto botu (ISMCTS) ĀRPUS galvenā pavediena. Gan solīšanas Monte Carlo
// (chooseInclusionBid), gan gājienu meklēšana (IsmctsSearcher) ir CPU-smaga un sinhrona; palaižot to
// šeit, galvenais pavediens (UI) nekad nebloķējas. `botBridge.ts` (galvenais pavediens) būvē vieglo
// `PlayerView`, atsūta to šurp, un saņem atpakaļ tikai solījumu/gājienu.
//
// SVARĪGI: tikai ŠIS fails importē smago `@domino-poker/ai` pakotni → tā nonāk tikai worker bundle-ā,
// nevis galvenajā lobby/spēles chunk-ā.

/// <reference lib="webworker" />

import { mulberry32 } from "@domino-poker/engine";
import type { Move, PlayerView } from "@domino-poker/engine";
import { chooseInclusionBid, IsmctsSearcher } from "@domino-poker/ai";

type BidRequest = {
  readonly id: number;
  readonly kind: "bid";
  readonly view: PlayerView;
  readonly bidSamples: number;
  readonly seed: number;
};

type MoveRequest = {
  readonly id: number;
  readonly kind: "move";
  readonly view: PlayerView;
  readonly moveIterations: number;
  readonly seed: number;
};

type WorkerRequest = BidRequest | MoveRequest;

// ISMCTS iterē pa blokiem; off-thread nav jāatdod vadība UI, tāpēc bloks ir tikai cilpas granularitāte.
const MOVE_CHUNK = 64;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "bid") {
      const bid = chooseInclusionBid(request.view, mulberry32(request.seed), {
        samples: request.bidSamples
      }).bid;
      ctx.postMessage({ id: request.id, bid });
      return;
    }

    const searcher = new IsmctsSearcher(mulberry32(request.seed), { rewardKind: "inclusion" });
    searcher.sync(request.view);
    // Fiksēts iterāciju budžets (NE pulksteņa) → reproducējams spēks neatkarīgi no ierīces. Cilpa
    // vienmēr beidzas; off-thread tā nevar iesaldēt UI, tāpēc nav vajadzīgi pulksteņa griesti.
    let iterations = 0;
    while (iterations < request.moveIterations) {
      searcher.iterate(MOVE_CHUNK);
      iterations += MOVE_CHUNK;
    }
    const move: Move = searcher.bestMove();
    ctx.postMessage({ id: request.id, move });
  } catch (error) {
    ctx.postMessage({ id: request.id, error: String(error) });
  }
};
