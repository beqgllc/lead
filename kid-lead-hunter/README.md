# K!D Lead Hunter

> A private, local-first lead intelligence engine for discovering businesses that may need a professional website or significant improvement to their existing web presence.

## Project Status

**Concept / architecture defined — implementation ready**

K!D Lead Hunter is a personal-use application. It is not intended to be a SaaS product, a public API, or a commercial lead-data platform.

The project is deliberately designed around a **strict $0 budget** and modest hardware:

- **Computer:** Microsoft Surface Pro 3
- **CPU:** Intel Core i3-4020Y @ 1.50 GHz
- **CPU:** 2 physical cores / 4 logical processors
- **RAM:** 4 GB
- **Operating system:** Windows
- **Budget:** $0 upfront and $0 recurring application cost

Because of the hardware and budget constraints, the system prioritizes deterministic code, lightweight processing, local storage, and selective AI use rather than large cloud models or large local language models.

---

## Purpose

The goal is not simply to find businesses with an empty website field.

The goal is to identify **businesses with evidence of a digital/web-development opportunity**.

Examples include:

- Businesses with no independent website
- Businesses with a broken or offline website
- Businesses with an extremely outdated website
- Businesses with poor mobile usability
- Businesses with weak technical SEO
- Businesses with poor conversion infrastructure
- Businesses with no obvious contact or quote mechanism
- Businesses with strong customer/review activity but weak web presence
- Businesses whose competitors have substantially better websites

The system should ultimately answer:

> **“Which businesses around me are most likely to benefit from a professional website or web improvement?”**

---

## Core Philosophy

### 1. $0 comes first

No required:

- paid AI subscriptions
- paid AI APIs
- paid hosting
- paid databases
- paid lead databases
- paid CRM software
- paid automation platforms
- paid cloud servers

Free/open-source resources may be used where their current terms permit the intended use.

### 2. Code before AI

Do not use AI to perform tasks that ordinary software can perform reliably.

Examples:

- DNS checks → code
- HTTP checks → code
- redirects → code
- duplicate detection → code
- HTML parsing → code
- metadata extraction → code
- basic SEO checks → code
- scoring calculations → code

Use AI only when interpretation or judgment is useful.

### 3. Local first

The application should run on the Surface itself whenever practical.

The initial system should not require a constantly running cloud server.

### 4. AI is optional

The lead pipeline must continue functioning even when no local AI model is installed or available.

The AI layer is an enhancement, not a single point of failure.

### 5. Quality over volume

This is a personal prospecting tool, not a mass-data platform.

A smaller number of highly relevant prospects is more valuable than thousands of questionable records.

---

## Architecture

```text
                         K!D LEAD HUNTER
                                │
                                ▼
                     ┌─────────────────────┐
                     │  BUSINESS DISCOVERY │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ NORMALIZATION /     │
                     │ DEDUPLICATION       │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  WEB DISCOVERY      │
                     │  / DOMAIN FINDER    │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ WEBSITE VERIFICATION│
                     │ DNS / HTTP / HTTPS  │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │   WEBSITE AUDITOR   │
                     │ HTML / SEO / MOBILE │
                     │ PERFORMANCE / CTA   │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  RULE-BASED SCORE   │
                     └──────────┬──────────┘
                                │
                         Score / confidence
                                │
                                ▼
                     ┌─────────────────────┐
                     │ OPTIONAL LOCAL AI   │
                     │  QUALIFICATION      │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │     SQLITE DB       │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  LOCAL DASHBOARD    │
                     └─────────────────────┘
```

---

## Recommended Technology Stack

| Layer | Technology | Cost | Purpose |
|---|---|---:|---|
| Operating system | Windows | $0 | Runtime environment |
| Language | TypeScript | $0 | Main application language |
| Framework | Next.js | $0 | Local dashboard + API |
| Runtime | Node.js | $0 | Server/application runtime |
| Database | SQLite | $0 | Local lead storage |
| ORM | Drizzle ORM | $0 | Database access |
| HTML parsing | Cheerio | $0 | Lightweight website analysis |
| Browser automation | Playwright | $0 | Only when browser rendering is actually necessary |
| Web auditing | Lighthouse / custom checks | $0 | Website quality analysis |
| AI runtime | Optional Ollama | $0 | Local model execution |
| AI model | Small quantized local model | $0 | Selective lead interpretation |
| Scheduler | Windows Task Scheduler / node-cron | $0 | Automated runs |
| Source control | Git | $0 | Version control |
| Repository | GitHub | $0 | Private source-code storage |

> **Important:** “$0” means no planned purchase or required subscription. Individual external data providers can have their own quotas, terms, or billing requirements. The application must respect the terms of every source it uses.

---

## Hardware Strategy

The Surface Pro 3 has only **4 GB of RAM** and a low-power dual-core processor. Large local language models are therefore not appropriate as a core dependency.

The application is specifically designed to minimize CPU and memory usage.

### Do

- Prefer HTTP requests over full browser rendering
- Parse HTML with Cheerio
- Use Playwright only when needed
- Process businesses in batches
- Limit concurrency
- Cache results
- Avoid duplicate requests
- Use deterministic scoring before AI
- Analyze only high-value candidates with AI
- Keep the dashboard lightweight

### Do not

- Run a 20B+ model locally
- Run dozens of browser instances simultaneously
- Render every website with a headless browser
- Screenshot every website
- Send every discovered business through an AI model
- Keep unnecessary services running continuously

---

## AI Strategy

AI is deliberately placed near the end of the pipeline.

### AI should NOT handle

```text
Does the domain resolve?
Does the server respond?
Is HTTPS active?
Does the page have a title?
Is there a viewport meta tag?
How many links exist?
Is a contact form present?
Is the page extremely slow?
```

These can be handled by deterministic code.

### AI SHOULD handle

```text
Is this probably the official website of the business?
Is this business a strong prospect?
What appears to be its biggest web opportunity?
What evidence supports the opportunity?
What type of website/service would be appropriate?
How should the lead be prioritized?
```

### AI fallback behavior

If no local model is available:

```text
Discovery
   ↓
Verification
   ↓
Website Audit
   ↓
Rule-Based Score
   ↓
Save Lead
```

With local AI available:

```text
Discovery
   ↓
Verification
   ↓
Website Audit
   ↓
Rule-Based Score
   ↓
Top Candidates Only
   ↓
Local AI Analysis
   ↓
Final Lead Score / Explanation
   ↓
Save Lead
```

---

## Lead Categories

### Tier 1 — Critical Opportunity

Strong evidence that the business lacks an adequate independent web presence.

Examples:

- No website found
- Domain is dead
- Website is offline
- Domain clearly does not belong to the business

### Tier 2 — Major Opportunity

Website exists but is seriously deficient.

Examples:

- severe mobile problems
- extremely slow performance
- broken pages
- poor technical SEO
- obvious outdated implementation
- major conversion problems

### Tier 3 — Moderate Opportunity

Website works but leaves meaningful opportunities on the table.

Examples:

- weak calls to action
- poor service presentation
- no online quote workflow
- no booking capability where appropriate
- poor local SEO structure
- outdated UX

### Tier 4 — Watchlist

Potential opportunity exists, but evidence is insufficient for a high-confidence recommendation.

---

## Lead Scoring

The scoring system should begin as a deterministic rules engine.

Example signals:

| Signal | Example Weight |
|---|---:|
| No website | +40 |
| Website offline | +30 |
| Domain does not resolve | +30 |
| Poor mobile experience | +15 |
| Poor performance | +15 |
| Weak technical SEO | +10 |
| Missing CTA | +8 |
| Missing contact/quote mechanism | +8 |
| Active social presence | +10 |
| Strong review volume | +10 |
| High customer rating | +10 |
| Established-looking business | +10 |
| High-value service category | +10 |
| Modern professional site | -25 |
| Strong website | -30 |

The initial weights are **starting points**, not fixed truths. They should be tuned using real results from your own prospecting.

The final lead record should preserve both:

- the numerical score
- the evidence that produced the score

This makes the system explainable instead of producing a mysterious number.

---

## Website Verification Philosophy

A missing website field does **not** prove that a business has no website.

The verification process should consider multiple signals.

```text
Candidate business
       ↓
Known website field?
       │
       ├── Yes → verify domain ownership/relevance
       │
       └── No  → search for possible official domain
                    ↓
               domain discovered?
                    │
              ┌─────┴─────┐
              │           │
             Yes          No
              │           │
              ▼           ▼
       verify website   strong candidate
              │
              ▼
       analyze quality
```

A business should not be classified as “no website” merely because a single source does not list one.

The database should distinguish between:

- `no_website_confirmed`
- `no_website_probable`
- `website_found`
- `website_uncertain`
- `website_offline`
- `website_outdated`
- `website_poor_quality`

---

## Data Acquisition

The project must use data sources in ways permitted by their current terms.

Potential source categories include:

- Open geographic/business datasets
- Legitimate public APIs with free allowances
- Public web discovery where appropriate
- User-supplied business lists
- Existing CSV files

Do **not** design the project around indiscriminate scraping of protected services.

Every source adapter should be isolated behind a common interface so the source can be replaced without rewriting the rest of the application.

Example:

```ts
interface BusinessSource {
  search(input: SearchRequest): Promise<BusinessRecord[]>;
}
```

This keeps the discovery engine independent from any single provider.

---

## Processing Pipeline

A complete search should follow this sequence:

```text
1. Receive search criteria
2. Discover businesses
3. Normalize names, phones, domains, and addresses
4. Deduplicate businesses
5. Attempt official website discovery
6. Verify candidate domains
7. Analyze confirmed websites
8. Calculate deterministic opportunity score
9. Filter out low-value records
10. Optionally send finalists to local AI
11. Store evidence and scores in SQLite
12. Present results in dashboard
13. Export selected leads if needed
```

---

## Search Inputs

The first interface should support simple criteria such as:

```text
Industry:     Roofing
Location:     Tampa, FL
Radius:       25 miles
Min Rating:   4.0
Min Reviews:  20
Limit:        50
```

Potential later filters:

- Business category
- City
- ZIP code
- Radius
- Minimum rating
- Minimum review count
- Website required / prohibited
- Social presence
- Lead score threshold
- Website quality threshold
- Opportunity tier

---

## Dashboard

The dashboard should remain lightweight and practical.

### Home

Show:

- total leads
- new leads
- top opportunities
- latest searches
- recent pipeline runs

### Search

Allow the user to specify:

- industry
- location
- radius
- filters
- result limit

### Leads

Display:

```text
Lead Score
Business
Industry
Location
Website Status
Rating
Reviews
Phone
Social Presence
Opportunity Tier
```

### Lead Detail

Show:

- Business information
- Website status
- Domain verification results
- Website audit
- Lead score
- Evidence
- AI reasoning, when available
- Recommended service opportunity
- Notes
- Lead status

### Runs

Show the history of automated searches and processing jobs.

---

## Database

SQLite is the initial database because it is:

- free
- local
- lightweight
- reliable
- simple to back up
- appropriate for a single-user application

### Core tables

```text
businesses
websites
contacts
analyses
leads
searches
runs
```

### Business record

Should store information such as:

```text
id
name
category
address
city
region
postal_code
phone
email
social_links
source
source_id
created_at
updated_at
```

### Website record

Should store:

```text
business_id
domain
url
status
http_status
https
dns_valid
redirect_target
title
description
last_checked
```

### Analysis record

Should store:

```text
business_id
mobile_score
performance_score
seo_score
accessibility_score
conversion_score
technology_score
issues_json
analyzed_at
```

### Lead record

Should store:

```text
business_id
score
tier
confidence
reasoning
evidence_json
recommended_service
status
notes
created_at
updated_at
```

---

## Caching

Caching is essential on low-power hardware.

The application should cache:

- DNS results
- HTTP results
- website analysis
- discovered domains
- source responses where allowed
- normalized business data

The goal is to avoid repeatedly performing the same work.

Every cached item should have a timestamp and expiration policy appropriate to the data type.

---

## Resource Limits

The initial application should intentionally operate under conservative limits.

Example defaults:

```text
Concurrent HTTP requests:     4
Concurrent browser pages:     1
Businesses per run:           50
AI candidates per run:        10
Request timeout:              10–15 sec
Browser timeout:              20–30 sec
Retries:                      1–2
```

These are starting defaults and should be adjusted based on actual performance.

---

## Browser Usage

Playwright should be treated as an expensive fallback.

Use:

```text
HTTP → HTML → parse → score
```

before:

```text
Playwright → render JavaScript → inspect page
```

A browser should be launched only when the information cannot be reliably obtained through lightweight HTTP/HTML methods.

This is especially important on a 4 GB Surface Pro 3.

---

## Automation

The long-term goal is to let the application perform scheduled discovery.

Example:

```text
07:00
  ↓
Run saved search
  ↓
Discover businesses
  ↓
Deduplicate
  ↓
Verify web presence
  ↓
Analyze candidates
  ↓
Score leads
  ↓
Save results
  ↓
Dashboard shows new prospects
```

The first release should allow manual execution before scheduled automation is enabled.

---

## Privacy

This application is intended to be private and personal-use only.

Principles:

- Store data locally by default
- Do not collect unnecessary personal information
- Do not expose the dashboard publicly
- Keep API keys out of source control
- Use `.env` for optional credentials
- Do not store sensitive credentials in the database
- Keep logs free of secrets

---

## Security

Even though this is a local application, basic security practices still apply.

Never commit:

```text
.env
API keys
OAuth tokens
credentials
private certificates
```

Use:

```text
.env.example
```

for documented configuration names.

The local dashboard should bind to localhost by default rather than exposing itself to the entire network.

---

## Project Structure

```text
kid-lead-hunter/
│
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── data/
│   ├── database.sqlite
│   ├── cache/
│   ├── screenshots/
│   └── exports/
│
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── leads/
│   │   ├── businesses/
│   │   ├── opportunities/
│   │   ├── runs/
│   │   └── settings/
│   │
│   ├── api/
│   │   ├── discover/
│   │   ├── leads/
│   │   ├── audit/
│   │   ├── runs/
│   │   └── export/
│   │
│   ├── discovery/
│   │   ├── openstreetmap.ts
│   │   ├── web-search.ts
│   │   └── normalize.ts
│   │
│   ├── verification/
│   │   ├── website.ts
│   │   ├── dns.ts
│   │   ├── http.ts
│   │   └── redirects.ts
│   │
│   ├── analyzer/
│   │   ├── crawler.ts
│   │   ├── seo.ts
│   │   ├── mobile.ts
│   │   ├── performance.ts
│   │   ├── technology.ts
│   │   └── conversion.ts
│   │
│   ├── scoring/
│   │   ├── score.ts
│   │   ├── rules.ts
│   │   └── weights.ts
│   │
│   ├── ai/
│   │   ├── client.ts
│   │   ├── router.ts
│   │   ├── ollama.ts
│   │   ├── models.ts
│   │   └── prompts/
│   │
│   ├── database/
│   │   ├── schema.ts
│   │   └── database.ts
│   │
│   ├── pipeline/
│   │   ├── discover.ts
│   │   ├── verify.ts
│   │   ├── audit.ts
│   │   └── process.ts
│   │
│   └── utils/
│       ├── logger.ts
│       ├── retry.ts
│       └── limiter.ts
│
├── scripts/
│   ├── setup.ts
│   ├── test.ts
│   └── run.ts
│
└── docs/
    ├── ARCHITECTURE.md
    ├── SCORING.md
    ├── DATA-SOURCES.md
    └── ZERO-COST.md
```

---

## Development Principles

### Keep dependencies minimal

Every new dependency consumes disk space, memory, maintenance effort, and sometimes CPU.

Prefer the Node standard library when it is sufficient.

### Keep processes short-lived

Do not leave unnecessary browser or AI processes running.

### Fail gracefully

A failed source, website, or AI model should not terminate the entire run.

### Preserve evidence

A lead score should be explainable from stored evidence.

### Make every external integration replaceable

Source adapters and AI providers should never be deeply coupled to the rest of the application.

---

## What the First Version Should NOT Do

Do not build these into v1:

- automated cold-email sending
- autonomous follow-up
- paid CRM integrations
- public user accounts
- billing
- multi-user support
- large-scale scraping infrastructure
- large local language models
- complex cloud architecture
- automatic purchasing of API credits

The first version exists to answer one question:

> **Can the system reliably find high-quality businesses that represent real website-development opportunities?**

Everything else comes later.

---

## MVP Definition

Version 1 is successful when the following workflow works end-to-end:

```text
Enter:
  “Roofers in Tampa, FL”

        ↓

Discover businesses

        ↓

Identify possible websites

        ↓

Verify website status

        ↓

Audit websites

        ↓

Calculate opportunity scores

        ↓

Display strongest prospects

        ↓

Open individual lead

        ↓

See evidence explaining the score

        ↓

Save / ignore / export lead
```

The application should work **without AI** before local AI qualification is added.

---

## Future Enhancements

Possible later additions include:

- Local LLM qualification
- AI-generated prospect summaries
- AI-generated outreach drafts
- competitor analysis
- industry-specific scoring rules
- domain-history signals
- technology-stack detection
- social activity analysis
- local SEO opportunity analysis
- contact discovery where appropriate and lawful
- lead notes and status tracking
- CSV import/export
- automatic recurring searches
- Windows notifications
- lead-history tracking

These are deliberately outside the MVP.

---

## Zero-Dollar Rule

This project must always preserve the following constraint:

> **No feature may silently introduce a paid dependency.**

If an implementation requires money, the feature must either:

1. be replaced with a free/local alternative, or
2. remain optional and disabled by default.

No automatic billing, credit purchases, or paid-service escalation should ever be implemented.

---

## Legal and Responsible Use

The application must respect the terms, robots policies, rate limits, licensing requirements, and applicable laws governing every external data source it uses.

The system should not:

- bypass authentication
- bypass technical access controls
- evade rate limits
- defeat CAPTCHAs
- harvest restricted/private information
- impersonate users
- send unsolicited communications automatically without appropriate safeguards

Publicly available information is not automatically free from all legal or contractual restrictions. Source-specific rules must be evaluated before adding an integration.

---

## Operating Philosophy

K!D Lead Hunter is not meant to be a giant autonomous scraper.

It is a **small, explainable, local intelligence system** whose job is to reduce hours of manual prospect research to a shortlist of businesses worth investigating.

The ideal result is not:

> “I found 10,000 businesses.”

The ideal result is:

> “I researched 500 businesses automatically and found 18 that are genuinely worth my attention.”

That is the standard the project should be built around.

---

## License

License choice to be finalized before public distribution.

For private personal use, the repository can remain private.
