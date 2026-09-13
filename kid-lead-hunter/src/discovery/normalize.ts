/**
 * src/discovery/normalize.ts
 *
 * Standardizes raw `BusinessCandidate` records from any discovery source
 * into a consistent `NormalizedBusinessCandidate` shape before
 * deduplication and persistence.
 *
 * Governed by:
 *  - ARCHITECTURE.md §11 (Normalization — standardize name, phone, URL,
 *    domain, address, city, state, postal code, category)
 *  - ARCHITECTURE.md §12 (feeds into Deduplication, which relies on
 *    `normalizedName`/`normalizedPhone`/`domain` as matching keys)
 *  - WEBSITE_DETECTION.md §4 (URL normalization before verification)
 *  - PRIVACY.md §3-4 (no field added here collects anything beyond public
 *    business-level facts already present on the raw candidate)
 *
 * This module never fetches anything over the network and never talks to
 * the database — it is pure data transformation, which keeps it trivially
 * unit-testable (ARCHITECTURE.md §60-61).
 */

import type { BusinessCandidate, NormalizedBusinessCandidate } from "../types";
import { createLogger } from "../utils/logger";
import { extractDomain, isValidEmail, isValidPostalCode, isValidUsPhone, normalizeUrl, sanitizeText } from "../utils/validation";

const log = createLogger({ stage: "normalize" });

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

// Common US business-entity suffixes that should be ignored for matching
// purposes only — the original, unmodified `name` is always preserved for
// display. Matches with or without trailing periods (e.g. "Inc" / "Inc.").
const LEGAL_SUFFIX_PATTERN =
  /\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|l\.?l\.?p\.?|p\.?l\.?l\.?c\.?|p\.?c\.?|dba)\b/gi;

/**
 * Produces the lowercase, punctuation- and legal-suffix-stripped form of a
 * business name used as a deduplication matching key (ARCHITECTURE.md §11
 * example: "Joe's Plumbing LLC" / "Joes Plumbing" / "Joe's Plumbing, LLC"
 * should all normalize to the same string). Never used for display.
 */
export function normalizeBusinessName(name: string): string {
  return sanitizeText(name, 200)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(LEGAL_SUFFIX_PATTERN, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Field-level normalizers
// ---------------------------------------------------------------------------

/**
 * Reduces a phone number to its 10-digit US form for matching purposes, or
 * `undefined` if it doesn't look like a valid US number. The original,
 * human-formatted string (if any) is preserved separately on the record.
 */
export function normalizePhone(rawPhone: string | undefined): string | undefined {
  if (!rawPhone) return undefined;
  if (!isValidUsPhone(rawPhone)) return undefined;
  const digits = rawPhone.replace(/\D/g, "");
  return digits.length === 11 ? digits.slice(1) : digits;
}

export function normalizeEmail(rawEmail: string | undefined): string | undefined {
  if (!rawEmail) return undefined;
  const trimmed = rawEmail.trim().toLowerCase();
  return isValidEmail(trimmed) ? trimmed : undefined;
}

/** Title-cases a city name after sanitizing whitespace/control characters. */
export function normalizeCity(city: string | undefined): string | undefined {
  if (!city) return undefined;
  const clean = sanitizeText(city, 100);
  if (!clean) return undefined;
  return clean.toLowerCase().replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

/** Uppercases a 2-letter state/region code as-is; title-cases anything longer (e.g. a full state name). */
export function normalizeState(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const clean = sanitizeText(state, 50);
  if (!clean) return undefined;
  if (clean.length === 2) return clean.toUpperCase();
  return clean.toLowerCase().replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

/** Validates and trims a US postal code (5-digit or ZIP+4); returns `undefined` if malformed rather than guessing. */
export function normalizePostalCode(postalCode: string | undefined): string | undefined {
  if (!postalCode) return undefined;
  const trimmed = postalCode.trim();
  return isValidPostalCode(trimmed) ? trimmed : undefined;
}

export function normalizeAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const clean = sanitizeText(address, 300);
  return clean.length > 0 ? clean : undefined;
}

export function normalizeCategory(category: string | undefined): string | undefined {
  if (!category) return undefined;
  const clean = sanitizeText(category, 100);
  return clean.length > 0 ? clean : undefined;
}

export interface NormalizedWebsiteField {
  url?: string;
  domain?: string;
}

/**
 * Canonicalizes a raw website URL (strips tracking params/fragment,
 * lowercases the host, resolves to an absolute https(s) URL) and extracts
 * its bare domain, per WEBSITE_DETECTION.md §4 step 1. Returns an empty
 * object — not an error — if the input is missing or unparsable, since an
 * unparsable "website" field is common and simply means verification will
 * need to attempt domain discovery instead (WEBSITE_DETECTION.md §5).
 */
export function normalizeWebsiteField(rawUrl: string | undefined): NormalizedWebsiteField {
  if (!rawUrl) return {};
  const url = normalizeUrl(rawUrl);
  if (!url) return {};
  const domain = extractDomain(url) ?? undefined;
  return { url, domain };
}

/**
 * Canonicalizes and de-duplicates a list of social profile URLs. Entries
 * that don't parse as URLs are dropped rather than causing the whole
 * candidate to fail normalization.
 */
export function normalizeSocialLinks(links: string[] | undefined): string[] {
  if (!links || links.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const link of links) {
    const normalized = normalizeUrl(link);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeRating(rating: number | undefined): number | undefined {
  if (typeof rating !== "number" || Number.isNaN(rating)) return undefined;
  if (rating < 0 || rating > 5) return undefined;
  return Math.round(rating * 10) / 10;
}

function normalizeReviewCount(reviewCount: number | undefined): number | undefined {
  if (typeof reviewCount !== "number" || Number.isNaN(reviewCount)) return undefined;
  if (reviewCount < 0) return undefined;
  return Math.round(reviewCount);
}

// ---------------------------------------------------------------------------
// Candidate-level normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a single raw `BusinessCandidate`. Returns `null` (and logs a
 * warning) if the candidate is missing a field essential to downstream
 * processing — a usable name, or source provenance (ARCHITECTURE.md §29
 * requires both on every persisted business). This is the only case where
 * normalization drops a record outright; everything else is normalized as
 * best-effort with individual fields becoming `undefined` if unparsable.
 */
export function normalizeCandidate(candidate: BusinessCandidate): NormalizedBusinessCandidate | null {
  const name = sanitizeText(candidate.name ?? "", 200);
  if (!name) {
    log.warn("Dropping candidate with no usable name", {
      source: candidate.source,
      sourceId: candidate.sourceId,
    });
    return null;
  }

  if (!candidate.source || !candidate.sourceId) {
    log.warn("Dropping candidate missing source provenance", { name });
    return null;
  }

  const normalizedName = normalizeBusinessName(name);
  if (!normalizedName) {
    log.warn("Dropping candidate whose name normalizes to an empty string", { name });
    return null;
  }

  const { url: website, domain } = normalizeWebsiteField(candidate.website);

  return {
    ...candidate,
    name,
    normalizedName,
    category: normalizeCategory(candidate.category),
    phone: candidate.phone ? sanitizeText(candidate.phone, 30) : undefined,
    normalizedPhone: normalizePhone(candidate.phone),
    email: normalizeEmail(candidate.email),
    address: normalizeAddress(candidate.address),
    city: normalizeCity(candidate.city),
    state: normalizeState(candidate.state),
    postalCode: normalizePostalCode(candidate.postalCode),
    website,
    domain,
    socialLinks: normalizeSocialLinks(candidate.socialLinks),
    rating: normalizeRating(candidate.rating),
    reviewCount: normalizeReviewCount(candidate.reviewCount),
  };
}

export interface NormalizeBatchResult {
  normalized: NormalizedBusinessCandidate[];
  skipped: Array<{ candidate: BusinessCandidate; reason: string }>;
}

/**
 * Normalizes a full batch of raw candidates, typically the combined output
 * of every `DiscoverySource` for one run (ARCHITECTURE.md §11, pipeline
 * step NORMALIZE in ARCHITECTURE.md §35). Candidates that can't be
 * normalized are reported in `skipped` rather than silently vanishing, so
 * a run's funnel (found → normalized → deduplicated → ...) stays visible.
 */
export function normalizeBatch(candidates: BusinessCandidate[]): NormalizeBatchResult {
  const normalized: NormalizedBusinessCandidate[] = [];
  const skipped: NormalizeBatchResult["skipped"] = [];

  for (const candidate of candidates) {
    const result = normalizeCandidate(candidate);
    if (result) {
      normalized.push(result);
    } else {
      skipped.push({ candidate, reason: "missing required field(s) after normalization" });
    }
  }

  log.info("Normalization complete", {
    input: candidates.length,
    output: normalized.length,
    skipped: skipped.length,
  });

  return { normalized, skipped };
}
