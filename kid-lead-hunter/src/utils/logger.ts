/**
 * src/utils/logger.ts
 *
 * Lightweight structured logger for K!D Lead Hunter.
 *
 * Governed by:
 *  - ARCHITECTURE.md §47 (Logging)   — levels, required fields, no page dumps
 *  - PRIVACY.md §8 (Logging)        — never log secrets, tokens, or full page content
 *
 * Design goals:
 *  - No external dependencies (this is a $0, low-memory, personal tool).
 *  - Never throw. A logging failure must never crash a pipeline run.
 *  - Structured enough to grep/debug a run (timestamp, run id, business id, stage).
 *  - Defensive by default: sensitive keys are redacted and oversized fields
 *    (e.g. accidentally-passed raw HTML) are truncated before they ever reach
 *    stdout or disk.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type LogLevelName = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevelName, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_LABEL: Record<LogLevelName, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

// ANSI colors, only applied when writing to an interactive terminal.
const LEVEL_COLOR: Record<LogLevelName, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const COLOR_RESET = "\x1b[0m";

/** Structured context/fields attached to a log line. */
export interface LogFields {
  runId?: string;
  businessId?: string | number;
  stage?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  /** Minimum level that will actually be emitted. Defaults to LOG_LEVEL env var, then "info". */
  level?: LogLevelName;
  /** Fields merged into every line written by this logger instance (and its children). */
  context?: LogFields;
  /** Also append JSON-ish lines to a log file. Defaults to LOG_TO_FILE=true env var. */
  toFile?: boolean;
  /** Log file path. Defaults to LOG_FILE_PATH env var, then ./logs/app.log */
  filePath?: string;
}

const DEFAULT_LOG_FILE = process.env.LOG_FILE_PATH || "logs/app.log";

// Keys that must never appear in a log line, regardless of nesting depth.
const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|passwd|authorization|cookie|private[_-]?key|credential)/i;

// Keys that are allowed to exist but whose *values* are almost always too
// large / risky to log in full (raw HTML, full HTTP bodies, etc.).
const LARGE_VALUE_KEY_PATTERN = /(html|rawbody|raw_body|body|pagecontent|page_content|content)/i;

const MAX_STRING_LENGTH = 500;
const MAX_FIELD_DEPTH = 4;
const REDACTED = "[redacted]";
const TRUNCATED_SUFFIX = "…[truncated]";

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return value.slice(0, MAX_STRING_LENGTH) + TRUNCATED_SUFFIX;
}

/**
 * Recursively sanitizes a fields object before it is ever serialized:
 *  - redacts keys that look like secrets/tokens
 *  - truncates oversized string values (defends against accidentally
 *    passing raw HTML or full HTTP responses into the logger)
 *  - guards against circular references and unbounded nesting
 */
function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return undefined;

  if (depth >= MAX_FIELD_DEPTH) return "[max-depth]";

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitize(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      if (LARGE_VALUE_KEY_PATTERN.test(key) && typeof val === "string" && val.length > MAX_STRING_LENGTH) {
        result[key] = truncateString(val) + ` (len=${val.length})`;
        continue;
      }
      result[key] = sanitize(val, depth + 1, seen);
    }
    return result;
  }

  return String(value);
}

function parseLogLevel(raw: string | undefined): LogLevelName | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return undefined;
}

function formatConsoleLine(level: LogLevelName, message: string, fields: LogFields): string {
  const timestamp = new Date().toISOString();
  const { runId, businessId, stage, ...rest } = fields;

  const tags: string[] = [];
  if (runId !== undefined) tags.push(`run:${runId}`);
  if (businessId !== undefined) tags.push(`biz:${businessId}`);
  if (stage !== undefined) tags.push(`stage:${stage}`);
  const tagStr = tags.length > 0 ? ` [${tags.join("] [")}]` : "";

  const restEntries = Object.entries(rest).filter(([, v]) => v !== undefined);
  const restStr =
    restEntries.length > 0
      ? " " + restEntries.map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ")
      : "";

  return `${timestamp} ${LEVEL_LABEL[level]}${tagStr} ${message}${restStr}`;
}

/**
 * Serializes a single log entry as a JSON line for file output. JSON lines
 * (one JSON object per line) are chosen over free-form text so a future
 * log-review tool can parse the file without a custom grammar.
 */
function formatFileLine(level: LogLevelName, message: string, fields: LogFields): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...fields });
}

/**
 * Serializes writes to a single log file, guaranteeing:
 *  - writes never crash the caller (errors are swallowed and reported to stderr once)
 *  - writes are ordered even though fs writes are async
 *  - the log directory is created lazily, once
 */
class FileSink {
  private queue: Promise<void> = Promise.resolve();
  private ready: Promise<void> | null = null;
  private warnedOnce = false;

  constructor(public readonly filePath: string) {}

  private ensureReady(): Promise<void> {
    const ready = this.ready ?? mkdir(dirname(this.filePath), { recursive: true }).then(() => undefined);
    this.ready = ready;
    return ready;
  }

  write(line: string): void {
    this.queue = this.queue
      .then(() => this.ensureReady())
      .then(() => appendFile(this.filePath, line + "\n", "utf8"))
      .catch((err) => {
        if (!this.warnedOnce) {
          this.warnedOnce = true;
          // Intentionally use console.error directly: the logger itself is broken here.
          // eslint-disable-next-line no-console
          console.error(
            `[logger] failed to write to log file "${this.filePath}" (further failures suppressed):`,
            err instanceof Error ? err.message : err,
          );
        }
      });
  }
}

export class Logger {
  private readonly level: LogLevelName;
  private readonly context: LogFields;
  private readonly sink: FileSink | null;
  private readonly useColor: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? parseLogLevel(process.env.LOG_LEVEL) ?? "info";
    this.context = options.context ?? {};

    const toFile = options.toFile ?? process.env.LOG_TO_FILE === "true";
    const filePath = options.filePath ?? DEFAULT_LOG_FILE;
    this.sink = toFile ? new FileSink(filePath) : null;

    this.useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
  }

  /** Returns a new logger with additional context merged in (e.g. run id, business id, stage). */
  child(context: LogFields): Logger {
    return new Logger({
      level: this.level,
      context: { ...this.context, ...context },
      toFile: this.sink !== null,
      filePath: this.sink?.filePath,
    });
  }

  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  /**
   * Logs an error. `error` may be an Error, any thrown value, or omitted.
   * Its message/stack are merged into the emitted fields (and sanitized
   * like everything else).
   */
  error(message: string, error?: unknown, fields?: LogFields): void {
    const errorFields =
      error === undefined
        ? {}
        : error instanceof Error
          ? { errorMessage: error.message, errorStack: error.stack }
          : { error };
    this.write("error", message, { ...errorFields, ...fields });
  }

  private write(level: LogLevelName, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;

    const merged = sanitize({ ...this.context, ...fields }) as LogFields;

    const consoleLine = formatConsoleLine(level, message, merged);
    const target = level === "error" || level === "warn" ? console.error : console.log;
    target(this.useColor ? `${LEVEL_COLOR[level]}${consoleLine}${COLOR_RESET}` : consoleLine);

    this.sink?.write(formatFileLine(level, message, merged));
  }
}

/** Default, process-wide logger. Use `.child({...})` to scope it to a run/business/stage. */
export const logger = new Logger();

/** Convenience factory, mainly for readability at call sites: `createLogger({ stage: "verify" })`. */
export function createLogger(context: LogFields, options?: Omit<LoggerOptions, "context">): Logger {
  return new Logger({ ...options, context });
}
