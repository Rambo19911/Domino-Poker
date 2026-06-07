/**
 * Vienkāršs fiksēta-loga rate limiter (in-memory). Lieto login/register brute-force
 * mazināšanai. **Ierobežojums:** stāvoklis ir per-instance — vairāku instanču vidē
 * netiek dalīts (pieņemams v1 single-instance VPS; sk. docs/auth-plan.md).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const PRUNE_THRESHOLD = 10_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number
  ) {}

  /** Atgriež `true`, ja darbība atļauta; `false`, ja limits sasniegts. */
  check(key: string): boolean {
    const now = this.clock();
    if (this.buckets.size > PRUNE_THRESHOLD) {
      this.prune(now);
    }
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.limit) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}
