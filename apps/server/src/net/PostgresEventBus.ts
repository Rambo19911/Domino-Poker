import { randomUUID } from "node:crypto";

import { Client, Pool, type QueryResult, type QueryResultRow } from "pg";

import { runMigrations } from "../storage/migrations.js";
import type { PgPoolOptions, PoolStats } from "../storage/PostgresStorage.js";
import type { ServerEventBus, ServerEventFanoutMessage } from "./ServerEventBus.js";

const CHANNEL = "domino_poker_fanout";
const DEFAULT_RETENTION_MS = 60 * 60 * 1000;
const DEFAULT_PRUNE_INTERVAL_MS = 60 * 1000;
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const MAX_LOCAL_EVENT_IDS = 1024;
const MAX_DELIVERED_EVENT_IDS = 2048;

interface PgPool {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
  readonly totalCount?: number;
  readonly idleCount?: number;
  readonly waitingCount?: number;
}

interface PgNotification {
  readonly payload?: string;
}

interface PgListener {
  connect(): Promise<unknown>;
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "notification", listener: (notification: PgNotification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
}

export interface PostgresEventBusOptions {
  readonly connectionString: string;
  readonly instanceId: string;
  readonly clock?: () => number;
  readonly pool?: PgPool;
  readonly poolOptions?: PgPoolOptions;
  readonly listenerFactory?: () => PgListener;
  readonly retentionMs?: number;
  readonly pruneIntervalMs?: number;
  readonly reconnectDelayMs?: number;
  readonly logger?: Pick<Console, "error">;
}

export class PostgresEventBus implements ServerEventBus {
  private readonly pool: PgPool;
  private readonly createListener: () => PgListener;
  private readonly instanceId: string;
  private readonly clock: () => number;
  private readonly retentionMs: number;
  private readonly pruneIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly logger: Pick<Console, "error">;
  private readonly localEventIds = new Set<string>();
  private readonly localEventIdQueue: string[] = [];
  private readonly deliveredEventIds = new Set<string>();
  private readonly deliveredEventIdQueue: string[] = [];
  private handler: ((message: ServerEventFanoutMessage) => void) | undefined;
  private listener: PgListener | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pruneTimer: ReturnType<typeof setInterval> | undefined;
  private nextPruneAt = 0;
  private missedFanoutSince: number | undefined;
  private listenerGeneration = 0;
  private listening = false;
  private stopped = false;

  private constructor(options: PostgresEventBusOptions) {
    if (options.instanceId.trim() === "") {
      throw new Error("PostgresEventBus requires a non-empty instanceId.");
    }
    this.instanceId = options.instanceId;
    this.clock = options.clock ?? (() => Date.now());
    this.retentionMs = normalizePositive(options.retentionMs ?? DEFAULT_RETENTION_MS, "retentionMs");
    this.pruneIntervalMs = normalizePositive(
      options.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS,
      "pruneIntervalMs"
    );
    this.reconnectDelayMs = normalizePositive(
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
      "reconnectDelayMs"
    );
    this.logger = options.logger ?? console;
    this.pool =
      options.pool ??
      new Pool({ connectionString: options.connectionString, ...options.poolOptions });
    this.createListener =
      options.listenerFactory ?? (() => new PgClientListener(options.connectionString));
  }

  static async open(options: PostgresEventBusOptions): Promise<PostgresEventBus> {
    const bus = new PostgresEventBus(options);
    await bus.migrate();
    return bus;
  }

  async start(handler: (message: ServerEventFanoutMessage) => void): Promise<void> {
    if (this.listening) {
      return;
    }
    this.handler = handler;
    this.stopped = false;
    this.startPruneTimer();
    await this.connectListener();
  }

  /**
   * Periodisks `server_event_fanout` tīrīšanas timeris (F7). Bez šī prune notiktu
   * TIKAI `publish` laikā, tāpēc patērētāj-only instance (kas neko nepublicē) nekad
   * netīrītu tabulu un rindas augtu bezgalīgi. `nextPruneAt` aizsargs novērš dubultu
   * prune, ja `publish` jau nesen iztīrīja. `unref` ļauj procesam beigties.
   */
  private startPruneTimer(): void {
    if (this.pruneTimer !== undefined) {
      return;
    }
    this.pruneTimer = setInterval(() => {
      if (this.stopped) {
        return;
      }
      void this.pruneExpiredFanout(this.clock()).catch((error: unknown) => {
        this.logger.error("[postgres-event-bus] periodic prune failed:", error);
      });
    }, this.pruneIntervalMs);
    this.pruneTimer.unref?.();
  }

  async publish(message: ServerEventFanoutMessage): Promise<void> {
    const now = this.clock();
    await this.pruneExpiredFanout(now);

    const eventId = randomUUID();
    this.rememberLocalEventId(eventId);
    await this.pool.query(
      `WITH inserted AS (
         INSERT INTO server_event_fanout
           (event_id, origin_instance_id, message_json, created_at)
         VALUES ($1, $2, $3::jsonb, $4)
         RETURNING event_id
       )
       SELECT pg_notify($5, event_id) FROM inserted`,
      [eventId, this.instanceId, JSON.stringify(message), now, CHANNEL]
    );
  }

  /** Event-bus pool piesātinājums `/metrics` trendiem (atsevišķs no storage pool). */
  poolStats(): PoolStats {
    return {
      total: this.pool.totalCount ?? 0,
      idle: this.pool.idleCount ?? 0,
      waiting: this.pool.waitingCount ?? 0
    };
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.listening = false;
    this.listenerGeneration += 1;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.pruneTimer !== undefined) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    await this.listener?.end();
    await this.pool.end();
  }

  private async connectListener(): Promise<void> {
    const generation = (this.listenerGeneration += 1);
    const listener = this.createListener();
    this.listener = listener;
    listener.on("notification", (notification) => {
      if (generation !== this.listenerGeneration || this.stopped) {
        return;
      }
      void this.deliverNotification(notification.payload).catch((error: unknown) => {
        this.logger.error("[postgres-event-bus] failed to deliver notification:", error);
      });
    });
    listener.on("error", (error) => {
      this.handleListenerFailure(generation, error);
    });
    listener.on("end", () => {
      this.handleListenerFailure(generation);
    });

    await listener.connect();
    if (generation !== this.listenerGeneration || this.stopped) {
      await listener.end();
      return;
    }
    await listener.query(`LISTEN ${CHANNEL}`);
    this.listening = true;
    const catchUpSince = this.missedFanoutSince;
    if (catchUpSince !== undefined) {
      await this.catchUpMissedFanout(catchUpSince)
        .then(() => {
          if (generation === this.listenerGeneration) {
            this.missedFanoutSince = undefined;
          }
        })
        .catch((error: unknown) => {
          this.logger.error("[postgres-event-bus] failed to catch up missed fanout:", error);
        });
    }
  }

  private handleListenerFailure(generation: number, error?: Error): void {
    if (this.stopped || generation !== this.listenerGeneration) {
      return;
    }
    if (error) {
      this.logger.error("[postgres-event-bus] listener failed:", error);
    }
    this.listening = false;
    this.missedFanoutSince ??= this.clock();
    const failedListener = this.listener;
    void failedListener?.end().catch((endError: unknown) => {
      this.logger.error("[postgres-event-bus] failed to close listener after failure:", endError);
    });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stopped) {
        return;
      }
      void this.connectListener().catch((error: unknown) => {
        this.logger.error("[postgres-event-bus] failed to reconnect listener:", error);
        this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private async migrate(): Promise<void> {
    await runMigrations(this.pool);
  }

  private async deliverNotification(eventId: string | undefined): Promise<void> {
    if (!eventId || this.handler === undefined) {
      return;
    }
    if (this.localEventIds.has(eventId)) {
      return;
    }
    if (this.deliveredEventIds.has(eventId)) {
      return;
    }
    const result = await this.pool.query<FanoutRow>(
      `SELECT origin_instance_id, message_json
         FROM server_event_fanout
        WHERE event_id = $1`,
      [eventId]
    );
    const row = result.rows[0];
    if (!row || row.origin_instance_id === this.instanceId) {
      return;
    }
    if (this.deliveredEventIds.has(eventId)) {
      return;
    }
    this.rememberDeliveredEventId(eventId);
    this.handler(parseJsonValue<ServerEventFanoutMessage>(row.message_json));
  }

  private async catchUpMissedFanout(since: number): Promise<void> {
    if (this.handler === undefined) {
      return;
    }
    const result = await this.pool.query<CatchUpFanoutRow>(
      `SELECT event_id, origin_instance_id, message_json
         FROM server_event_fanout
        WHERE created_at >= $1
        ORDER BY created_at ASC, event_id ASC`,
      [since]
    );
    for (const row of result.rows) {
      if (
        row.origin_instance_id === this.instanceId ||
        this.localEventIds.has(row.event_id) ||
        this.deliveredEventIds.has(row.event_id)
      ) {
        continue;
      }
      this.rememberDeliveredEventId(row.event_id);
      this.handler(parseJsonValue<ServerEventFanoutMessage>(row.message_json));
    }
  }

  private async pruneExpiredFanout(now: number): Promise<void> {
    if (now < this.nextPruneAt) {
      return;
    }
    this.nextPruneAt = now + this.pruneIntervalMs;
    await this.pool.query(`DELETE FROM server_event_fanout WHERE created_at < $1`, [
      now - this.retentionMs
    ]);
  }

  private rememberLocalEventId(eventId: string): void {
    this.localEventIds.add(eventId);
    this.localEventIdQueue.push(eventId);
    while (this.localEventIdQueue.length > MAX_LOCAL_EVENT_IDS) {
      const expired = this.localEventIdQueue.shift();
      if (expired !== undefined) {
        this.localEventIds.delete(expired);
      }
    }
  }

  private rememberDeliveredEventId(eventId: string): void {
    this.deliveredEventIds.add(eventId);
    this.deliveredEventIdQueue.push(eventId);
    while (this.deliveredEventIdQueue.length > MAX_DELIVERED_EVENT_IDS) {
      const expired = this.deliveredEventIdQueue.shift();
      if (expired !== undefined) {
        this.deliveredEventIds.delete(expired);
      }
    }
  }
}

interface FanoutRow {
  readonly origin_instance_id: string;
  readonly message_json: unknown;
}

interface CatchUpFanoutRow extends FanoutRow {
  readonly event_id: string;
}

function parseJsonValue<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function normalizePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`PostgresEventBus ${name} must be a positive finite number.`);
  }
  return Math.floor(value);
}

class PgClientListener implements PgListener {
  private readonly client: Client;

  constructor(connectionString: string) {
    this.client = new Client({ connectionString });
  }

  connect(): Promise<unknown> {
    return this.client.connect();
  }

  query(text: string, values?: readonly unknown[]): Promise<unknown> {
    return values === undefined ? this.client.query(text) : this.client.query(text, [...values]);
  }

  end(): Promise<unknown> {
    return this.client.end();
  }

  on(event: "notification", listener: (notification: PgNotification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(
    event: "notification" | "error" | "end",
    listener: ((notification: PgNotification) => void) | ((error: Error) => void) | (() => void)
  ): unknown {
    if (event === "notification") {
      return this.client.on("notification", (notification) => {
        (listener as (notification: PgNotification) => void)(
          notification.payload === undefined ? {} : { payload: notification.payload }
        );
      });
    }
    if (event === "error") {
      return this.client.on("error", listener as (error: Error) => void);
    }
    return this.client.on("end", listener as () => void);
  }
}
