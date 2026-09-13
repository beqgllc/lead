/**
 * src/utils/retry.ts
 *
 * Bounded retry-with-backoff helper.
 *
 * Governed by ARCHITECTURE.md §39 (Retry Strategy):
 *   Attempt 1 -> failure -> wait -> Attempt 2 -> failure -> wait -> Attempt 3 -> mark uncertain
 *
 * This module intentionally does NOT retry forever, and does not know about
 * HTTP/DNS specifics — callers (src/verification/*, src/ai/client.ts, etc.)
 * supply an `isRetryable` predicate appropriate to their domain.
 */

export interface RetryOptions {
  /** Total attempts including the first try. Default 3, per ARCHITECTURE.md §39. */
  maxAttempts?: number;
  /** Delay before the first retry, in ms. Default 300ms. */
  baseDelayMs?: number;
  /** Upper bound on any single delay, in ms. Default 10s. */
  maxDelayMs?: number;
  /** Exponential backoff multiplier. Default 2. */
  factor?: number;
  /** Add random jitter (0..delay) to avoid thundering-herd retries. Default true. */
  jitter?: boolean;
  /**
   * Decide whether a given error should be retried. Receives the error and
   * the attempt number that just failed (1-indexed). Defaults to "retry
   * everything" — callers dealing with network/HTTP code should supply a
   * more precise predicate (e.g. skip retrying on 4xx).
   */
  isRetryable?: (error: unknown, attempt: number) => boolean;
  /** Observability hook, called before each sleep-and-retry. Never throws. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Optional abort signal; sleeping is interrupted immediately if aborted. */
  signal?: AbortSignal;
}

const DEFAULTS: Required<Omit<RetryOptions, "isRetryable" | "onRetry" | "signal">> = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 10_000,
  factor: 2,
  jitter: true,
};

export class RetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly cause: unknown,
  ) {
    super(`Operation failed after ${attempts} attempt(s): ${describeCause(cause)}`);
    this.name = "RetryExhaustedError";
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return String(cause);
  } catch {
    return "unknown error";
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function computeDelay(attempt: number, options: Required<Omit<RetryOptions, "isRetryable" | "onRetry" | "signal">>): number {
  const raw = options.baseDelayMs * Math.pow(options.factor, attempt - 1);
  const capped = Math.min(raw, options.maxDelayMs);
  if (!options.jitter) return capped;
  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

/**
 * A small set of common transient-failure signatures. Useful as a starting
 * point for an `isRetryable` predicate in network-facing callers; not
 * exhaustive and deliberately conservative (prefer false positives — i.e.
 * retrying something that didn't need it — over silently giving up on a
 * genuinely transient failure).
 */
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isFinite(status) && (status === 429 || status >= 500)) return true;
  }
  return false;
}

/**
 * Runs `fn`, retrying with exponential backoff on failure.
 *
 * `fn` receives the current attempt number (1-indexed) in case the caller
 * wants to vary behavior (e.g. shorter per-attempt timeout on later tries).
 *
 * Throws `RetryExhaustedError` (wrapping the last error) once attempts are
 * exhausted or `isRetryable` returns false.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      const attemptsRemain = attempt < opts.maxAttempts;
      const retryable = isRetryable(err, attempt);

      if (!attemptsRemain || !retryable) {
        throw new RetryExhaustedError(attempt, err);
      }

      const delayMs = computeDelay(attempt, opts);
      options.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }

  // Unreachable, but keeps the type checker satisfied.
  throw new RetryExhaustedError(opts.maxAttempts, lastError);
}
