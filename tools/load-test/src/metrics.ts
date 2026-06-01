/**
 * Slodzes testa metriku agregācija (Fāze 11). Šeit dzīvo TĪRA aprēķinu loģika
 * (latency kopsavilkumi, skaitītāji) — tā ir izolēti testējama, neatkarīgi no
 * tīkla. `VirtualClient` un CLI tikai padod izmērītos paraugus.
 */

export interface LatencySummary {
  readonly count: number;
  readonly minMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

/** Nearest-rank percentile augošā sarakstā (p ∈ [0,100]). Tukšam → 0. */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clamped / 100) * sortedAsc.length);
  const index = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[index] as number;
}

/** Kopsavilkums no neapstrādātiem latency paraugiem (ms). */
export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    return { count: 0, minMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    minMs: sorted[0] as number,
    meanMs: sum / sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1] as number
  };
}

export interface LoadReport {
  readonly connectedClients: number;
  readonly connectFailures: number;
  readonly messagesSent: number;
  readonly messagesReceived: number;
  /** Negaidīti (ne paša iniciēti) socket aizvērumi testa laikā. */
  readonly droppedSockets: number;
  readonly cleanClosures: number;
  /** Apzināti disconnect→reconnect cikli (churn), ko klients pats iniciēja. */
  readonly reconnects: number;
  /** Servera ERROR notikumi pēc koda (piem. RATE_LIMITED). */
  readonly errorsByCode: Readonly<Record<string, number>>;
  readonly connectLatency: LatencySummary;
  readonly messageLatency: LatencySummary;
}

/**
 * Pavedienu-drošs (Node ir vienpavediena) skaitītājs/paraugu krātuve, ko visi
 * virtuālie klienti dala. Agregē rezultātus vienā `LoadReport`.
 */
export class LoadMetrics {
  private connected = 0;
  private connectFailures = 0;
  private messagesSent = 0;
  private messagesReceived = 0;
  private droppedSockets = 0;
  private cleanClosures = 0;
  private reconnects = 0;
  private readonly connectLatencies: number[] = [];
  private readonly messageLatencies: number[] = [];
  private readonly errorsByCode = new Map<string, number>();

  recordConnect(latencyMs: number): void {
    this.connected += 1;
    this.connectLatencies.push(latencyMs);
  }
  recordConnectFailure(): void {
    this.connectFailures += 1;
  }
  recordRtt(latencyMs: number): void {
    this.messageLatencies.push(latencyMs);
  }
  recordSent(count = 1): void {
    this.messagesSent += count;
  }
  recordReceived(count = 1): void {
    this.messagesReceived += count;
  }
  recordError(code: string): void {
    this.errorsByCode.set(code, (this.errorsByCode.get(code) ?? 0) + 1);
  }
  recordDropped(): void {
    this.droppedSockets += 1;
  }
  recordCleanClose(): void {
    this.cleanClosures += 1;
  }
  recordReconnect(): void {
    this.reconnects += 1;
  }

  report(): LoadReport {
    return {
      connectedClients: this.connected,
      connectFailures: this.connectFailures,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      droppedSockets: this.droppedSockets,
      cleanClosures: this.cleanClosures,
      reconnects: this.reconnects,
      errorsByCode: Object.fromEntries(this.errorsByCode),
      connectLatency: summarizeLatencies(this.connectLatencies),
      messageLatency: summarizeLatencies(this.messageLatencies)
    };
  }
}
