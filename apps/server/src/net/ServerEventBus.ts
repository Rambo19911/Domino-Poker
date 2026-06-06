import type { ServerEvent } from "@domino-poker/shared";

export type ServerEventFanoutMessage =
  | {
      readonly kind: "broadcast";
      readonly event: ServerEvent;
    }
  | {
      readonly kind: "player";
      readonly playerId: string;
      readonly event: ServerEvent;
    }
  | {
      readonly kind: "supersede";
      readonly playerId: string;
    };

export interface ServerEventBus {
  publish(message: ServerEventFanoutMessage): Promise<void>;
}
