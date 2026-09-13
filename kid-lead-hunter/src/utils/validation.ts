/**
 * src/utils/validation.ts
 *
 * Shared validation helpers and schemas used across the API, discovery,
 * verification, and pipeline layers.
 *
 * Governed by:
 *  - README.md "Search Inputs"        — shape of a search request
 *  - ARCHITECTURE.md §29              — Business entity fields
 *  - WEBSITE_DETECTION.md §4          — URL normalization before verification
 *  - PRIVACY.md §4                    — no sensitive personal data in the schema
 *
 * This module is intentionally the *only* place `zod` schemas for
 * cross-cutting concerns (search input, business shape) live, so the rest of
 * the app can import one `validate()` helper with consistent error handling
 * instead of re-implementing parsing/guard logic per layer.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Generic validation plumbing
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(`${message}: ${ValidationError.formatIssues(issues)}`);
    this.name = "ValidationError";
    this.issues = issues;
  }

  private static formatIssues(issues: z.ZodIssue[]): string {
    return issues.map((issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`).join("; ");
  }
}

/** Parses `data` against `schema`, throwing a `ValidationError` on failure. */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(context ? `Validation failed for ${context}` : "Validation failed", result.error.issues);
  }
  return result.data;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: ValidationError };

/** Non-throwing variant of `validate`, for call sites that want to handle failure inline (e.g. API routes). */
export function tryValidate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: new ValidationError(context ? `Validation failed for ${context}` : "Validation failed", result.error.issues),
    };
  }
  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Search criteria (README.md "Search Inputs")
// ---------------------------------------------------------------------------

export const searchCriteriaSchema = z.object({
  industry: z.string().trim().min(2, "industry must be at least 2 characters").max(100),
  location: z.string().trim().min(2, "location must be at least 2 characters").max(200),
  radiusMiles: z.number().positive().max(100).default(25),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(200).default(50),
  websiteFilter: z.enum(["any", "required", "prohibited"]).default("any"),
});

export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

// ---------------------------------------------------------------------------
// Business record (ARCHITECTURE.md §29)
// ---------------------------------------------------------------------------
//
// This is a defensive shape-check applied before a normalized record is
// written to the database — it is deliberately looser than the Drizzle
// schema (src/database/schema.ts), which owns column-level constraints.
// PRIVACY.md §4 forbids sensitive personal data anywhere in this schema.

export const businessRecordSchema = z.object({
  name: z.string().trim().min(1).max(200),
  normalizedName: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  postalCode: z.string().trim().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  website: z.string().url().max(2048).optional(),
  socialLinks: z.array(z.string().url().max(2048)).max(20).optional(),
  source: z.string().trim().min(1).max(50),
  sourceId: z.string().trim().min(1).max(200),
});

export type BusinessRecordInput = z.infer<typeof businessRecordSchema>;

// ---------------------------------------------------------------------------
// Field-level validators
// ---------------------------------------------------------------------------

/** True if `value` parses as an absolute http(s) URL. */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** True if `value` looks like a bare domain (no protocol/path), e.g. "joesplumbingtampa.com". */
export function isValidDomain(value: string): boolean {
  return DOMAIN_REGEX.test(value.trim());
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lightweight email shape check. Not RFC-complete by design — good enough to catch obvious garbage. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

/** Accepts common US phone formats: 10 digits, or 11 digits with a leading country code "1". */
export function isValidUsPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/** US ZIP or ZIP+4. */
export function isValidPostalCode(value: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(value.trim());
}

// Tracking / marketing query params that should never be persisted as part
// of a "canonical" business or website URL (WEBSITE_DETECTION.md §4 step 1).
const TRACKING_PARAM_PREFIXES = ["utm_", "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "ref", "igshid"];

/**
 * Normalizes a URL to a canonical form: ensures a scheme, lowercases the
 * host, strips tracking query params and the fragment, and removes a
 * trailing slash from non-root paths. Returns `null` if the input cannot be
 * parsed as a URL even after assuming `https://`.
 *
 * Used by website discovery/verification before a URL is compared,
 * deduplicated, or stored (WEBSITE_DETECTION.md §4).
 */
export function normalizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAM_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      url.searchParams.delete(key);
    }
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/** Extracts the bare, lowercased, "www."-stripped hostname from a URL, or `null` if invalid. */
export function extractDomain(rawUrl: string): string | null {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Strips control characters and collapses whitespace in text pulled from an
 * external source (scraped page text, API responses) before it's stored or
 * logged. Does not attempt HTML sanitization — callers handling markup
 * should use Cheerio's text extraction first.
 */
export function sanitizeText(value: string, maxLength = 1000): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Clamps `value` into the inclusive [min, max] range. Used throughout scoring/confidence math. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
