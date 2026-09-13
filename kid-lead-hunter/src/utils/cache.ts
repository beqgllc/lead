/**
 * src/utils/cache.ts
 *
 * Lightweight, file-backed cache with per-entry TTL.
 *
 * Governed by:
 *  - ARCHITECTURE.md §38 (Cache — DNS, HTTP, website fingerprints, domain
 *    discovery, business records, AI analyses; every entry needs an
 *    expiration policy; stale data must not be treated as current)
 *  - PRIVACY.md §5 (Where Data Lives — data/cache/ holds temporary cached
 *    HTTP/DNS/analysis results, local-only, no cloud sync)
 *  - README.md (Caching — avoid repeatedly performing the same work)
 *
 * Design:
 *  - One JSON file per "namespace" (e.g. "dns", "http", "website-analysis"),
 *    loaded into memory on first use and persisted on writes. This keeps the
 *    implementation simple and is more than adequate for the expected
 *    dataset size (dozens-to-low-hundreds of businesses per run) on a 4 GB
 *    machine — a database isn't warranted for this.
 *  - Corrupted/missing cache files are treated as an empty cache rather than
 *    a fatal error (ARCHITECTURE.md "Fail gracefully").
 *  - Writes are serialized per namespace so concurrent set() calls can't
 *    interleave and corrupt the file.
 *  - A separate in-memory-only cache is provided for ephemeral, single-run
 *    data (e.g. dedup lookups) that never needs to survive a restart and
 *    shouldn't touch disk at all.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  /** Epoch ms after which this entry is considered stale. `null` = never expires. */
  expiresAt: number | null;
}

export interface CacheOptions {
  /** Default TTL applied to set() calls that don't specify one. `null` = never expires. */
  defaultTtlMs?: number | null;
  /** Directory that namespace files live under. Defaults to ./data/cache */
  baseDir?: string;
}

const DEFAULT_BASE_DIR = join(process.cwd(), "data", "cache");

/** Namespaces map 1:1 to filenames; keep them filesystem-safe. */
function assertSafeNamespace(namespace: string): void {
  if (!/^[a-z0-9._-]+$/i.test(namespace)) {
    throw new RangeError(
      `Invalid cache namespace "${namespace}": use only letters, numbers, "-", "_", "."`,
    );
  }
}

function isExpired(entry: CacheEntry<unknown>, now: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= now;
}

/**
 * A namespaced, file-backed cache. One instance = one JSON file on disk.
 * Safe to construct multiple times for the same namespace; each instance
 * keeps its own in-memory copy, so prefer sharing a single instance per
 * namespace within a process (e.g. export a singleton from the module that
 * owns that namespace, such as src/verification/dns.ts).
 */
export class FileCache<T = unknown> {
  private readonly filePath: string;
  private readonly defaultTtlMs: number | null;
  private store = new Map<string, CacheEntry<T>>();
  private loaded: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor(
    private readonly namespace: string,
    options: CacheOptions = {},
  ) {
    assertSafeNamespace(namespace);
    const baseDir = options.baseDir ?? DEFAULT_BASE_DIR;
    this.filePath = join(baseDir, `${namespace}.json`);
    this.defaultTtlMs = options.defaultTtlMs ?? null;
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.load();
    }
    return this.loaded;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: Record<string, CacheEntry<T>> = JSON.parse(raw);
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (!isExpired(entry, now)) {
          this.store.set(key, entry);
        }
      }
    } catch (err) {
      // Missing file on first run, or corrupted JSON — both are treated as
      // "start with an empty cache" rather than a fatal error.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        // eslint-disable-next-line no-console
        console.warn(`[cache] ignoring unreadable cache file "${this.filePath}":`, err);
      }
    }
  }

  private scheduleFlush(): void {
    this.dirty = true;
    this.writeQueue = this.writeQueue.then(() => this.flushIfDirty());
  }

  private async flushIfDirty(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const serializable = Object.fromEntries(this.store.entries());
      await writeFile(this.filePath, JSON.stringify(serializable), "utf8");
    } catch (err) {
      // A failed cache write should never take down a pipeline run — worst
      // case the next run repeats some work.
      // eslint-disable-next-line no-console
      console.warn(`[cache] failed to persist cache file "${this.filePath}":`, err);
    }
  }

  async get(key: string): Promise<T | undefined> {
    await this.ensureLoaded();
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (isExpired(entry, Date.now())) {
      this.store.delete(key);
      this.scheduleFlush();
      return undefined;
    }
    return entry.value;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * Stores `value` under `key`. `ttlMs` overrides the cache's default TTL;
   * pass `null` explicitly to store a value that never expires.
   */
  async set(key: string, value: T, ttlMs?: number | null): Promise<void> {
    await this.ensureLoaded();
    const effectiveTtl = ttlMs === undefined ? this.defaultTtlMs : ttlMs;
    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: effectiveTtl === null ? null : now + effectiveTtl,
    });
    this.scheduleFlush();
  }

  /**
   * Returns the cached value for `key` if present and fresh; otherwise
   * calls `compute`, stores the result, and returns it. This is the most
   * common usage pattern (memoize an expensive lookup).
   */
  async getOrSet(key: string, ttlMs: number | null | undefined, compute: () => Promise<T>): Promise<T> {
    const existing = await this.get(key);
    if (existing !== undefined) return existing;
    const computed = await compute();
    await this.set(key, computed, ttlMs);
    return computed;
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    if (this.store.delete(key)) {
      this.scheduleFlush();
    }
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.store.clear();
    this.scheduleFlush();
    await this.writeQueue;
  }

  /** Removes all expired entries. Called automatically on read, but useful to run explicitly between batches. */
  async prune(): Promise<number> {
    await this.ensureLoaded();
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (isExpired(entry, now)) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) this.scheduleFlush();
    return removed;
  }

  /** Ensures any pending writes have been flushed to disk. Call before process exit. */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.store.size;
  }
}

/**
 * A purely in-memory cache with the same TTL semantics as FileCache, for
 * ephemeral per-run data that should never touch disk (e.g. deduplication
 * lookups, per-run business name normalization results).
 */
export class MemoryCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly defaultTtlMs: number | null = null) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (isExpired(entry, Date.now())) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: T, ttlMs?: number | null): void {
    const effectiveTtl = ttlMs === undefined ? this.defaultTtlMs : ttlMs;
    const now = Date.now();
    this.store.set(key, { value, createdAt: now, expiresAt: effectiveTtl === null ? null : now + effectiveTtl });
  }

  getOrSet(key: string, ttlMs: number | null | undefined, compute: () => T): T {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const computed = compute();
    this.set(key, computed, ttlMs);
    return computed;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Common TTLs used across the pipeline; adjust here rather than hardcoding magic numbers at call sites. */
export const CACHE_TTL = {
  DNS_RESULT: 60 * 60_000, // 1 hour — DNS can change, but not often enough to re-check every run
  HTTP_CHECK: 6 * 60 * 60_000, // 6 hours
  WEBSITE_ANALYSIS: 24 * 60 * 60_000, // 1 day
  DOMAIN_DISCOVERY: 7 * 24 * 60 * 60_000, // 1 week
  AI_ANALYSIS: 30 * 24 * 60 * 60_000, // 30 days — re-run AI only when underlying evidence changes
} as const;

/** Convenience factory mirroring FileCache's constructor, for call-site readability. */
export function createFileCache<T = unknown>(namespace: string, options?: CacheOptions): FileCache<T> {
  return new FileCache<T>(namespace, options);
}
