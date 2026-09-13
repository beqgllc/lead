/**
 * src/database/schema.ts
 *
 * Drizzle ORM schema for K!D Lead Hunter's SQLite database.
 *
 * Governed by:
 *  - ARCHITECTURE.md §27-36 (Database Layer, Core Entities, Business/Website/
 *    Lead/Analysis/Search/Run entities, Pipeline Checkpoints)
 *  - SCORING.md §24 (Lead States), §26 (Score Versions), §28 (AI Override
 *    Policy — manual_score/manual_reason), §34 (LeadScore data structure)
 *  - WEBSITE_DETECTION.md §2 (Detection States), §6 (HTTP verification result
 *    classification)
 *  - README.md ("Database" section — table/field lists)
 *  - PRIVACY.md §3-4 (data minimization, no sensitive personal data — no
 *    column in this schema stores anything beyond public business-level
 *    facts, structural website observations, or AI interpretations)
 *
 * Design notes:
 *  - Integer autoincrement primary keys are used throughout for simplicity
 *    and efficient foreign keys on SQLite. External source identifiers
 *    (e.g. an OpenStreetMap node id) are preserved as `source`/`sourceId`
 *    on `businesses`, not used as the primary key.
 *  - Timestamps use SQLite's integer "timestamp_ms" mode, which Drizzle
 *    maps transparently to/from JS `Date` objects.
 *  - Free-form structured data (score components, score reasons, AI output,
 *    website observations, run error lists) is stored as JSON text columns.
 *    Callers should serialize/deserialize via the typed helpers exported
 *    below rather than hand-rolling `JSON.parse`/`JSON.stringify` at every
 *    call site.
 *  - This file intentionally does NOT import anything from `src/discovery`,
 *    `src/scoring`, etc. The database layer must not depend upward on
 *    higher layers (ARCHITECTURE.md §6 — narrow per-layer responsibility).
 */

import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Shared enums (as const string unions — SQLite has no native enum type)
// ---------------------------------------------------------------------------

/** WEBSITE_DETECTION.md §2 */
export const WEBSITE_STATUSES = [
  "NO_WEBSITE_FOUND",
  "OFFICIAL_WEBSITE_FOUND",
  "DIRECTORY_ONLY",
  "SOCIAL_ONLY",
  "POSSIBLE_WEBSITE",
  "WEBSITE_UNCERTAIN",
] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

/** ARCHITECTURE.md §16 / WEBSITE_DETECTION.md §6 */
export const HTTP_CHECK_RESULTS = [
  "ACTIVE",
  "REDIRECTED",
  "TIMEOUT",
  "DNS_FAILURE",
  "SERVER_ERROR",
  "NOT_FOUND",
  "BLOCKED",
  "UNKNOWN",
] as const;
export type HttpCheckResult = (typeof HTTP_CHECK_RESULTS)[number];

/** SCORING.md §4 */
export const LEAD_PRIORITIES = ["CRITICAL", "HIGH", "GOOD", "MODERATE", "LOW", "IGNORE"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

/** SCORING.md §24 */
export const LEAD_STATUSES = [
  "NEW",
  "REVIEW",
  "QUALIFIED",
  "CONTACTED",
  "RESPONDED",
  "INTERESTED",
  "NOT_INTERESTED",
  "FOLLOW_UP",
  "CLIENT",
  "ARCHIVED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** ARCHITECTURE.md §34 */
export const RUN_STATUSES = ["QUEUED", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** ARCHITECTURE.md §35 (pipeline stage list, with AI_PIPELINE.md's AI step inserted) */
export const PIPELINE_STAGES = [
  "DISCOVER",
  "NORMALIZE",
  "DEDUPLICATE",
  "VERIFY",
  "ANALYZE",
  "SCORE",
  "AI",
  "SAVE",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** ARCHITECTURE.md §36 (checkpoint status is implied — "status" per business/stage) */
export const CHECKPOINT_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "SKIPPED"] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

/** ARCHITECTURE.md §46 */
export const ERROR_CATEGORIES = [
  "NETWORK_ERROR",
  "DNS_ERROR",
  "TIMEOUT",
  "SOURCE_ERROR",
  "PARSE_ERROR",
  "RATE_LIMIT",
  "DATABASE_ERROR",
  "BROWSER_ERROR",
  "AI_ERROR",
  "UNKNOWN_ERROR",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** ARCHITECTURE.md §42 (business-level contact channels) */
export const CONTACT_TYPES = [
  "phone",
  "email",
  "contact_page",
  "website",
  "facebook",
  "instagram",
  "other_social",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

/** src/utils/validation.ts `searchCriteriaSchema.websiteFilter` */
export const WEBSITE_FILTERS = ["any", "required", "prohibited"] as const;
export type WebsiteFilter = (typeof WEBSITE_FILTERS)[number];

/** ARCHITECTURE.md §32, AI_PIPELINE.md §5 (analysis payload varies by type) */
export const ANALYSIS_TYPES = [
  "website_audit",
  "ai_qualification",
  "ai_opportunity",
  "ai_pitch",
  "manual",
] as const;
export type AnalysisType = (typeof ANALYSIS_TYPES)[number];

// ---------------------------------------------------------------------------
// businesses (ARCHITECTURE.md §29)
// ---------------------------------------------------------------------------

export const businesses = sqliteTable(
  "businesses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    name: text("name").notNull(),
    /** Lowercased, punctuation-stripped form used for dedup matching (ARCHITECTURE.md §11-12). */
    normalizedName: text("normalized_name").notNull(),
    category: text("category"),

    phone: text("phone"),
    email: text("email"),

    address: text("address"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    latitude: real("latitude"),
    longitude: real("longitude"),

    /**
     * Business-strength signals used by SCORING.md §8-9. These live on the
     * business record because they are discovered alongside identity data,
     * not derived from website analysis.
     */
    rating: real("rating"),
    reviewCount: integer("review_count"),

    /** JSON string array of public social profile URLs (DATA_SOURCES.md §7). */
    socialLinks: text("social_links", { mode: "json" }).$type<string[]>().default(sql`'[]'`),

    /** Discovery provenance — which adapter produced this record and its id there. */
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // Backstop against re-ingesting the exact same source record twice.
    // This is NOT the fuzzy deduplication logic (src/discovery/deduplicate.ts,
    // ARCHITECTURE.md §12) — it only prevents literal duplicates from a
    // single source across repeated runs.
    sourceUnique: uniqueIndex("businesses_source_unique").on(table.source, table.sourceId),
    normalizedNameIdx: index("businesses_normalized_name_idx").on(table.normalizedName),
    cityStateIdx: index("businesses_city_state_idx").on(table.city, table.state),
  }),
);

// ---------------------------------------------------------------------------
// websites (ARCHITECTURE.md §30, WEBSITE_DETECTION.md)
// ---------------------------------------------------------------------------

export const websites = sqliteTable(
  "websites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    url: text("url"),
    domain: text("domain"),

    /** WEBSITE_DETECTION.md §2 — the six detection states. */
    status: text("status", { enum: WEBSITE_STATUSES }).notNull(),

    httpStatus: integer("http_status"),
    /** WEBSITE_DETECTION.md §6 classification (ACTIVE/TIMEOUT/DNS_FAILURE/etc). */
    httpCheckResult: text("http_check_result", { enum: HTTP_CHECK_RESULTS }),
    httpsAvailable: integer("https_available", { mode: "boolean" }),
    reachable: integer("reachable", { mode: "boolean" }),
    redirectTarget: text("redirect_target"),
    responseTimeMs: integer("response_time_ms"),
    contentType: text("content_type"),

    /** Lightweight page metadata, kept small per ARCHITECTURE.md §55 (no full HTML stored). */
    title: text("title"),
    description: text("description"),

    /** 0-100 confidence that this domain actually belongs to the business (WEBSITE_DETECTION.md §7-8). */
    officialConfidence: integer("official_confidence"),

    firstSeen: integer("first_seen", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastChecked: integer("last_checked", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    businessIdx: index("websites_business_idx").on(table.businessId),
    domainIdx: index("websites_domain_idx").on(table.domain),
    lastCheckedIdx: index("websites_business_last_checked_idx").on(table.businessId, table.lastChecked),
  }),
);

// ---------------------------------------------------------------------------
// leads (ARCHITECTURE.md §31, SCORING.md §24/§28/§34)
// ---------------------------------------------------------------------------

/** Mirrors `LeadScore.components` in SCORING.md §34. */
export interface LeadScoreComponents {
  websiteOpportunity: number;
  websiteQuality: number;
  businessStrength: number;
  digitalPresence: number;
  businessComplexity: number;
  industryRelevance: number;
  websiteStrength: number;
  negativeSignals: number;
}

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    // One lead record per business — SCORING.md §25 describes recalculating
    // a lead's score in place as new evidence arrives, not creating a new
    // lead row per run.
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    /** Most recent run that (re)calculated this lead, for traceability. Nullable for manually-created leads. */
    lastRunId: integer("last_run_id").references((): any => runs.id, { onDelete: "set null" }),

    score: integer("score").notNull(),
    confidence: integer("confidence").notNull(),
    priority: text("priority", { enum: LEAD_PRIORITIES }).notNull(),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("NEW"),

    primaryReason: text("primary_reason"),
    /** Full component breakdown backing `score` (SCORING.md §17, §22 category caps). */
    components: text("components", { mode: "json" }).$type<LeadScoreComponents>(),
    /** Human-readable reasons list, e.g. "+40 No independent website detected" (SCORING.md §23). */
    reasons: text("reasons", { mode: "json" }).$type<string[]>().default(sql`'[]'`),

    /** e.g. "1.0" — bumped whenever src/scoring/weights.ts changes (SCORING.md §26). */
    scoreVersion: text("score_version").notNull(),

    /** SCORING.md §28 — a human override never silently replaces the deterministic score. */
    manualScore: integer("manual_score"),
    manualReason: text("manual_reason"),
    manualUpdatedAt: integer("manual_updated_at", { mode: "timestamp_ms" }),

    /** README.md "Lead record" — free-text user notes, not AI-generated. */
    notes: text("notes"),

    calculatedAt: integer("calculated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    businessUnique: uniqueIndex("leads_business_unique").on(table.businessId),
    scoreIdx: index("leads_score_idx").on(table.score),
    priorityIdx: index("leads_priority_idx").on(table.priority),
    statusIdx: index("leads_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// analyses (ARCHITECTURE.md §32, AI_PIPELINE.md §5)
// ---------------------------------------------------------------------------

export const analyses = sqliteTable(
  "analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    analysisType: text("analysis_type", { enum: ANALYSIS_TYPES }).notNull(),

    /**
     * Flexible JSON payload. Shape depends on `analysisType`:
     *  - "website_audit"     → structured observations (ARCHITECTURE.md §19)
     *  - "ai_qualification"  → business-analysis.ts schema output
     *  - "ai_opportunity"    → lead-analysis.ts schema output (AI_PIPELINE.md §5)
     *  - "ai_pitch"          → draft paragraph + confidence (AI_PROMPTS.md §6)
     *  - "manual"            → free-form notes recorded by the user
     * Deliberately untyped here; each producing module is responsible for
     * validating against its own Zod schema in src/ai/schemas/ before
     * writing, and for validating on read.
     */
    data: text("data", { mode: "json" }).notNull(),

    /** e.g. "none" (deterministic-only) or "ollama:llama3.2:3b" (AI_PIPELINE.md §9). */
    model: text("model").notNull().default("none"),
    /** Bumped when a prompt template's structure/tone changes (AI_PROMPTS.md §9). Null for non-AI analyses. */
    promptVersion: text("prompt_version"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    leadIdx: index("analyses_lead_idx").on(table.leadId),
    leadTypeIdx: index("analyses_lead_type_idx").on(table.leadId, table.analysisType),
  }),
);

// ---------------------------------------------------------------------------
// searches (ARCHITECTURE.md §33)
// ---------------------------------------------------------------------------

export const searches = sqliteTable(
  "searches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    industry: text("industry").notNull(),
    location: text("location").notNull(),
    radiusMiles: real("radius_miles").notNull().default(25),
    minRating: real("min_rating"),
    minReviews: integer("min_reviews"),
    resultLimit: integer("result_limit").notNull().default(50),
    websiteFilter: text("website_filter", { enum: WEBSITE_FILTERS }).notNull().default("any"),

    /** Optional user-facing name for a saved search (README.md "automatic recurring searches"). */
    label: text("label"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    createdAtIdx: index("searches_created_at_idx").on(table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// runs (ARCHITECTURE.md §34)
// ---------------------------------------------------------------------------

export interface RunErrorEntry {
  category: ErrorCategory;
  message: string;
  businessId?: number;
  stage?: PipelineStage;
  occurredAt: string; // ISO timestamp
}

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Null for one-off/manual runs not tied to a saved search. */
    searchId: integer("search_id").references(() => searches.id, { onDelete: "set null" }),

    status: text("status", { enum: RUN_STATUSES }).notNull().default("QUEUED"),

    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),

    businessesFound: integer("businesses_found").notNull().default(0),
    businessesProcessed: integer("businesses_processed").notNull().default(0),
    websitesVerified: integer("websites_verified").notNull().default(0),
    leadsCreated: integer("leads_created").notNull().default(0),

    /** Bounded rolling log of per-item failures that did not abort the run (ARCHITECTURE.md §46, §65). */
    errors: text("errors", { mode: "json" }).$type<RunErrorEntry[]>().default(sql`'[]'`),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    statusIdx: index("runs_status_idx").on(table.status),
    searchIdx: index("runs_search_idx").on(table.searchId),
  }),
);

// ---------------------------------------------------------------------------
// run_checkpoints (ARCHITECTURE.md §36 — pipeline resumability)
// ---------------------------------------------------------------------------

export const runCheckpoints = sqliteTable(
  "run_checkpoints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),

    /**
     * Nullable because a checkpoint can exist for a discovery-stage item
     * before it has been normalized/persisted as a `businesses` row yet.
     * `externalRef` carries the source-provided identifier in that case so
     * the checkpoint can still be matched up once the business is saved.
     */
    businessId: integer("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    externalRef: text("external_ref"),

    stage: text("stage", { enum: PIPELINE_STAGES }).notNull(),
    status: text("status", { enum: CHECKPOINT_STATUSES }).notNull().default("PENDING"),

    errorCategory: text("error_category", { enum: ERROR_CATEGORIES }),
    errorMessage: text("error_message"),

    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    runIdx: index("run_checkpoints_run_idx").on(table.runId),
    runStageIdx: index("run_checkpoints_run_stage_idx").on(table.runId, table.stage, table.status),
    runBusinessIdx: index("run_checkpoints_run_business_idx").on(table.runId, table.businessId),
  }),
);

// ---------------------------------------------------------------------------
// contacts (ARCHITECTURE.md §28/§42)
// ---------------------------------------------------------------------------

export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    type: text("type", { enum: CONTACT_TYPES }).notNull(),
    value: text("value").notNull(),
    label: text("label"),
    source: text("source"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    businessIdx: index("contacts_business_idx").on(table.businessId),
    businessTypeIdx: index("contacts_business_type_idx").on(table.businessId, table.type),
  }),
);

// ---------------------------------------------------------------------------
// Relations (enables Drizzle's relational query API, e.g. db.query.businesses.findMany)
// ---------------------------------------------------------------------------

export const businessesRelations = relations(businesses, ({ many }) => ({
  websites: many(websites),
  leads: many(leads),
  contacts: many(contacts),
  checkpoints: many(runCheckpoints),
}));

export const websitesRelations = relations(websites, ({ one }) => ({
  business: one(businesses, { fields: [websites.businessId], references: [businesses.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  business: one(businesses, { fields: [leads.businessId], references: [businesses.id] }),
  lastRun: one(runs, { fields: [leads.lastRunId], references: [runs.id] }),
  analyses: many(analyses),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  lead: one(leads, { fields: [analyses.leadId], references: [leads.id] }),
}));

export const searchesRelations = relations(searches, ({ many }) => ({
  runs: many(runs),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  search: one(searches, { fields: [runs.searchId], references: [searches.id] }),
  checkpoints: many(runCheckpoints),
  leads: many(leads),
}));

export const runCheckpointsRelations = relations(runCheckpoints, ({ one }) => ({
  run: one(runs, { fields: [runCheckpoints.runId], references: [runs.id] }),
  business: one(businesses, { fields: [runCheckpoints.businessId], references: [businesses.id] }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  business: one(businesses, { fields: [contacts.businessId], references: [businesses.id] }),
}));

// ---------------------------------------------------------------------------
// Convenience row types
// ---------------------------------------------------------------------------

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;

export type Website = typeof websites.$inferSelect;
export type NewWebsite = typeof websites.$inferInsert;

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;

export type Search = typeof searches.$inferSelect;
export type NewSearch = typeof searches.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type RunCheckpoint = typeof runCheckpoints.$inferSelect;
export type NewRunCheckpoint = typeof runCheckpoints.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

/** All tables, grouped for convenient `drizzle(sqlite, { schema })` construction in database.ts. */
export const schema = {
  businesses,
  websites,
  leads,
  analyses,
  searches,
  runs,
  runCheckpoints,
  contacts,
  businessesRelations,
  websitesRelations,
  leadsRelations,
  analysesRelations,
  searchesRelations,
  runsRelations,
  runCheckpointsRelations,
  contactsRelations,
};
