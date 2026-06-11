import type { ServerEventFanoutMessage } from "@domino-poker/shared";

// Transporta līgums dzīvo `shared` (sk. serverEvents.ts); re-eksportējam, lai esošie
// `./ServerEventBus.js` importi turpina strādāt bez izmaiņām.
export type { ServerEventFanoutMessage };

export interface ServerEventBus {
  publish(message: ServerEventFanoutMessage): Promise<void>;
}
