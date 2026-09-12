# K!D Lead Hunter — Roadmap

## 1. Purpose

This document tracks the development phases for K!D Lead Hunter, expanding on the phase list in `ARCHITECTURE.md` §62 and the MVP definition in §63. It exists so progress and future scope are visible in one place, separate from the architectural "why" documents.

This is a living document. Update it as phases complete or scope changes — do not let it silently drift out of sync with reality.

---

# 2. Guiding Constraint

Every phase below must remain compatible with:

```text
- $0 budget (ZERO_COST.md)
- Surface Pro 3 / 4GB RAM hardware
- deterministic-first, AI-optional design
- personal, single-user use
```

If a proposed roadmap item would violate any of these, it gets redesigned or deferred — not silently exempted.

---

# 3. Phase 1 — Foundation

**Status:** Not started

```text
- Next.js project scaffolding
- SQLite database + Drizzle schema (ARCHITECTURE.md §28-34)
- Dashboard shell (empty pages for each route)
- Logging utility (src/utils/logger.ts)
- Configuration loading (.env handling)
```

**Exit criteria:** `npm run dev` starts a local dashboard with working navigation and an empty-but-connected database.

---

# 4. Phase 2 — Discovery

**Status:** Not started

```text
- DiscoverySource interface (ARCHITECTURE.md §9)
- OpenStreetMap adapter
- Foursquare adapter
- Web-search adapter (for domain discovery, not general discovery)
- Normalization (src/discovery/normalize.ts, ARCHITECTURE.md §11)
- Deduplication (src/discovery/deduplicate.ts, ARCHITECTURE.md §12)
```

**Exit criteria:** Given an industry + location, the app returns a deduplicated list of candidate businesses from at least one real source.

---

# 5. Phase 3 — Website Verification

**Status:** Not started

```text
- DNS checks (src/verification/dns.ts)
- HTTP checks (src/verification/http.ts)
- Redirect handling (src/verification/redirects.ts)
- Official-domain identity matching (src/verification/website.ts)
- Full detection-state pipeline per WEBSITE_DETECTION.md
```

**Exit criteria:** Every discovered business resolves to one of the six detection states in `WEBSITE_DETECTION.md` §2, with a confidence value.

---

# 6. Phase 4 — Website Analysis

**Status:** Not started

```text
- HTML fetch + parse (src/analyzer/crawler.ts, parser.ts)
- SEO observations (src/analyzer/seo.ts)
- Mobile observations (src/analyzer/mobile.ts)
- Conversion observations (src/analyzer/conversion.ts)
- Performance observations (src/analyzer/performance.ts)
- Technology fingerprinting (src/analyzer/technology.ts)
- Playwright escalation path (src/analyzer/browser.ts), used only
  when static HTML analysis is insufficient
```

**Exit criteria:** For any website marked `OFFICIAL_WEBSITE_FOUND`, the app produces a structured observations object matching the shape in `ARCHITECTURE.md` §19.

---

# 7. Phase 5 — Scoring

**Status:** Not started

```text
- Implement SCORING.md in full:
    src/scoring/weights.ts   (all point values, configurable)
    src/scoring/rules.ts     (category logic, caps, double-count
                              prevention per SCORING.md §21-22)
    src/scoring/score.ts     (final formula + clamp)
    src/scoring/confidence.ts (confidence calculation, SCORING.md §16)
- Start with the MVP scoring subset (SCORING.md §29) before adding
  the full rule set
```

**Exit criteria:** Given a business + website observations, the app produces a 0-100 score, a priority tier, a confidence value, and a human-readable reasons list — matching the examples in `SCORING.md` §18-20.

---

# 8. Phase 6 — Pipeline

**Status:** Not started

```text
- Wire discover → normalize → deduplicate → verify → analyze →
  score → save into a single orchestrated pipeline
  (src/pipeline/*.ts)
- Pipeline checkpoints / resumability (ARCHITECTURE.md §36)
- Error classification and isolation (ARCHITECTURE.md §46)
- Batch processing with memory release (ARCHITECTURE.md §52)
```

**Exit criteria:** A full run can be started, interrupted, and resumed without data loss or duplicate processing.

---

# 9. Phase 7 — Dashboard

**Status:** Not started

```text
- Search page (industry, location, radius, filters)
- Leads table (sortable, matches ARCHITECTURE.md §44)
- Lead detail page (facts / analysis / score / AI, separated per
  ARCHITECTURE.md §45)
- Opportunities page (ranked prospects)
- Runs page (history, status)
- Settings page (concurrency, timeouts, AI toggle, source config)
- Export controls (CSV / JSON / Markdown)
```

**Exit criteria:** The MVP workflow in `README.md` ("MVP Definition") works end-to-end through the UI, without needing to touch the database or CLI directly.

---

# 10. Phase 8 — Optional AI

**Status:** Not started — deliberately last

```text
- AIProvider interface (ARCHITECTURE.md §58)
- Ollama provider (src/ai/ollama.ts)
- Health check (src/ai/health.ts)
- Router with deterministic fallback (src/ai/router.ts)
- Prompt templates per AI_PROMPTS.md
- Structured output validation (Zod schemas, src/ai/schemas/)
- AI candidate filtering and sequential batch execution
  (AI_PIPELINE.md §3, §13)
```

**Exit criteria:** With `AI_ENABLED=true` and Ollama running a small model, top-scoring leads get an AI interpretation section in their detail view. With `AI_ENABLED=false`, the entire app functions identically minus that section.

---

# 11. Post-MVP: Calibration

**Status:** Ongoing, begins after Phase 7 is usable

```text
- Run real searches, review ~50-100 prospects (SCORING.md §30)
- Track predicted priority vs. actual outcome
- Adjust weights in src/scoring/weights.ts
- Bump score_version when weights change (SCORING.md §26)
```

This is not a one-time phase — it recurs as real-world data accumulates.

---

# 12. Explicitly Deferred (Not on This Roadmap)

Per `README.md` ("What the First Version Should NOT Do"):

```text
- automated cold-email sending
- autonomous follow-up
- paid CRM integrations
- public user accounts / multi-user support
- billing
- large-scale scraping infrastructure
- large local or cloud LLMs as a required dependency
- complex cloud/container architecture
```

These may be revisited only as explicit, separate decisions — not absorbed silently into a later phase.

---

# 13. Candidate Future Enhancements

Unscheduled, but compatible with the architecture if prioritized later (see `README.md` "Future Enhancements" and `ARCHITECTURE.md` §35, §66):

```text
- domain age / technology age signals
- review velocity / social posting frequency tracking
- competitor website quality comparison
- lead notes and richer status workflow
- automatic recurring/scheduled searches (Windows Task Scheduler)
- Windows notifications for new CRITICAL leads
- swap SQLite → PostgreSQL if usage outgrows a single local file
- swap local AI → cloud AI, strictly opt-in (ZERO_COST.md §5)
```

---

# 14. How to Update This Document

When a phase completes:

```text
1. Change its Status line (Not started → In progress → Complete)
2. Note the completion date
3. If scope changed mid-phase, note what was added/removed and why
```

When a new idea comes up that isn't in Section 13, add it there rather than immediately scheduling it — deliberate prioritization beats scope creep.
