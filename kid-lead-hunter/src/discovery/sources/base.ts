/**
 * src/discovery/sources/base.ts
 *
 * The `DiscoverySource` contract every adapter (OpenStreetMap, Foursquare,
 * web-search domain discovery, future sources) implements, plus an
 * abstract base class that centralizes the concerns every adapter needs so
 * individual adapters can stay focused on "how do I call this specific
 * API/endpoint."
 *
 * Governed by:
 *  - ARCHITECTURE.md §9  (DiscoverySource interface, modular sources)
 *  - ARCHITECTURE.md §10 (Data-Source Rule — every adapter documents name,
 *    access method, rate limits, attribution, storage limits, prohibited
 *    uses, fields collected)
 *  - ARCHITECTURE.md §39 (bounded retry with backoff)
 *  - ARCHITECTURE.md §46, §65 (a failed source must not terminate a run —
 *    errors are classified and isolated, not thrown up to the pipeline)
 *  - ZERO_COST.md §7 (quota awareness — stop calling a source gracefully
 *    once its free tier is exhausted, never fail loudly mid-run)
 *  - DATA_SOURCES.md (per-source metadata template that `DiscoverySourceMetadata` mirrors)
 */

import type { BusinessCandidate, DiscoveryQuery } from "../../types";
import { createLogger, type Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/limiter";
import { isTransientError, RetryExhaustedError, withRetry } from "../../utils/retry";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/**
 * The interface every discovery adapter implements (ARCHITECTURE.md §9).
 * Callers (src/discovery/index.ts, src/pipeline/discover.ts) depend only on
 * this — never on a concrete adapter class — so sources are interchangeable
 * and a new one can be added without touching pipeline code.
 */
export interface DiscoverySource {
  readonly name: string;
  search(query: DiscoveryQuery): Promise<BusinessCandidate[]>;
}

/**
 * Per-source documentation, mirroring the template in DATA_SOURCES.md.
 * Every concrete adapter must supply this — it exists so the human-readable
 * doc and the running code cannot silently drift apart. Consider this
 * required reading before implementing a new source's `fetchCandidates`.
 */
export interface DiscoverySourceMetadata {
  /** Human-readable source name, e.g. "OpenStreetMap via Overpass API". */
  sourceName: string;
  /** How the source is reached, e.g. "Public Overpass API endpoint, HTTP queries". */
  accessMethod: string;
  /** e.g. "None", or "API key via .env". */
  authentication: string;
  /** Free-text description of the self-imposed or provider-imposed rate limit. */
  rateLimitDescription: string;
  /** Whether displaying this source's data requires attribution (e.g. OSM). */
  attributionRequired: boolean;
  /** Exact attribution text to display, if `attributionRequired` is true. */
  attributionText?: string;
  /** Prohibited uses per this source's terms (DATA_SOURCES.md), enforced by convention, not code. */
  prohibitedUses: string[];
  /** The minimum field set this adapter is permitted to collect (DATA_SOURCES.md "Fields collected"). */
  fieldsCollected: string[];
}

// ---------------------------------------------------------------------------
// Abstract base class
// ---------------------------------------------------------------------------

export interface BaseDiscoverySourceOptions {
  metadata: DiscoverySourceMetadata;
  /** Optional shared rate limiter (e.g. one Overpass-wide limiter across all queries in a run). */
  rateLimiter?: RateLimiter;
  /** Total attempts (including the first) before giving up on a single query. Default 3 (ARCHITECTURE.md §39). */
  maxRetries?: number;
  /** Soft timeout hint for subclasses to apply to their own HTTP calls. Default 15s. */
  requestTimeoutMs?: number;
}

/**
 * Shared implementation for discovery adapters. Subclasses implement only
 * `fetchCandidates()` — the actual provider call — and this base class
 * handles:
 *
 *  - optional quota gating (ZERO_COST.md §7)
 *  - optional rate limiting (ARCHITECTURE.md §37, KeyedConcurrencyLimiter/
 *    RateLimiter from src/utils/limiter.ts)
 *  - bounded retry with backoff on transient failures (src/utils/retry.ts)
 *  - error isolation: a source that fails after retries returns an empty
 *    array and logs a SOURCE_ERROR rather than throwing, so one broken
 *    source never aborts a run (ARCHITECTURE.md §46, §65)
 *  - stamping `source` onto every returned candidate so callers don't have
 *    to trust (or duplicate) that logic in each adapter
 */
export abstract class BaseDiscoverySource implements DiscoverySource {
  readonly metadata: DiscoverySourceMetadata;
  protected readonly log: Logger;
  private readonly rateLimiter?: RateLimiter;
  private readonly maxRetries: number;
  protected readonly requestTimeoutMs: number;

  constructor(options: BaseDiscoverySourceOptions) {
    this.metadata = options.metadata;
    this.rateLimiter = options.rateLimiter;
    this.maxRetries = options.maxRetries ?? 3;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.log = createLogger({ stage: `discovery:${this.metadata.sourceName}` });
  }

  get name(): string {
    return this.metadata.sourceName;
  }

  /**
   * Performs the actual provider call. Implementations should throw on
   * failure (network error, non-2xx response, malformed payload) — the
   * base class's `search()` handles retry, rate limiting, and error
   * isolation around this call. Implementations should NOT swallow errors
   * themselves, or retries/logging here become ineffective.
   */
  protected abstract fetchCandidates(query: DiscoveryQuery): Promise<BusinessCandidate[]>;

  /**
   * Optional quota gate for sources with a metered free tier (ZERO_COST.md
   * §7, e.g. Foursquare). Return `false` to skip this source for the
   * current call without treating it as an error. Default: always allowed.
   */
  protected async checkQuota(_query: DiscoveryQuery): Promise<boolean> {
    return true;
  }

  async search(query: DiscoveryQuery): Promise<BusinessCandidate[]> {
    const allowed = await this.checkQuota(query);
    if (!allowed) {
      this.log.warn("Skipping source — free-tier quota reached for this period", {
        source: this.metadata.sourceName,
      });
      return [];
    }

    const runFetch = (): Promise<BusinessCandidate[]> =>
      this.rateLimiter ? this.rateLimiter.schedule(() => this.fetchCandidates(query)) : this.fetchCandidates(query);

    try {
      const candidates = await withRetry(runFetch, {
        maxAttempts: this.maxRetries,
        isRetryable: isTransientError,
        onRetry: (err, attempt, delayMs) => {
          this.log.warn("Retrying discovery source after transient failure", {
            attempt,
            delayMs,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      });

      this.log.info("Discovery source returned candidates", {
        industry: query.industry,
        location: query.location,
        count: candidates.length,
      });

      // Guarantee every candidate is stamped with this source's canonical
      // name, regardless of what an adapter happened to set internally.
      return candidates.map((candidate) => ({ ...candidate, source: this.metadata.sourceName }));
    } catch (err) {
      const cause = err instanceof RetryExhaustedError ? err.cause : err;
      this.log.error("Discovery source failed after retries — continuing without it (SOURCE_ERROR)", cause, {
        source: this.metadata.sourceName,
        industry: query.industry,
        location: query.location,
      });
      return [];
    }
  }

  /**
   * Restricts a raw provider payload to the fields this source is
   * documented to collect (DATA_SOURCES.md "Fields collected"), so an
   * adapter can't accidentally start persisting more than it should just
   * because a provider's API response happens to include extra fields.
   */
  protected pickFields<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      result[key] = obj[key];
    }
    return result;
  }
}
