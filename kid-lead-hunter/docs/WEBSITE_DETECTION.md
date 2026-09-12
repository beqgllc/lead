# K!D Lead Hunter — Website Detection

## 1. Purpose

This document specifies, in implementation-level detail, how the system decides whether a business has an independent official website, and what state that determination should be stored as. It expands on `ARCHITECTURE.md` §13–18.

The guiding rule:

> A missing website field does not prove a business has no website.

---

# 2. Detection States

The detector must resolve every business into exactly one of these states:

```text
NO_WEBSITE_FOUND       No official site after reasonable searching
OFFICIAL_WEBSITE_FOUND A domain was found and matched to the business
                        with reasonable confidence
DIRECTORY_ONLY         Only third-party listings exist (Yelp, Google
                        Business Profile, etc.) — no owned domain
SOCIAL_ONLY            Only social profiles exist — no owned domain
POSSIBLE_WEBSITE        A candidate domain exists but match confidence
                        is not yet high enough to treat as confirmed
WEBSITE_UNCERTAIN       Conflicting or insufficient evidence
```

These states feed directly into `SCORING.md` §5 (Website Status Score) and into the confidence calculation in §15/§16 of `SCORING.md`.

---

# 3. Detection Pipeline

```text
Business candidate
       │
       ▼
Known website field present?
       │
   ┌───┴────┐
  yes        no
   │          │
   ▼          ▼
Verify      Domain discovery
domain       │
   │         ▼
   │    Candidate domain(s) found?
   │         │
   │     ┌───┴────┐
   │    yes        no
   │     │          │
   │     ▼          ▼
   │  Verify    Mark DIRECTORY_ONLY,
   │  domain    SOCIAL_ONLY, or
   │            NO_WEBSITE_FOUND
   │     │      (based on what WAS found)
   └──┬──┘
      ▼
HTTP/DNS checks
      ▼
Page inspection
      ▼
Business identity matching
      ▼
Confidence score → final state
```

---

# 4. Step 1 — Known Website Field

If a discovery source (e.g., a Google Business Profile field, an OSM `website` tag) already provides a URL:

```text
1. Normalize the URL (strip tracking params, resolve to canonical form)
2. Proceed directly to HTTP/DNS verification (§6 below)
3. Skip domain discovery entirely
```

Do not blindly trust the field — it still must pass identity matching (§7) before being marked `OFFICIAL_WEBSITE_FOUND`. A stale or wrong field is common enough to check.

---

# 5. Step 2 — Domain Discovery (No Known Field)

When no website field exists, attempt to discover a candidate domain using, in order:

```text
1. Permitted web search for "<business name> <city> <state>"
2. Common domain-naming heuristics tested via DNS, e.g.:
     businessnamehere.com
     businessname-city.com
     businessnamecity.com
   (only as a last resort, and only tested — never assumed correct
   without identity matching)
3. Links found on social profiles (a Facebook Page's "website" field,
   an Instagram bio link)
```

Every candidate produced here is just that — a candidate. None are trusted until they pass §7.

If no candidate survives this step, and no directory/social presence at all was found, mark `NO_WEBSITE_FOUND` directly with lower confidence. If directory listings or social profiles exist but no owned domain, mark `DIRECTORY_ONLY` or `SOCIAL_ONLY` accordingly.

---

# 6. Step 3 — HTTP/DNS Verification

For every candidate domain, run deterministic checks (see `ARCHITECTURE.md` §16):

```text
DNS resolution         → resolves / does not resolve
HTTP status            → 2xx / 3xx / 4xx / 5xx / timeout
HTTPS availability     → yes / no
Redirect target        → where it ends up, if redirected
Response time          → ms
Content type           → text/html expected
```

Classify the result:

```text
ACTIVE            2xx response, reasonable content
REDIRECTED        3xx to a different domain — investigate the target
TIMEOUT           No response within the configured timeout
DNS_FAILURE       Domain does not resolve
SERVER_ERROR      5xx response
NOT_FOUND         404 on the root path
BLOCKED           403 or evidence of bot-blocking
UNKNOWN           Anything not cleanly classifiable
```

**Important:** a single `TIMEOUT` or `SERVER_ERROR` must not immediately be treated as "website is dead." Retry per `ARCHITECTURE.md` §39 (bounded retries with backoff) before concluding `website exists but is unreachable`.

---

# 7. Step 4 — Business Identity Matching

A resolving domain is not proof it belongs to the business. Compare the page content against the business record:

```text
Signal                  Weight (qualitative, not point-scoring)
──────────────────────  ─────────────────────────────────────
Business name in title   strong
Business name in body     strong
Phone number match        strong
Address/city match         medium
Category/service match     medium
Social profile cross-link  medium
Domain naming similarity   weak (supporting only)
```

No single weak signal should be sufficient to confirm a match. Require at least one strong signal plus one additional corroborating signal before marking `OFFICIAL_WEBSITE_FOUND` with high confidence.

Example (from `ARCHITECTURE.md` §15):

```text
Business:  Joe's Plumbing
Candidate: joesplumbingtampa.com

Name match:    ✓ (strong)
City match:    ✓ (medium)
Phone match:   ✓ (strong)
Service match: ✓ (medium)

Result: OFFICIAL_WEBSITE_FOUND, HIGH confidence
```

If signals conflict (e.g., name matches but phone number and address point to a different city entirely), mark `WEBSITE_UNCERTAIN` rather than guessing.

---

# 8. Step 5 — Confidence Scoring

Confidence in the *website status determination itself* (separate from the opportunity score) is computed per `SCORING.md` §16:

```text
Official website field says none          +30
Web search finds no official domain       +25
Social profiles have no official site     +15
Domain candidates tested and failed       +15
Business name/domain mismatch resolved    +10
Independent confirmation                   +5
```

This produces a 0–100 confidence value stored alongside the website status, not blended into it.

---

# 9. Handling Ambiguity

When evidence is genuinely mixed, prefer the more conservative (lower-certainty) classification:

```text
Instead of forcing:  NO_WEBSITE_FOUND
Prefer:              WEBSITE_UNCERTAIN or POSSIBLE_WEBSITE
```

An incorrectly confident "no website" is worse than an honestly uncertain result, because the former leads to a wasted or embarrassing outreach attempt ("you don't have a website" to a business that does).

---

# 10. Re-Verification

Website status is not permanent. Re-check per `ARCHITECTURE.md` §25 triggers:

```text
- scheduled recheck interval (e.g. every 30–90 days for active leads)
- manual re-verify action from the dashboard
- before final outreach (always re-verify a CRITICAL/HIGH lead
  immediately before contacting, per SCORING.md §32)
```

Store `first_seen` and `last_checked` on the website record so staleness is visible.

---

# 11. What This Document Does Not Cover

Website *quality* analysis (mobile, SEO, conversion, technology) is a separate concern handled by `src/analyzer/` and described in `ARCHITECTURE.md` §19–21. This document only covers the yes/no/uncertain question of whether an official website exists and was correctly identified.

---

# 12. Test Fixtures

Per `ARCHITECTURE.md` §61, maintain fixtures that exercise each detection state:

```text
tests/fixtures/
├── no-website/           → NO_WEBSITE_FOUND
├── social-only/          → SOCIAL_ONLY
├── directory-only/       → DIRECTORY_ONLY
├── ambiguous-domain/     → WEBSITE_UNCERTAIN / POSSIBLE_WEBSITE
├── modern-site/          → OFFICIAL_WEBSITE_FOUND (high confidence)
└── broken-site/          → OFFICIAL_WEBSITE_FOUND, but unreachable
                             at verification time
```

These fixtures let detection logic be tested without hitting the live web on every test run.
