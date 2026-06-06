import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createHealthHttpServer } from "../src/httpServer.js";

const servers: ReturnType<typeof createHealthHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
});

describe("createHealthHttpServer", () => {
  it("returns ok for GET /health", async () => {
    const server = createHealthHttpServer();
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns process + connection metrics for GET /metrics", async () => {
    let connections = 7;
    const server = createHealthHttpServer({ connectionCount: () => connections });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const metrics = (await (await fetch(`http://127.0.0.1:${address.port}/metrics`)).json()) as {
      rssBytes: number;
      connections: number;
      uptimeSec: number;
      cpuUserMicros: number;
    };

    expect(metrics.connections).toBe(7);
    expect(metrics.rssBytes).toBeGreaterThan(0);
    expect(metrics.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(metrics.cpuUserMicros).toBeGreaterThanOrEqual(0);

    connections = 12; // provideris tiek lasīts dzīvi katrā pieprasījumā
    const second = (await (await fetch(`http://127.0.0.1:${address.port}/metrics`)).json()) as {
      connections: number;
    };
    expect(second.connections).toBe(12);
  });

  it("omits db health from /metrics when no probe is provided", async () => {
    const server = createHealthHttpServer({ connectionCount: () => 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const metrics = (await (
      await fetch(`http://127.0.0.1:${address.port}/metrics`)
    ).json()) as Record<string, unknown>;

    expect(metrics).not.toHaveProperty("db");
  });

  it("includes db health in /metrics when a probe is provided", async () => {
    const server = createHealthHttpServer({
      connectionCount: () => 3,
      dbHealth: () =>
        Promise.resolve({
          ok: true,
          latencyMs: 4,
          pool: { total: 5, idle: 2, waiting: 0 },
          fanout: { rows: 12, oldestAgeMs: 3000 },
          tables: { matches: { rows: 7, bytes: 8192 } },
          eventBusPool: { total: 2, idle: 1, waiting: 0 }
        })
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;

    const metrics = (await (
      await fetch(`http://127.0.0.1:${address.port}/metrics`)
    ).json()) as { connections: number; db: Record<string, unknown> };

    expect(metrics.connections).toBe(3);
    expect(metrics.db).toEqual({
      ok: true,
      latencyMs: 4,
      pool: { total: 5, idle: 2, waiting: 0 },
      fanout: { rows: 12, oldestAgeMs: 3000 },
      tables: { matches: { rows: 7, bytes: 8192 } },
      eventBusPool: { total: 2, idle: 1, waiting: 0 }
    });
  });
});
