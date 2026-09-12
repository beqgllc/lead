# K!D Lead Hunter — Architecture

## 1. Overview

K!D Lead Hunter is a private, local-first lead-intelligence application designed to identify businesses that may represent strong opportunities for web-development services.

The application is being designed for:

- personal use only
- a strict **$0 budget**
- a **Surface Pro 3**
- Intel Core i3-4020Y
- 2 physical CPU cores / 4 logical processors
- 4 GB RAM
- Windows
- intermittent or ordinary internet connectivity
- no dedicated GPU
- no paid cloud infrastructure
- no paid AI APIs

The architecture therefore prioritizes:

1. low memory usage
2. deterministic processing
3. local storage
4. minimal background services
5. conservative network usage
6. modularity
7. explainability
8. optional AI rather than mandatory AI

The application should continue functioning even when no AI model is available.

---

# 2. Architectural Philosophy

The system is not fundamentally an AI application.

It is a **lead intelligence pipeline** with an optional AI reasoning layer.

The core principle is:

```text
Use ordinary software for things software can determine reliably.

Use AI only where contextual judgment is useful.
```

Examples:

### Deterministic software

- DNS resolution
- HTTP status
- HTTPS detection
- URL normalization
- redirects
- HTML parsing
- title extraction
- meta extraction
- viewport detection
- link inspection
- form detection
- technology detection
- duplicate detection
- scoring
- database operations

### AI

- business-context interpretation
- ambiguous website classification
- opportunity explanation
- service recommendations
- personalized outreach drafts

---

# 3. High-Level Architecture

```text
                         USER
                          │
                          ▼
                 ┌─────────────────┐
                 │ Local Dashboard │
                 │    Next.js      │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  API / Control  │
                 │     Layer       │
                 └────────┬────────┘
                          │
              ┌───────────┼────────────┐
              │           │            │
              ▼           ▼            ▼
        Discovery     Lead Engine   Database
              │           │            │
              └─────┬─────┘            │
                    ▼                  │
             Web Verification          │
                    │                  │
                    ▼                  │
              Website Analyzer         │
                    │                  │
                    ▼                  │
               Lead Scoring ───────────┤
                    │                  │
                    ▼                  │
              Optional AI              │
                    │                  │
                    └──────────┬───────┘
                               ▼
                         Lead Dashboard
```

---

# 4. Runtime Model

The application runs primarily on the user's Surface Pro 3.

There is no requirement for:

- a dedicated server
- Docker
- Kubernetes
- cloud deployment
- Redis
- external database server
- message broker
- paid AI service

The preferred runtime is:

```text
Windows
  │
  ├── Node.js
  │
  ├── Next.js
  │
  ├── SQLite
  │
  └── Playwright only when required
```

The application can be started manually:

```bash
npm run dev
```

or run as a production local application:

```bash
npm run build
npm start
```

---

# 5. Resource Constraints

The Surface Pro 3 is the primary architectural constraint.

With 4 GB RAM, the application must avoid unnecessary concurrent processes.

The following principles are mandatory:

### Avoid persistent heavy services

Do not require:

- local LLM servers running constantly
- large browser farms
- Chromium workers running continuously
- Docker containers
- multiple Node workers
- memory-heavy queues

### Prefer sequential work

Instead of:

```text
100 websites
   ↓
100 simultaneous browser processes
```

use:

```text
100 websites
   ↓
1–3 controlled workers
   ↓
one site at a time where practical
```

### Prefer HTTP over browser rendering

Use:

```text
fetch()
```

before:

```text
Playwright
```

---

# 6. Application Layers

The system is divided into eight logical layers.

```text
1. Presentation
2. API
3. Pipeline
4. Discovery
5. Web Intelligence
6. Scoring
7. Optional AI
8. Persistence
```

Each layer should have a narrow responsibility.

---

# 7. Presentation Layer

Location:

```text
src/app/
src/components/
src/hooks/
```

Technology:

- Next.js
- React
- TypeScript
- CSS/Tailwind if desired

The dashboard provides:

- search configuration
- lead results
- lead detail
- opportunity ranking
- run history
- website audit information
- scoring explanations
- export controls
- settings

The interface should remain lightweight.

Do not build a large client-side state-management system unless actual complexity requires one.

---

# 8. API Layer

Location:

```text
src/api/
```

Responsibilities:

- receive dashboard commands
- validate inputs
- start discovery jobs
- retrieve leads
- request audits
- request exports
- expose run status

The API layer should not contain large amounts of business logic.

Instead:

```text
API route
   ↓
pipeline/service
   ↓
domain module
```

---

# 9. Discovery Layer

Location:

```text
src/discovery/
```

Purpose:

> Find candidate businesses.

Discovery sources should be modular.

Example:

```text
DiscoverySource
├── OpenStreetMap
├── permitted web-search source
├── Foursquare where free access is available
└── future source
```

Every source should implement a common interface.

Example:

```ts
interface DiscoverySource {
  search(
    query: DiscoveryQuery
  ): Promise<BusinessCandidate[]>;
}
```

This makes sources interchangeable.

---

# 10. Data-Source Rule

The application must not assume that a website search result or directory listing grants permission to scrape or permanently store all associated data.

Each source adapter must document:

- source name
- access method
- rate limitations
- attribution requirements
- data-storage limitations
- prohibited uses
- fields collected

The system should only collect information necessary for the personal lead-hunting workflow.

---

# 11. Normalization

Raw results from multiple sources frequently contain duplicate or inconsistent information.

Normalization occurs before lead scoring.

Example:

```text
"Joe's Plumbing LLC"
"Joes Plumbing"
"Joe's Plumbing, LLC"
```

may refer to the same business.

Normalization should standardize:

- business name
- phone
- URL
- domain
- address
- city
- state
- postal code
- category

---

# 12. Deduplication

Duplicate detection should combine multiple signals.

Possible matching keys:

```text
normalized business name
+
phone number
+
domain
+
address
```

Do not rely exclusively on name matching.

Example:

```text
ABC Roofing
ABC Roofing LLC
ABC Roofing Services
```

may or may not be the same business.

The deduplication layer should produce a confidence value rather than blindly merging uncertain records.

---

# 13. Website Discovery

Location:

```text
src/verification/website.ts
src/discovery/web-search.ts
```

Purpose:

> Determine whether a candidate business appears to have an independent official website.

The detector should distinguish:

```text
NO_WEBSITE_FOUND
OFFICIAL_WEBSITE_FOUND
DIRECTORY_ONLY
SOCIAL_ONLY
POSSIBLE_WEBSITE
WEBSITE_UNCERTAIN
```

This is more useful than a simple boolean.

---

# 14. Website Verification Pipeline

The website detection process should be:

```text
Business candidate
       │
       ▼
Known website field?
       │
       ├── yes ──► verify domain
       │
       └── no
            │
            ▼
       domain discovery
            │
            ▼
       candidate domains
            │
            ▼
       HTTP/DNS checks
            │
            ▼
       page inspection
            │
            ▼
       business identity matching
            │
            ▼
       confidence score
```

---

# 15. Official Website Identification

Finding a domain is not enough.

The system should compare the candidate website against the business.

Useful signals include:

- business name in title
- business name in page text
- phone number match
- address match
- city match
- service/category match
- social profile links
- branding
- contact information
- domain naming

Example:

```text
Business:
Joe's Plumbing

Candidate:
joesplumbingtampa.com

Signals:
Name match       ✓
City match       ✓
Phone match      ✓
Service match    ✓

Confidence:
HIGH
```

---

# 16. HTTP Verification

For every candidate domain, record:

```text
http_status
https_available
redirect_target
response_time
content_type
reachable
```

Possible results:

```text
ACTIVE
REDIRECTED
TIMEOUT
DNS_FAILURE
SERVER_ERROR
NOT_FOUND
BLOCKED
UNKNOWN
```

Temporary network failures must not automatically be interpreted as a dead website.

---

# 17. HTML Analysis

Where possible, fetch pages with ordinary HTTP requests rather than a browser.

Analyze:

```text
<title>
<meta description>
<meta viewport>
<h1>
<h2>
<a>
<form>
tel links
mailto links
social links
canonical
structured data
images
scripts
```

Also detect:

- obvious contact information
- service pages
- booking links
- quote forms
- navigation
- calls to action

---

# 18. Browser Escalation

Playwright is expensive relative to simple HTTP requests and should therefore be an escalation mechanism.

Preferred order:

```text
HTTP
  ↓
HTML parser
  ↓
deterministic analysis
  ↓
Need JavaScript?
  │
  ├── no → finish
  │
  └── yes
       ↓
    Playwright
```

Only use a browser when static inspection is insufficient.

---

# 19. Website Analyzer

Location:

```text
src/analyzer/
```

The analyzer should create structured observations rather than immediately assigning an opinion.

Example:

```json
{
  "mobile": {
    "viewport": false,
    "responsiveSignals": false
  },
  "seo": {
    "title": true,
    "description": false
  },
  "conversion": {
    "contactForm": false,
    "cta": false,
    "booking": false
  }
}
```

The scoring engine converts those observations into opportunity points.

---

# 20. Performance Analysis

Because of the Surface Pro 3 constraints, initial performance analysis should be lightweight.

Use:

- response time
- content size
- asset counts
- obvious blocking behavior
- simple document metrics

Full Lighthouse audits should be optional rather than mandatory for every site.

A future implementation may run Lighthouse only for top-ranked prospects.

---

# 21. Technology Detection

The analyzer may detect technologies using lightweight fingerprints.

Possible outputs:

```text
WordPress
Shopify
Wix
Squarespace
Webflow
Next.js
React
Static HTML
Unknown
```

Technology detection is supporting evidence, not proof that a site is outdated.

---

# 22. Lead Scoring Layer

Location:

```text
src/scoring/
```

The scoring engine should be deterministic.

Primary output:

```text
0–100 opportunity score
```

Secondary output:

```text
0–100 confidence
```

See `SCORING.md` for the scoring model.

---

# 23. AI Layer

Location:

```text
src/ai/
```

The AI layer is optional.

The system must be able to run with:

```text
AI_ENABLED=false
```

AI should receive already-processed information.

It should not receive raw uncontrolled web pages whenever avoidable.

Preferred flow:

```text
Business
+
structured website observations
+
score
+
evidence
      ↓
AI
      ↓
interpretation
```

---

# 24. AI Responsibilities

The AI may perform:

### Business qualification

```text
Is this a worthwhile prospect?
```

### Opportunity interpretation

```text
Why might this business benefit from web development?
```

### Service recommendation

```text
What service would most logically help?
```

### Outreach drafting

```text
Generate a factual, personalized pitch.
```

The AI must not invent business facts.

---

# 25. Local AI Strategy

Because the Surface Pro 3 has only 4 GB RAM, local LLM use is considered optional.

Do not require a large model.

Do not assume:

```text
27B
32B
70B
```

models are viable.

The first release should work perfectly without a local model.

Later, an extremely small quantized model can be tested if available hardware permits.

The application should expose a model-health check:

```text
AI available?
Model available?
Memory suitable?
Response successful?
```

---

# 26. AI Fallback

The router should provide:

```text
LOCAL_AI_AVAILABLE
        │
        ├── yes → local analysis
        │
        └── no
             ↓
        deterministic analysis
```

There must never be a hard dependency on AI availability.

---

# 27. Database Layer

Technology:

```text
SQLite
```

Reason:

- no server
- no cloud
- no cost
- tiny footprint
- simple backups
- excellent for personal use
- suitable for the expected dataset

The database should live under:

```text
data/database.sqlite
```

Database files should never be committed to Git.

---

# 28. Core Entities

The initial schema should contain:

```text
Business
Website
Lead
Analysis
Search
Run
Contact
```

Relationship model:

```text
Business
   │
   ├── Websites
   │
   ├── Leads
   │
   └── Contacts

Lead
   │
   └── Analyses

Search
   │
   └── Run
```

---

# 29. Business Entity

Suggested fields:

```text
id
name
normalized_name
category
phone
address
city
state
postal_code
latitude
longitude
source
source_id
created_at
updated_at
```

Only fields needed by the system should be retained.

---

# 30. Website Entity

Suggested fields:

```text
id
business_id
url
domain
status
http_status
https
reachable
official_confidence
first_seen
last_checked
```

---

# 31. Lead Entity

Suggested fields:

```text
id
business_id
score
confidence
priority
status
primary_reason
created_at
updated_at
```

---

# 32. Analysis Entity

Suggested fields:

```text
id
lead_id
analysis_type
data
model
created_at
```

The `data` field may use JSON for flexible analysis results.

---

# 33. Search Entity

Stores the parameters used to discover businesses.

Example:

```text
industry
location
radius
minimum_rating
minimum_reviews
website_filter
created_at
```

This makes searches reproducible.

---

# 34. Run Entity

A run represents one execution of the lead-hunting pipeline.

Possible states:

```text
QUEUED
RUNNING
PAUSED
COMPLETED
FAILED
CANCELLED
```

Track:

```text
started_at
completed_at
businesses_found
businesses_processed
websites_verified
leads_created
errors
```

---

# 35. Pipeline

The primary processing pipeline should be:

```text
DISCOVER
   ↓
NORMALIZE
   ↓
DEDUPLICATE
   ↓
VERIFY
   ↓
ANALYZE
   ↓
SCORE
   ↓
OPTIONAL AI
   ↓
SAVE
   ↓
DISPLAY
```

Each phase should be independently testable.

---

# 36. Pipeline Checkpoints

Long runs must be resumable.

After each major operation, store progress.

For example:

```text
run_id
business_id
stage
status
completed_at
error
```

If the program crashes, it should be possible to continue instead of starting over.

---

# 37. Concurrency

Because of the 4 GB RAM limit, concurrency should be conservative.

Initial default:

```text
1 worker
```

Optional setting:

```text
2 workers
```

Do not default to large parallel workloads.

A configurable limiter should control:

- requests per second
- concurrent domains
- browser instances
- retries

---

# 38. Cache

Caching is important for both speed and network efficiency.

Possible cache targets:

```text
DNS results
HTTP results
website fingerprints
domain discovery
business records
AI analyses
```

Every cache entry should have an expiration policy.

Do not treat stale data as current.

---

# 39. Retry Strategy

Network failures happen.

Use bounded retries.

Example:

```text
Attempt 1
   ↓
failure
   ↓
wait
   ↓
Attempt 2
   ↓
failure
   ↓
wait
   ↓
Attempt 3
   ↓
mark uncertain
```

Do not retry indefinitely.

---

# 40. Robots and Access Controls

The crawler must respect reasonable website access controls.

At minimum:

- inspect `robots.txt` where appropriate
- avoid high request rates
- identify the application where practical
- stop repeated failures
- do not attempt to bypass authentication
- do not bypass technical restrictions

This is a lead-research utility, not an evasion tool.

---

# 41. Data Minimization

The application should collect information relevant to the business lead.

Prefer:

```text
business identity
public business contact details
public website information
public business-category information
```

Avoid collecting unnecessary personal information about individual people.

---

# 42. Contact Information

The system may store public business-level contact information needed for outreach.

Examples:

```text
business phone
business email
business contact page
business website
```

Do not design the initial version around collecting sensitive personal data.

---

# 43. Export System

Supported formats:

```text
CSV
JSON
Markdown
```

A CSV export might contain:

```text
Business
Category
City
Website Status
Website
Rating
Reviews
Opportunity Score
Confidence
Primary Reason
```

Exports are written to:

```text
data/exports/
```

---

# 44. Dashboard Sections

The minimum dashboard should contain:

## Home

```text
Total leads
New leads
Critical leads
High leads
Recent runs
```

## Search

```text
Industry
Location
Radius
Filters
Start search
```

## Leads

```text
sortable lead table
```

## Lead Detail

```text
business
website status
evidence
score
confidence
analysis
```

## Opportunities

```text
ranked prospects
```

## Runs

```text
historical search runs
```

## Settings

```text
concurrency
timeouts
source configuration
AI settings
```

---

# 45. Lead Detail Architecture

A lead detail view should separate facts from interpretation.

```text
OBSERVED FACTS
──────────────
Rating: 4.8
Reviews: 127
Website: Not found
Facebook: Active

DETERMINISTIC ANALYSIS
──────────────────────
Website opportunity: 40
Business strength: 14
Digital presence: 10

SCORE
─────
91/100

AI INTERPRETATION
─────────────────
Potential opportunity because...
```

This prevents AI-generated statements from being mistaken for collected facts.

---

# 46. Error Handling

Errors should be classified.

```text
NETWORK_ERROR
DNS_ERROR
TIMEOUT
SOURCE_ERROR
PARSE_ERROR
RATE_LIMIT
DATABASE_ERROR
BROWSER_ERROR
AI_ERROR
UNKNOWN_ERROR
```

The application should record the error and continue processing other candidates whenever safe.

One broken website must not terminate the entire run.

---

# 47. Logging

Logging should be lightweight.

Suggested levels:

```text
DEBUG
INFO
WARN
ERROR
```

Logs should contain:

```text
timestamp
run id
business id
stage
message
```

Avoid dumping entire web pages into logs.

---

# 48. Security

Even though the application is personal and local, basic protections should remain.

Never hard-code:

- API keys
- tokens
- passwords
- secrets

Use:

```text
.env
```

and provide:

```text
.env.example
```

Never commit `.env`.

---

# 49. Git Strategy

The repository should track source code and documentation, but not generated data.

`.gitignore` should exclude:

```text
.env
node_modules/
.next/
data/database.sqlite
data/cache/
data/screenshots/
data/exports/
logs/
```

---

# 50. Backup Strategy

Because SQLite stores the system locally, backups are important.

Provide a simple command such as:

```bash
npm run backup
```

The command should copy the database to:

```text
data/backups/
```

with a timestamp.

---

# 51. Scheduling

Windows Task Scheduler should be the preferred scheduler.

Example:

```text
Every morning at 7:00 AM
      ↓
Start K!D Lead Hunter
      ↓
Run saved searches
      ↓
Process leads
      ↓
Exit
```

The system should not require a permanent background server.

---

# 52. Batch Processing

Runs should operate in batches.

Example:

```text
Batch size: 25
```

After each batch:

```text
save results
flush cache
release memory
continue
```

This is safer on a 4 GB machine than keeping a huge working set in memory.

---

# 53. Memory Management

The following practices are recommended:

- stream large results
- avoid loading thousands of full HTML documents simultaneously
- truncate stored HTML
- store extracted observations rather than full pages
- close Playwright contexts immediately
- process candidates sequentially
- release browser instances after use
- avoid large in-memory arrays

---

# 54. Browser Memory Rules

If Playwright is used:

```text
1 browser
1 context
1 page
```

should be the default.

Close everything after use.

Do not keep pages open across unrelated businesses.

---

# 55. Website Content Storage

Do not store full websites by default.

Store:

```text
URL
status
selected metadata
selected extracted observations
analysis timestamp
```

If page content is temporarily needed for analysis, process it in memory and discard it unless there is a documented reason to retain it.

---

# 56. Deterministic-First Processing

A complete run should attempt to answer as much as possible without AI.

Example:

```text
No website?
→ deterministic

Website reachable?
→ deterministic

Mobile viewport?
→ deterministic

Contact form?
→ deterministic

CTA?
→ deterministic

SEO metadata?
→ deterministic

Lead score?
→ deterministic

Why this matters?
→ optional AI
```

This keeps the system fast and free.

---

# 57. AI Cost Policy

The project has a strict:

```text
$0 INITIAL AND OPERATING BUDGET
```

Therefore the architecture must not require:

- paid API credits
- paid model subscriptions
- paid hosting
- paid databases
- paid scraping services
- paid proxy services

Any future external service must be optional and must not break the core application.

---

# 58. AI Model Abstraction

Use an interface.

```ts
interface AIProvider {
  analyzeBusiness(input: BusinessAnalysisInput): Promise<BusinessAnalysis>;
  analyzeWebsite(input: WebsiteAnalysisInput): Promise<WebsiteAnalysis>;
  generatePitch(input: PitchInput): Promise<string>;
}
```

Possible providers later:

```text
Local model
Cloud model
Another local model
```

The rest of the application must not depend on the implementation.

---

# 59. Deterministic Fallback

Every AI operation must have a fallback.

Example:

```ts
try {
  return await ai.analyzeBusiness(input);
} catch {
  return buildDeterministicAnalysis(input);
}
```

The fallback should clearly identify that no AI interpretation was generated.

---

# 60. Testing Architecture

Testing should be focused on the pipeline's critical logic.

Test:

```text
normalization
deduplication
website detection
domain verification
HTML parsing
scoring
confidence scoring
pipeline resumption
database operations
```

AI tests should test:

```text
valid structured output
invalid output
missing fields
model unavailable
timeout
```

---

# 61. Test Fixtures

Store small local test websites and business records.

Examples:

```text
tests/fixtures/
├── no-website/
├── modern-site/
├── outdated-site/
├── broken-site/
├── social-only/
└── ambiguous-domain/
```

This makes website-detection tests repeatable without repeatedly crawling the live web.

---

# 62. Development Phases

## Phase 1 — Foundation

Build:

```text
Next.js
SQLite
schema
dashboard shell
logging
configuration
```

## Phase 2 — Discovery

Build:

```text
source adapter
normalization
deduplication
```

## Phase 3 — Website Verification

Build:

```text
DNS
HTTP
redirects
official-domain detection
```

## Phase 4 — Website Analysis

Build:

```text
HTML analysis
SEO observations
mobile observations
conversion observations
technology fingerprints
```

## Phase 5 — Scoring

Implement `SCORING.md`.

## Phase 6 — Pipeline

Combine:

```text
discover → verify → analyze → score → save
```

## Phase 7 — Dashboard

Expose:

```text
search
leads
opportunities
runs
```

## Phase 8 — Optional AI

Add the local AI interface only after the deterministic system works.

---

# 63. MVP Definition

The MVP is complete when the application can:

```text
1. Accept an industry and location.
2. Discover candidate businesses from an available source.
3. Normalize and deduplicate them.
4. Determine whether an independent website appears to exist.
5. Verify the website when found.
6. Audit basic website quality.
7. Calculate a transparent 0–100 score.
8. Store the results in SQLite.
9. Display ranked prospects.
10. Export the results.
```

AI is not required for MVP completion.

---

# 64. Performance Target

The initial performance goal is not maximum throughput.

It is:

> **Reliable unattended processing on the Surface Pro 3 without exhausting memory.**

A slower process that successfully produces high-quality leads is preferable to a fast process that crashes or produces unreliable results.

---

# 65. Reliability Principle

A failed external source should not destroy the local database.

A failed website should not terminate the run.

A failed AI operation should not prevent lead creation.

A browser crash should not invalidate previously completed results.

Every stage should fail independently wherever possible.

---

# 66. Design for Upgrades

Although the application starts on a Surface Pro 3, its modules should not be hard-coded to that machine.

Later, it should be possible to replace:

```text
SQLite
```

with:

```text
PostgreSQL
```

or:

```text
local AI
```

with:

```text
cloud AI
```

without redesigning the entire application.

But no upgrade should be necessary for the MVP.

---

# 67. Architectural Summary

The final architecture is:

```text
             ┌────────────────────┐
             │   LOCAL DASHBOARD  │
             │       Next.js      │
             └─────────┬──────────┘
                       │
                       ▼
             ┌────────────────────┐
             │    API / CONTROL   │
             └─────────┬──────────┘
                       │
                       ▼
             ┌────────────────────┐
             │      PIPELINE      │
             └─────────┬──────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   DISCOVERY       VERIFICATION    DATABASE
        │              │
        └───────┬──────┘
                ▼
        WEBSITE ANALYSIS
                │
                ▼
          LEAD SCORING
                │
                ▼
          OPTIONAL AI
                │
                ▼
          RANKED LEADS
                │
                ▼
        LOCAL SQLITE STORAGE
                │
                ▼
             EXPORT
```

---

# 68. Non-Negotiable Architectural Rules

1. The system must work without AI.
2. The system must not require paid services.
3. Large local models must not be required.
4. Heavy browser automation must be limited.
5. Processing must be memory-conscious.
6. Scores must be explainable.
7. Facts must be separated from AI inference.
8. External data sources must be modular.
9. Network requests must be rate-limited.
10. Failed individual prospects must not terminate a run.
11. Database results must be persistently saved during runs.
12. The system should remain usable on the Surface Pro 3.

---

# 69. Guiding Principle

K!D Lead Hunter should behave like a **small, patient research machine**.

It does not need to process the entire internet.

It needs to repeatedly produce a manageable number of **credible, explainable, high-opportunity prospects** for one person.

That is the architectural target.
