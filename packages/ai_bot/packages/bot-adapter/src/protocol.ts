import { z } from "zod";
import type { Move, PlayerView } from "@domino-poker/engine";
import type { MoveEvaluation } from "@domino-poker/ai";

// Worker protocol (plan §5). Messages are a discriminated union validated with zod at the
// thread boundary so a worker can never act on a malformed message.

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const intSchema = z.number().int();
const seatTupleSchema = z.tuple([intSchema, intSchema, intSchema, intSchema]);
const moveSchema = z.object({ tile: intSchema, calledPip: intSchema });
const trickPlaySchema = z.object({ seat: seatSchema, move: moveSchema });

const trickSchema = z.object({
  leader: seatSchema,
  plays: z.array(trickPlaySchema),
  calledPip: intSchema,
  leadIsTrump: z.boolean(),
  maxTrumpRank: intSchema,
  anyTrumpPlayed: z.boolean(),
  isEmpty: z.boolean()
});

const playEventSchema = z.object({
  seat: seatSchema,
  move: moveSchema,
  trickNo: intSchema,
  posInTrick: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
});

const playerViewSchema = z.object({
  seat: seatSchema,
  hand: intSchema,
  bids: seatTupleSchema,
  taken: seatTupleSchema,
  firstSeat: seatSchema,
  trick: trickSchema,
  history: z.array(playEventSchema)
});

const botConfigSchema = z.object({
  explorationC: z.number().optional(),
  bidSamples: z.number().int().positive().optional(),
  // Bot objective. "inclusion" (the project goal: bid what you can take and take it) uses the
  // inclusion bidder + inclusion-reward search; "points" maximizes score. Defaults to inclusion.
  objective: z.enum(["points", "inclusion"]).optional(),
  evTolerance: z.number().optional()
});

export type BotConfig = z.infer<typeof botConfigSchema>;

const toWorkerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("INIT"), seed: intSchema, config: botConfigSchema }),
  z.object({ type: z.literal("SYNC"), view: playerViewSchema }),
  z.object({ type: z.literal("PONDER_ON") }),
  z.object({ type: z.literal("PONDER_OFF") }),
  z.object({ type: z.literal("REQUEST_BID"), requestId: intSchema, budgetMs: z.number().nonnegative() }),
  z.object({ type: z.literal("REQUEST_MOVE"), requestId: intSchema, budgetMs: z.number().nonnegative() })
]);

const moveEvaluationSchema = z.object({ move: moveSchema, visits: intSchema, reward: z.number() });

const fromWorkerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("READY") }),
  z.object({ type: z.literal("BID"), requestId: intSchema, bid: intSchema }),
  z.object({ type: z.literal("MOVE"), requestId: intSchema, move: moveSchema, evaluations: z.array(moveEvaluationSchema), iterations: intSchema }),
  z.object({ type: z.literal("PROGRESS"), iterations: intSchema })
]);

export type ToWorkerMessage =
  | { type: "INIT"; seed: number; config: BotConfig }
  | { type: "SYNC"; view: PlayerView }
  | { type: "PONDER_ON" }
  | { type: "PONDER_OFF" }
  | { type: "REQUEST_BID"; requestId: number; budgetMs: number }
  | { type: "REQUEST_MOVE"; requestId: number; budgetMs: number };

export type FromWorkerMessage =
  | { type: "READY" }
  | { type: "BID"; requestId: number; bid: number }
  | { type: "MOVE"; requestId: number; move: Move; evaluations: MoveEvaluation[]; iterations: number }
  | { type: "PROGRESS"; iterations: number };

export function parseToWorker(message: unknown): ToWorkerMessage {
  return toWorkerSchema.parse(message) as ToWorkerMessage;
}

export function parseFromWorker(message: unknown): FromWorkerMessage {
  return fromWorkerSchema.parse(message) as FromWorkerMessage;
}
