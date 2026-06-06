import { describe, expect, it } from "vitest";

import { LoadMetrics, percentile, summarizeLatencies } from "../src/metrics.js";

describe("percentile (nearest-rank)", () => {
  it("returns 0 for an empty list", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("computes nearest-rank percentiles", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 100)).toBe(10);
    expect(percentile(sorted, 0)).toBe(1);
  });

  it("clamps out-of-range percentiles", () => {
    expect(percentile([10, 20, 30], 150)).toBe(30);
    expect(percentile([10, 20, 30], -5)).toBe(10);
  });
});

describe("summarizeLatencies", () => {
  it("returns zeros for no samples", () => {
    expect(summarizeLatencies([])).toEqual({
      count: 0,
      minMs: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0
    });
  });

  it("summarizes unsorted samples correctly", () => {
    const summary = summarizeLatencies([30, 10, 20]);
    expect(summary.count).toBe(3);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(30);
    expect(summary.meanMs).toBe(20);
    expect(summary.p50Ms).toBe(20);
  });
});

describe("LoadMetrics aggregation", () => {
  it("aggregates counters, errors, and latencies into a report", () => {
    const metrics = new LoadMetrics();
    metrics.recordConnect(12);
    metrics.recordConnect(8);
    metrics.recordConnectFailure();
    metrics.recordRtt(5);
    metrics.recordRtt(15);
    metrics.recordSent(3);
    metrics.recordReceived(4);
    metrics.recordDropped();
    metrics.recordCleanClose();
    metrics.recordReconnect();
    metrics.recordReconnect();
    metrics.recordError("RATE_LIMITED");
    metrics.recordError("RATE_LIMITED");

    const report = metrics.report();
    expect(report.reconnects).toBe(2);
    expect(report.connectedClients).toBe(2);
    expect(report.connectFailures).toBe(1);
    expect(report.messagesSent).toBe(3);
    expect(report.messagesReceived).toBe(4);
    expect(report.droppedSockets).toBe(1);
    expect(report.cleanClosures).toBe(1);
    expect(report.errorsByCode).toEqual({ RATE_LIMITED: 2 });
    expect(report.connectLatency.count).toBe(2);
    expect(report.connectLatency.meanMs).toBe(10);
    expect(report.messageLatency.maxMs).toBe(15);
  });
});
