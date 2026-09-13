/**
 * src/utils/limiter.ts
 *
 * Concurrency and rate limiting for a 4 GB / dual-core machine.
 *
 * Governed by:
 *  - ARCHITECTURE.md §5  (Resource Constraints — sequential work over parallel farms)
 *  - ARCHITECTURE.md §37 (Concurrency — 1-2 workers by default, configurable limiter
 *    for requests/sec, concurrent domains, browser instances, retries)
 *  - DATA_SOURCES.md §3  (Overpass API — "1 request at a time, backoff on 429/504")
 *
 * Two independent primitives are provided, meant to be composed by callers:
 *
 *   - createConcurrencyLimiter(n)  — caps how many `fn`s run at once.
 *   - RateLimiter(ratePerInterval) — caps how often `fn`s may *start*.
 *   - KeyedConcurrencyLimiter      — a concurrency limiter per key (e.g. per domain),
 *                                    so one slow domain can't starve others while the
 *                                    global limiter still bounds total concurrency.
 *
 * No external dependency (e.g. p-limit) is used — the implementation is small
 * enough that pulling in a package isn't justified for this project.
 */

/** A function that runs `fn` under whatever limiting policy it implements. */
export type Limit = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Creates a simple concurrency limiter: at most `concurrency` functions
 * passed to the returned `limit()` will be in flight at once. Additional
 * calls queue in FIFO order.
 */
export function createConcurrencyLimiter(concurrency: number): Limit {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    active++;
    next();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            runNext();
          });
      };
      queue.push(task);
      runNext();
    });
  };
}

/**
 * Token-bucket style rate limiter: ensures no more than `permits` calls are
 * *started* within any rolling `intervalMs` window. Unlike the concurrency
 * limiter, this bounds start rate, not simultaneous in-flight work — useful
 * for being polite to a shared public API (e.g. Overpass) independent of how
 * long each individual request takes.
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];
  private queue: Array<() => void> = [];
  private draining = false;

  constructor(
    private readonly permits: number,
    private readonly intervalMs: number,
  ) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new RangeError(`permits must be a positive integer, got ${permits}`);
    }
    if (intervalMs <= 0) {
      throw new RangeError(`intervalMs must be positive, got ${intervalMs}`);
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        fn().then(resolve, reject);
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.pump();
  }

  private pump(): void {
    const now = Date.now();
    while (this.timestamps.length > 0 && now - this.timestamps[0] >= this.intervalMs) {
      this.timestamps.shift();
    }

    if (this.queue.length === 0) {
      this.draining = false;
      return;
    }

    if (this.timestamps.length < this.permits) {
      this.timestamps.push(now);
      const task = this.queue.shift()!;
      task();
      // Continue draining on the next tick so we don't blow the call stack
      // when many tasks are queued at once.
      setImmediate(() => this.pump());
      return;
    }

    const waitMs = this.intervalMs - (now - this.timestamps[0]);
    setTimeout(() => this.pump(), Math.max(waitMs, 0));
  }
}

/**
 * Maintains one concurrency limiter per key (e.g. per domain), created
 * lazily on first use. Intended to be combined with a global limiter:
 *
 * ```ts
 * const globalLimit = createConcurrencyLimiter(4);   // ARCHITECTURE.md §37 default
 * const perDomainLimit = new KeyedConcurrencyLimiter(1);
 *
 * await globalLimit(() => perDomainLimit.run(domain, () => fetchPage(url)));
 * ```
 *
 * Idle keys (no active or queued work) are evicted after `idleTtlMs` so a
 * long run touching thousands of distinct domains doesn't grow this map
 * unbounded — relevant given the 4 GB RAM ceiling (ARCHITECTURE.md §5).
 */
export class KeyedConcurrencyLimiter {
  private readonly limiters = new Map<string, { limit: Limit; pending: number; lastUsed: number }>();

  constructor(
    private readonly concurrencyPerKey: number,
    private readonly idleTtlMs = 5 * 60_000,
  ) {}

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let entry = this.limiters.get(key);
    if (!entry) {
      entry = { limit: createConcurrencyLimiter(this.concurrencyPerKey), pending: 0, lastUsed: Date.now() };
      this.limiters.set(key, entry);
    }

    entry.pending++;
    entry.lastUsed = Date.now();

    return entry.limit(fn).finally(() => {
      entry!.pending--;
      entry!.lastUsed = Date.now();
      this.evictIdle();
    });
  }

  private evictIdle(): void {
    const cutoff = Date.now() - this.idleTtlMs;
    for (const [key, entry] of this.limiters) {
      if (entry.pending === 0 && entry.lastUsed < cutoff) {
        this.limiters.delete(key);
      }
    }
  }

  /** Number of distinct keys currently tracked (mainly for tests/diagnostics). */
  get size(): number {
    return this.limiters.size;
  }
}
