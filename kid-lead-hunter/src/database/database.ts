/**
 * src/database/database.ts
 *
 * Owns the single SQLite connection used by K!D Lead Hunter and exposes it
 * as a typed Drizzle instance.
 *
 * Governed by:
 *  - ARCHITECTURE.md §27 (Database Layer — SQLite, no server, data/database.sqlite)
 *  - ARCHITECTURE.md §5, §37, §52-53 (Resource Constraints — a single
 *    connection, conservative concurrency, memory-conscious defaults)
 *  - ARCHITECTURE.md §65 (Reliability — a failed source/site must not
 *    destroy the local database; this module makes the DB handle resilient
 *    to being requested many times without opening many connections)
 *  - ZERO_COST.md §4 (SQLite is a $0, no-server, no-credential-card resource)
 *  - PRIVACY.md §5 (data/database.sqlite is the single local, non-synced
 *    store of persistent data)
 *
 * Design notes:
 *  - better-sqlite3 is synchronous and single-connection by design, which
 *    fits this project perfectly: one Node process, one Surface Pro 3, no
 *    need for a connection pool.
 *  - Next.js dev mode hot-reloads modules on every request, which would
 *    otherwise open a new SQLite file handle on every reload. A
 *    `globalThis`-cached singleton (the same pattern commonly used for
 *    Prisma/Drizzle in Next.js apps) avoids that.
 *  - Migrations are applied via drizzle-kit-generated SQL files under
 *    `drizzle/migrations`. If that folder doesn't exist yet (e.g. before
 *    `npm run db:generate` has been run for the first time), this module
 *    logs a warning and continues with whatever schema is already on disk
 *    rather than crashing `npm run dev` — matching the Phase 1 exit
 *    criterion in ROADMAP.md ("empty-but-connected database").
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createLogger } from "../utils/logger";
import * as schemaModule from "./schema";

const { schema } = schemaModule;

const log = createLogger({ stage: "database" });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default location per ARCHITECTURE.md §27. Overridable for tests/tooling. */
const DEFAULT_DB_PATH = "data/database.sqlite";
const DEFAULT_MIGRATIONS_FOLDER = "drizzle/migrations";

export interface DatabaseConfig {
  /** Filesystem path to the SQLite file, or ":memory:" for an ephemeral test database. */
  path: string;
  /** Folder containing drizzle-kit-generated SQL migrations. */
  migrationsFolder: string;
  /** Whether to run pending migrations automatically on connect. Defaults to true. */
  autoMigrate: boolean;
}

function resolveConfig(overrides: Partial<DatabaseConfig> = {}): DatabaseConfig {
  const path = overrides.path ?? process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;
  return {
    path,
    migrationsFolder: overrides.migrationsFolder ?? process.env.DATABASE_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_FOLDER,
    autoMigrate: overrides.autoMigrate ?? true,
  };
}

// ---------------------------------------------------------------------------
// Connection creation
// ---------------------------------------------------------------------------

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: Database.Database;
  path: string;
  close: () => void;
}

/**
 * Applies pragmas tuned for a single-user, low-memory, single-process
 * workload on modest hardware (ARCHITECTURE.md §5):
 *  - WAL journal mode: readers (the dashboard) don't block on writers (a
 *    running pipeline), and vice versa — important since both can be
 *    active at once in `npm run dev`.
 *  - synchronous=NORMAL: safe with WAL, meaningfully faster than FULL on
 *    spinning/eMMC-class storage without risking corruption on an OS crash.
 *  - foreign_keys=ON: SQLite disables FK enforcement by default; the schema
 *    relies on ON DELETE CASCADE/SET NULL behavior being active.
 *  - busy_timeout: avoids "database is locked" errors under the light
 *    concurrent access this app actually produces (ARCHITECTURE.md §37 —
 *    1-2 workers), instead of failing fast and having to retry manually.
 */
function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
}

function ensureParentDirectoryExists(filePath: string): void {
  if (filePath === ":memory:") return;
  const absolute = resolve(process.cwd(), filePath);
  const dir = dirname(absolute);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function runMigrationsIfPresent(db: AppDatabase, migrationsFolder: string): void {
  const absoluteMigrationsFolder = resolve(process.cwd(), migrationsFolder);
  if (!existsSync(absoluteMigrationsFolder)) {
    log.warn(
      "Migrations folder not found — skipping auto-migration. Run `npm run db:generate` and `npm run db:migrate` once migrations exist.",
      { migrationsFolder: absoluteMigrationsFolder },
    );
    return;
  }

  try {
    migrate(db, { migrationsFolder: absoluteMigrationsFolder });
    log.info("Database migrations applied", { migrationsFolder: absoluteMigrationsFolder });
  } catch (err) {
    // A migration failure is serious (the schema on disk may not match what
    // the app expects) but per ARCHITECTURE.md §65 we still avoid crashing
    // silently — surface it loudly and let the caller decide whether to
    // continue, since some commands (e.g. a read-only export script) might
    // still function against an already-migrated database.
    log.error("Database migration failed", err, { migrationsFolder: absoluteMigrationsFolder });
    throw err;
  }
}

/**
 * Opens a new SQLite connection and returns a Drizzle-wrapped handle. Most
 * callers should use `getDatabase()` instead, which caches this per process.
 * This function is exported directly for tests and one-off scripts (e.g.
 * `scripts/backup.ts`) that want an isolated, uncached connection.
 */
export function createDatabase(overrides: Partial<DatabaseConfig> = {}): DatabaseHandle {
  const config = resolveConfig(overrides);

  ensureParentDirectoryExists(config.path);

  const sqlite = new Database(config.path);
  applyPragmas(sqlite);

  const db = drizzle(sqlite, { schema });

  if (config.autoMigrate) {
    runMigrationsIfPresent(db, config.migrationsFolder);
  }

  log.info("Database connection established", { path: config.path });

  return {
    db,
    sqlite,
    path: config.path,
    close: () => {
      sqlite.close();
      log.debug("Database connection closed", { path: config.path });
    },
  };
}

/** Convenience factory for tests: an ephemeral, migrated, in-memory database. */
export function createInMemoryDatabase(migrationsFolder?: string): DatabaseHandle {
  return createDatabase({ path: ":memory:", migrationsFolder, autoMigrate: true });
}

// ---------------------------------------------------------------------------
// Process-wide singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __kidLeadHunterDb: DatabaseHandle | undefined;
}

/**
 * Returns the shared database handle for this process, creating it on first
 * call. Cached on `globalThis` so Next.js's dev-mode module hot-reloading
 * doesn't open a second connection to the same SQLite file (which would be
 * wasteful and, under WAL, unnecessary).
 */
export function getDatabase(): AppDatabase {
  if (!globalThis.__kidLeadHunterDb) {
    globalThis.__kidLeadHunterDb = createDatabase();
  }
  return globalThis.__kidLeadHunterDb.db;
}

/** Returns the raw better-sqlite3 handle for the shared connection (e.g. for `VACUUM INTO` backups). */
export function getRawConnection(): Database.Database {
  if (!globalThis.__kidLeadHunterDb) {
    globalThis.__kidLeadHunterDb = createDatabase();
  }
  return globalThis.__kidLeadHunterDb.sqlite;
}

/** Closes the shared connection, if one is open. Safe to call multiple times. Call before process exit. */
export function closeDatabase(): void {
  if (globalThis.__kidLeadHunterDb) {
    globalThis.__kidLeadHunterDb.close();
    globalThis.__kidLeadHunterDb = undefined;
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface DatabaseHealth {
  ok: boolean;
  path: string;
  journalMode: string | null;
  error?: string;
}

/**
 * Cheap liveness check for the database, suitable for the dashboard's
 * status/settings view or an API health route. Does not touch application
 * tables — just confirms the connection responds.
 */
export function checkDatabaseHealth(): DatabaseHealth {
  try {
    const handle = globalThis.__kidLeadHunterDb ?? (globalThis.__kidLeadHunterDb = createDatabase());
    const row = handle.sqlite.pragma("journal_mode", { simple: true }) as string;
    return { ok: true, path: handle.path, journalMode: row };
  } catch (err) {
    return {
      ok: false,
      path: process.env.DATABASE_PATH ?? DEFAULT_DB_PATH,
      journalMode: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shutdownHooksRegistered = false;

/**
 * Registers `closeDatabase()` against common termination signals so the
 * WAL file is checkpointed and the handle released cleanly. Safe to call
 * more than once; only registers once per process. Intended to be called
 * once from the app's entrypoint (e.g. `scripts/run.ts`) — Next.js's own
 * server lifecycle handles this for the dashboard process separately.
 */
export function registerShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;

  const shutdown = (signal: string) => {
    log.info("Received shutdown signal, closing database", { signal });
    closeDatabase();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("beforeExit", () => shutdown("beforeExit"));
}

// Re-export the schema so callers can do:
//   import { getDatabase, schema } from "src/database/database";
export { schema };
