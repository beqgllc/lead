/**
 * src/types/index.ts
 *
 * Shared, persistence-agnostic TypeScript types used across multiple
 * layers (discovery, verification, analyzer, scoring, AI, API, dashboard).
 *
 * Governed by:
 *  - ARCHITECTURE.md §9   (DiscoverySource / BusinessCandidate shape)
 *  - ARCHITECTURE.md §11-12 (Normalization / Deduplication)
 *  - ARCHITECTURE.md §19  (structured website observations)
 *  - AI_PIPELINE.md §4-5  (AIAnalysisInput / AIAnalysisOutput contracts)
 *  - PRIVACY.md §3-4      (only public, business-level fields appear here —
 *    no individual-person data, no sensitive attributes)
 *
 * Rule of thumb for what belongs in this file: a shape that is produced by
 * one layer and consumed by another, and therefore shouldn't be redefined
 * (and risk drifting) in each of those layers separately. Types that are
 * purely internal to a single module (e.g. a source adapter's private
 * request/response shape) belong in that module instead.
 *
 * Database row types (Business, Lead, Website, ...) live in
 * src/database/schema.ts, since they are inferred directly from the
 * Drizzle table definitions. The enums and small value types they use are
 * re-exported here so upper layers (API routes, hooks, components) can
 * import from `src/types` without reaching into the database layer
 * directly, keeping the dependency direction one-way (ARCHITECTURE.md §6).
 */

export type {
  WebsiteStatus,
  HttpCheckResult,
  LeadPriority,
  LeadStatus,
  RunStatus,
  PipelineStage,
  CheckpointStatus,
  ErrorCategory,
  ContactType,
  WebsiteFilter,
  AnalysisType,
  LeadScoreComponents,
  RunErrorEntry,
} from "../database/schema";

export {
  WEBSITE_STATUSES,
  HTTP_CHECK_RESULTS,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  RUN_STATUSES,
  PIPELINE_STAGES,
  CHECKPOINT_STATUSES,
  ERROR_CATEGORIES,
  CONTACT_TYPES,
  WEBSITE_FILTERS,
  ANALYSIS_TYPES,
} from "../database/schema";

// ---------------------------------------------------------------------------
// Discovery (ARCHITECTURE.md §9, §11-12)
// ---------------------------------------------------------------------------

/**
 * Raw shape returned by a `DiscoverySource` (src/discovery/sources/base.ts)
 * before normalization. Fields are intentionally optional/loose here — each
 * source populates whatever it actually has, and src/discovery/normalize.ts
 * is responsible for cleaning, validating, and filling in derived fields.
 */
export interface BusinessCandidate {
  name: string;
  category?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  /** 0-5 star rating, if the source reports one. */
  rating?: number;
  reviewCount?: number;
  /** Unnormalized URL as reported by the source, if any (may be missing even when a site exists — ARCHITECTURE.md §13). */
  website?: string;
  socialLinks?: string[];
  /** Which DiscoverySource produced this candidate (DATA_SOURCES.md source name). */
  source: string;
  /** The source's own identifier for this record (e.g. an OSM node id), used for dedup against re-ingestion. */
  sourceId: string;
  /**
   * The source's original payload, kept only transiently in memory for
   * debugging a single run. Must never be persisted verbatim
   * (ARCHITECTURE.md §55, DATA_SOURCES.md per-source storage limits).
   */
  raw?: Record<string, unknown>;
}

/** Input to `DiscoverySource.search()` (ARCHITECTURE.md §9). Mirrors `searchCriteriaSchema` in src/utils/validation.ts, minus fields that only matter after website detection. */
export interface DiscoveryQuery {
  industry: string;
  location: string;
  radiusMiles: number;
  limit: number;
  minRating?: number;
  minReviews?: number;
}

/**
 * A `BusinessCandidate` after src/discovery/normalize.ts has cleaned and
 * standardized it (ARCHITECTURE.md §11). `normalizedName` is always present
 * and is the primary key used for fuzzy matching in deduplication.
 */
export interface NormalizedBusinessCandidate extends BusinessCandidate {
  /** Lowercased, punctuation- and legal-suffix-stripped name, used for dedup matching only — never displayed. */
  normalizedName: string;
  /** Digits-only US phone number (10 digits, country code stripped), or undefined if unparsable. */
  normalizedPhone?: string;
  /** Bare, lowercased, "www."-stripped hostname extracted from `website`, if any. */
  domain?: string;
}

/** One pairing identified as a likely duplicate during deduplication (ARCHITECTURE.md §12). */
export interface DuplicateMatch {
  /** Index into the candidate array of the record considered the duplicate. */
  candidateIndex: number;
  /** Index into the candidate array of the record it was matched against (the one that is kept). */
  matchedIndex: number;
  /** 0-100 confidence that these two records refer to the same business. */
  confidence: number;
  /** Which signals contributed to the match, for explainability. */
  matchedOn: Array<"name" | "phone" | "domain" | "address">;
}

/** Result of src/discovery/deduplicate.ts running over a normalized candidate list. */
export interface DeduplicationResult {
  unique: NormalizedBusinessCandidate[];
  duplicates: DuplicateMatch[];
}

// ---------------------------------------------------------------------------
// Website analysis (ARCHITECTURE.md §19)
// ---------------------------------------------------------------------------

/**
 * Structured, opinion-free observations produced by src/analyzer/*. The
 * scoring engine (src/scoring/) converts these into opportunity points —
 * this type intentionally carries no score or verdict of its own.
 */
export interface WebsiteObservations {
  mobile: {
    viewport: boolean;
    responsiveSignals: boolean;
    [key: string]: boolean;
  };
  seo: {
    title: boolean;
    description: boolean;
    canonical?: boolean;
    structuredData?: boolean;
    [key: string]: boolean | undefined;
  };
  conversion: {
    contactForm: boolean;
    cta: boolean;
    booking: boolean;
    [key: string]: boolean;
  };
  performance?: {
    responseTimeMs?: number;
    contentSizeBytes?: number;
    assetCount?: number;
  };
  technology?: string;
}

// ---------------------------------------------------------------------------
// AI layer contracts (AI_PIPELINE.md §4-5)
// ---------------------------------------------------------------------------

import type { LeadPriority, LeadScoreComponents, WebsiteStatus } from "../database/schema";

/** Input handed to an `AIProvider` (ARCHITECTURE.md §58). Never contains raw HTML or unfiltered pages (AI_PIPELINE.md §4). */
export interface AIAnalysisInput {
  business: {
    name: string;
    category: string;
    city: string;
    region: string;
    rating?: number;
    reviewCount?: number;
    socialProfiles: string[];
  };
  website: {
    status: WebsiteStatus;
    url?: string;
    observations?: WebsiteObservations;
  };
  score: {
    total: number;
    priority: LeadPriority;
    confidence: number;
    components: LeadScoreComponents;
    reasons: string[];
  };
}

/** Output of an `AIProvider`'s opportunity-interpretation call (AI_PIPELINE.md §5). Stored as an `Analysis` row, never merged into `Lead`. */
export interface AIAnalysisOutput {
  aiConfidence: number;
  summary: string;
  likelyPainPoints: string[];
  recommendedService: string;
  suggestedPitchAngle: string;
  caveats: string[];
  model: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// API / dashboard plumbing (ARCHITECTURE.md §7-8)
// ---------------------------------------------------------------------------

/** Standard success/error envelope for src/api/* routes, so hooks (src/hooks/*) can handle both cases uniformly. */
export type ApiResponse<T> = { success: true; data: T } | { success: false; error: string; issues?: string[] };

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
