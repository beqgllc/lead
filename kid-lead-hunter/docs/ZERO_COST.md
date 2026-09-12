# K!D Lead Hunter — Zero-Cost Policy

## 1. Purpose

This document defines what "$0 budget" means in practice, how it is enforced, and what to do when a tempting-but-paid option appears.

It exists so that budget discipline does not rely on memory or good intentions. It should be checkable.

---

# 2. The Rule

> **No feature may silently introduce a paid dependency.**

Every dependency, API, or service added to the project must satisfy at least one of:

```text
1. It is free to use for this project's actual usage volume, indefinitely.
2. It is free up to a quota, and the application degrades gracefully
   (not silently fails, not silently bills) when the quota is exceeded.
3. It is optional, disabled by default, and clearly labeled as
   requiring the user to opt in and provide their own paid credentials.
```

If none of these apply, the dependency is not added.

---

# 3. What Counts as "Cost"

Cost is not only money charged directly. Watch for:

```text
- subscription fees
- per-request or per-token billing
- paid tiers required to unlock needed functionality
- credit card requirement even if a free tier exists
- storage limits that force an eventual paid upgrade
- rate limits so low the tool is unusable without paying
- "free trial" that converts to billing automatically
```

A service that requires a credit card on file is treated as a paid service, even if the free tier is currently sufficient, unless the user explicitly accepts that risk.

---

# 4. Approved Categories of Free Resources

## Software

```text
Node.js
TypeScript
Next.js
SQLite
Drizzle ORM
Cheerio
Playwright (open source)
```

## Data sources

```text
OpenStreetMap / Overpass API (free, rate-limited, attribution required)
Foursquare (free tier, subject to their current terms)
Public web search results accessed in a permitted manner
User-supplied CSV/business lists
```

## AI

```text
Ollama (local, free)
Small local quantized models (free, hardware-permitting)
```

## Infrastructure

```text
Local Windows machine (Surface Pro 3)
Local SQLite file
Windows Task Scheduler
GitHub private repository (free tier)
```

None of these require billing information to use in the way this project uses them.

---

# 5. Explicitly Disallowed by Default

```text
- Paid geocoding APIs (Google Maps Platform, Mapbox paid tiers)
- Paid business-data providers (Yelp Fusion beyond free quota, etc.)
- Cloud LLM APIs billed per token (OpenAI, Anthropic, etc.) as a
  required dependency
- Paid proxy/rotation services
- Paid hosting (Vercel Pro, AWS, etc.)
- Paid CAPTCHA-solving services
- Any managed database service with a monthly fee
```

These may be *discussed* as future optional integrations, but must never be wired in as a required code path. If a user wants to enable one of these personally, it must be:

```text
- off by default
- require the user's own API key in .env
- clearly documented as "this will cost money if enabled"
```

---

# 6. Enforcement Checklist

Before adding any new dependency or integration, confirm:

```text
□ Does it require a credit card to sign up?
□ Does its free tier cover expected usage (50 businesses/run,
  a handful of runs per week)?
□ What happens automatically when the free tier is exceeded —
  does it fail loudly, or silently start charging?
□ Is there a lower-effort free/local alternative?
□ Is this dependency isolated behind an interface so it can be
  swapped out later without a rewrite?
```

If any answer is concerning, do not add the dependency without an explicit decision documented here.

---

# 7. Quota Awareness

Free tiers are not infinite. The application should track usage against known free-tier limits where practical, and slow down or stop before crossing them.

Example pattern:

```ts
if (source.requestsThisMonth >= source.freeQuota) {
  logger.warn(`${source.name} free quota reached, skipping for this run`);
  return [];
}
```

A quota being reached should never crash a run — it should simply mean that source contributes nothing further until the quota resets.

---

# 8. AI Cost Specifically

The AI layer must default to:

```text
AI_ENABLED=false
```

or, when enabled, must default to a local provider (Ollama) rather than a cloud provider.

If a user manually configures a paid cloud AI provider, that is their explicit choice, made through `.env`, never a default behavior of the application.

---

# 9. Reviewing the Policy

This document should be revisited whenever:

- a new data source is proposed
- a new AI provider is proposed
- hosting requirements change
- the project's scope grows beyond personal use

Any change that would introduce a required paid dependency must be a deliberate, documented decision — not something that happens by accident through a library's default configuration.

---

# 10. Summary

K!D Lead Hunter is free to build, free to run, and free to maintain. If a future idea cannot be done for $0, the correct response is not to compromise the budget — it is to mark the idea as a future optional enhancement and move on.
