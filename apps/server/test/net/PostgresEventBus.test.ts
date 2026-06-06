import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PostgresEventBus } from "../../src/net/PostgresEventBus.js";

type QueryCall = {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
};

class RecordingPool {
  readonly queries: QueryCall[] = [];
  fanoutRows: QueryResultRow[] = [];
  totalCount = 0;
  idleCount = 0;
  waitingCount = 0;

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });
    if (text.includes("WHERE created_at >= $1")) {
      return {
        rows: this.fanoutRows as T[],
        command: "",
        rowCount: this.fanoutRows.length,
        oid: 0,
        fields: []
      };
    }
    return {
      rows: [],
      command: "",
      rowCount: 0,
      oid: 0,
      fields: []
    };
  }

  async end(): Promise<void> {
    // Nothing to close in the fake pool.
  }
}

class FakeListener {
  readonly queries: string[] = [];
  private readonly notificationHandlers: Array<(notification: { readonly payload?: string }) => void> = [];
  private readonly errorHandlers: Array<(error: Error) => void> = [];
  private readonly endHandlers: Array<() => void> = [];
  connected = false;
  ended = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async query(text: string): Promise<void> {
    this.queries.push(text);
  }

  async end(): Promise<void> {
    this.ended = true;
  }

  on(event: "notification", listener: (notification: { readonly payload?: string }) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "end", listener: () => void): this;
  on(
    event: "notification" | "error" | "end",
    listener: ((notification: { readonly payload?: string }) => void) | ((error: Error) => void) | (() => void)
  ): this {
    if (event === "notification") {
      this.notificationHandlers.push(listener as (notification: { readonly payload?: string }) => void);
    } else if (event === "error") {
      this.errorHandlers.push(listener as (error: Error) => void);
    } else {
      this.endHandlers.push(listener as () => void);
    }
    return this;
  }

  emitNotification(payload?: string): void {
    for (const handler of this.notificationHandlers) {
      handler(payload === undefined ? {} : { payload });
    }
  }

  emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }
}

describe("PostgresEventBus", () => {
  it("publishes fanout with one INSERT+NOTIFY statement and prunes expired rows", async () => {
    const pool = new RecordingPool();
    const listener = new FakeListener();
    const bus = await PostgresEventBus.open({
      connectionString: "postgres://test",
      instanceId: "instance-a",
      clock: () => 10_000,
      pool,
      listenerFactory: () => listener,
      retentionMs: 1_000,
      pruneIntervalMs: 1_000
    });

    await bus.publish({
      kind: "broadcast",
      event: { type: "LOBBY_STATE", rooms: [], onlineCount: 1 }
    });

    const deleteQuery = pool.queries.find((query) =>
      query.text.includes("DELETE FROM server_event_fanout")
    );
    expect(deleteQuery?.values).toEqual([9_000]);

    const publishQuery = pool.queries.find((query) => query.text.includes("WITH inserted AS"));
    expect(publishQuery?.text).toContain("INSERT INTO server_event_fanout");
    expect(publishQuery?.text).toContain("SELECT pg_notify");
    expect(publishQuery?.values?.[1]).toBe("instance-a");
    expect(publishQuery?.values?.[4]).toBe("domino_poker_fanout");

    await bus.close();
  });

  it("does not select the just-published local event on self-notification", async () => {
    const pool = new RecordingPool();
    const listener = new FakeListener();
    const bus = await PostgresEventBus.open({
      connectionString: "postgres://test",
      instanceId: "instance-a",
      clock: () => 1_000,
      pool,
      listenerFactory: () => listener
    });
    await bus.start(() => {
      throw new Error("Local self-notification must not be delivered.");
    });

    await bus.publish({
      kind: "broadcast",
      event: { type: "LOBBY_STATE", rooms: [], onlineCount: 1 }
    });
    const publishQuery = pool.queries.find((query) => query.text.includes("WITH inserted AS"));
    const eventId = publishQuery?.values?.[0];
    expect(typeof eventId).toBe("string");

    listener.emitNotification(eventId as string);
    await Promise.resolve();

    const lookupQueries = pool.queries.filter((query) =>
      query.text.includes("SELECT origin_instance_id")
    );
    expect(lookupQueries).toHaveLength(0);

    await bus.close();
  });

  it("exposes event-bus pool saturation via poolStats", async () => {
    const pool = new RecordingPool();
    pool.totalCount = 3;
    pool.idleCount = 1;
    pool.waitingCount = 2;
    const bus = await PostgresEventBus.open({
      connectionString: "postgres://test",
      instanceId: "instance-a",
      pool,
      listenerFactory: () => new FakeListener()
    });

    expect(bus.poolStats()).toEqual({ total: 3, idle: 1, waiting: 2 });

    await bus.close();
  });

  it("reconnects the LISTEN client after a listener error", async () => {
    vi.useFakeTimers();
    try {
      const pool = new RecordingPool();
      const listeners: FakeListener[] = [];
      const bus = await PostgresEventBus.open({
        connectionString: "postgres://test",
        instanceId: "instance-a",
        pool,
        listenerFactory: () => {
          const listener = new FakeListener();
          listeners.push(listener);
          return listener;
        },
        reconnectDelayMs: 5,
        logger: { error: vi.fn() }
      });
      await bus.start(() => {
        // No fanout delivery needed for this test.
      });

      listeners[0]?.emitError(new Error("network down"));
      await vi.advanceTimersByTimeAsync(5);

      expect(listeners).toHaveLength(2);
      expect(listeners[0]?.ended).toBe(true);
      expect(listeners[1]?.connected).toBe(true);
      expect(listeners[1]?.queries).toEqual(["LISTEN domino_poker_fanout"]);

      await bus.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("catches up remote fanout rows missed while the LISTEN client reconnects", async () => {
    vi.useFakeTimers();
    try {
      let now = 1_000;
      const pool = new RecordingPool();
      const listeners: FakeListener[] = [];
      const received: unknown[] = [];
      const missedMessage = {
        kind: "broadcast",
        event: { type: "LOBBY_STATE", rooms: [], onlineCount: 2 }
      };
      const bus = await PostgresEventBus.open({
        connectionString: "postgres://test",
        instanceId: "instance-a",
        clock: () => now,
        pool,
        listenerFactory: () => {
          const listener = new FakeListener();
          listeners.push(listener);
          return listener;
        },
        reconnectDelayMs: 5,
        logger: { error: vi.fn() }
      });
      await bus.start((message) => received.push(message));

      listeners[0]?.emitError(new Error("network down"));
      now = 1_050;
      pool.fanoutRows = [
        {
          event_id: "missed-event",
          origin_instance_id: "instance-b",
          message_json: missedMessage
        }
      ];
      await vi.advanceTimersByTimeAsync(5);

      const catchUpQuery = pool.queries.find((query) =>
        query.text.includes("WHERE created_at >= $1")
      );
      expect(catchUpQuery?.values).toEqual([1_000]);
      expect(received).toEqual([missedMessage]);

      await bus.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
