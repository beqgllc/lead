# K!D Lead Hunter — Privacy Policy (Internal)

## 1. Purpose

This document describes what data K!D Lead Hunter collects, why, where it lives, and how it is protected. Because this is a personal-use, local-first application, this is an internal design policy rather than a public legal document — but it is written as if it might one day need to become one.

---

# 2. Scope

This policy covers:

```text
- business data discovered and stored by the application
- website content fetched during analysis
- AI-generated content
- logs
- exports
- any credentials or configuration
```

It does not cover data on third-party platforms (Google, Facebook, Yelp, etc.) — the application only observes what those platforms already make public.

---

# 3. Data Minimization Principle

The application collects **only what is needed to evaluate a business as a lead**.

Collected by default:

```text
- business name
- category / industry
- public address / city / state / postal code
- public phone number
- public business email (if published)
- public website URL and domain
- public social profile URLs
- star rating and review count (aggregate numbers only)
- structural website observations (title, meta tags, viewport,
  presence of forms/CTAs, technology fingerprints)
```

Not collected by default:

```text
- names of individual employees or owners, unless they are the
  business's published point of contact
- personal social media accounts unrelated to the business page
- customer review text/content beyond aggregate rating/count
- any data behind a login wall
- any data explicitly marked private by its source
```

---

# 4. No Sensitive Personal Data

The system must not be used to collect, infer, or store:

```text
- race, ethnicity, religion
- health information
- sexual orientation or gender identity
- immigration status
- financial account details of individuals
- government ID numbers
```

None of this is relevant to evaluating a business's website-development opportunity, and none of it should ever appear in the schema, in scraped content, or in AI prompts.

---

# 5. Where Data Lives

```text
data/database.sqlite     → all persistent lead/business/website data
data/cache/               → temporary cached HTTP/DNS/analysis results
data/exports/             → CSV/JSON/Markdown exports the user creates
data/screenshots/         → optional, only if the user enables it
```

All of this stays on the local machine (the Surface Pro 3) by default. There is no cloud sync, no remote database, and no telemetry sent to any third party.

---

# 6. Website Content Handling

When the application fetches a business's website for analysis:

```text
- the raw HTML is processed in memory
- only structured observations are extracted and stored
  (title present? viewport present? contact form present? etc.)
- full page HTML is not persisted by default
- screenshots are not taken unless explicitly enabled in settings
```

If a future feature needs to retain fuller page content (e.g., for debugging a scoring decision), it must:

```text
- be opt-in
- have a defined retention/expiration period
- be clearly labeled in the schema (e.g. debug_html, not treated
  as a permanent record)
```

---

# 7. AI and Privacy

When the optional AI layer is enabled:

```text
- AI receives only the already-structured, already-collected data
  (business facts, website observations, deterministic score)
- AI is not given raw, unfiltered web pages when avoidable
- AI-generated text (pitches, interpretations) is stored separately
  from observed facts, and clearly labeled as AI output
```

If a local model is used (Ollama), no data leaves the machine. If a user opts into a cloud AI provider, this is a deliberate configuration choice made by the user, and they should be aware that business data will be sent to that provider under that provider's own terms.

---

# 8. Logging

Logs should never contain:

```text
- full page contents
- API keys or tokens
- personally identifying information beyond what's already in the
  business record (e.g., don't log full request/response bodies
  from third-party APIs if they contain more than necessary)
```

Logs should contain enough to debug a run:

```text
timestamp, run id, business id, stage, short message
```

---

# 9. Exports

Exports (CSV/JSON/Markdown) are created explicitly by the user and are treated as the user's own output. They are stored under `data/exports/` and are excluded from version control via `.gitignore`.

The user is responsible for how exported files are subsequently stored, shared, or used — the application's responsibility ends at producing an accurate, evidence-based export.

---

# 10. Retention

```text
- Business/lead records persist until the user deletes them or
  marks a lead ARCHIVED and chooses to purge it.
- Cache entries expire automatically per their configured TTL.
- Backups (data/backups/) accumulate over time; the user should
  periodically prune old backups.
```

There is no automatic indefinite retention policy beyond "the user decides."

---

# 11. Access Controls

```text
- The local dashboard binds to localhost only, not 0.0.0.0, by
  default — it is not exposed to the local network or the internet.
- No user accounts or authentication system exists, because the
  application is single-user and local. If the dashboard is ever
  exposed beyond localhost, authentication must be added first.
```

---

# 12. Third-Party Terms

Every discovery source (OpenStreetMap, Foursquare, web search, etc.) has its own terms of service, rate limits, and attribution requirements. See `DATA_SOURCES.md` for source-specific rules. This privacy policy does not override those terms — it works alongside them.

---

# 13. Responsible Outreach

Contact information collected for a business is public, business-level information intended to support **manual, individual outreach** about a specific, evidence-based opportunity — not for bulk unsolicited messaging, resale, or aggregation into a marketing list beyond this project's personal use.

---

# 14. Summary

K!D Lead Hunter is designed to be respectful by default: collect only what's needed, keep it local, separate fact from AI inference, and never quietly expand into sensitive personal data or unrestricted data-sharing. If a new feature would violate any principle above, the principle wins and the feature is redesigned.
