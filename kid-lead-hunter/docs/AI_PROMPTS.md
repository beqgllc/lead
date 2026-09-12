# K!D Lead Hunter — AI Prompts

## 1. Purpose

This document defines the actual prompt templates used by `src/ai/prompts/`, the constraints they must enforce, and the schemas they must satisfy. It is the concrete companion to `AI_PIPELINE.md`.

Every prompt file in `src/ai/prompts/` should trace back to a template documented here.

---

# 2. Shared Prompt Rules

All prompts sent to the AI layer must follow these rules, regardless of which specific prompt file is used:

```text
1. Output must be JSON only — no prose before or after, no markdown
   code fences.
2. The model must not be asked to browse, search, or "imagine"
   information not present in the provided input.
3. The model must be explicitly told which fields are facts
   (already observed) and must not restate them differently.
4. The model must be told to flag uncertainty rather than guess.
5. The model must avoid absolute claims about the business
   (e.g. "they will lose customers") — see SCORING.md §33.
```

A shared system preamble should be prepended to every prompt:

```text
You are analyzing structured, already-verified business and website
data for a personal lead-research tool. You are not browsing the web.
Use only the facts provided below. Do not invent numbers, dates, or
claims not present in the input. Respond with valid JSON only —
no explanation, no markdown formatting, no code fences.
```

---

# 3. qualify-business.ts

**Purpose:** produce a plain-language qualification summary for a lead that already has a deterministic score.

**Template:**

```text
{SHARED_PREAMBLE}

Business facts:
{business_json}

Website status: {website_status}
Website observations (if any): {observations_json}

Deterministic score: {score_total}/100 ({priority})
Score reasons:
{reasons_list}

Task: Based only on the facts above, write a short qualification
summary explaining why this business scored the way it did, in
plain language a non-technical person could read in 10 seconds.

Respond with JSON matching this shape:
{
  "summary": string,          // 1-3 sentences, grounded in the facts above
  "aiConfidence": number,     // 0-100, your confidence in this summary
  "caveats": string[]         // anything uncertain or unverifiable
}
```

**Schema:** `src/ai/schemas/business-analysis.ts`

---

# 4. analyze-website.ts

**Purpose:** interpret the structured website observations (not raw HTML) into a plain-language description of the website's condition.

**Template:**

```text
{SHARED_PREAMBLE}

Website status: {website_status}
Observations:
  Mobile:     {mobile_observations_json}
  SEO:        {seo_observations_json}
  Conversion: {conversion_observations_json}
  Technology: {technology_or_null}

Task: Describe, in plain language, the apparent condition of this
website based only on the observations above. Do not claim to have
visited the site. Do not state anything not implied by the
observations.

Respond with JSON matching this shape:
{
  "condition": string,           // e.g. "outdated and not mobile-friendly"
  "supportingObservations": string[],  // must each reference a field above
  "aiConfidence": number         // 0-100
}
```

**Schema:** `src/ai/schemas/website-analysis.ts`

---

# 5. analyze-opportunity.ts

**Purpose:** the primary interpretation prompt — produces the `AIAnalysisOutput` described in `AI_PIPELINE.md` §5.

**Template:**

```text
{SHARED_PREAMBLE}

Business:
{business_json}

Website:
  Status: {website_status}
  Observations: {observations_json}

Deterministic Score: {score_total}/100 ({priority})
Confidence: {score_confidence}%
Reasons:
{reasons_list}

Task: Using only the evidence above, explain the opportunity this
business may represent for web-development services. Identify likely
pain points ONLY if they are directly implied by the observations or
reasons above (e.g. "no contact form" implies a lead-capture pain
point — do not invent pain points unrelated to the evidence).
Suggest one recommended service type and one factual pitch angle.
Do not claim the business is losing money, losing customers, or
failing — only describe what is observed.

Respond with JSON matching this shape:
{
  "summary": string,
  "aiConfidence": number,
  "likelyPainPoints": string[],
  "recommendedService": string,
  "suggestedPitchAngle": string,
  "caveats": string[]
}
```

**Schema:** `src/ai/schemas/lead-analysis.ts`

This is the prompt referenced throughout `AI_PIPELINE.md` as the main analysis step.

---

# 6. generate-pitch.ts

**Purpose:** generate a short, factual outreach angle — explicitly NOT a full ready-to-send message. This project's MVP excludes automated outreach (`README.md`, "What the First Version Should NOT Do"), so this prompt produces raw material for the user to write their own message, not a final draft to send unedited.

**Template:**

```text
{SHARED_PREAMBLE}

Business: {business_name}, a {category} in {city}, {region}.

Observed opportunity:
{reasons_list}

Task: Write ONE short paragraph (3-4 sentences max) that a person
could use as a starting point for a personalized outreach message.
It must:
  - reference only the facts provided
  - avoid negative or presumptive language about the business
    ("no website found" is fine; "your business is falling behind"
    is not)
  - avoid making guarantees about results
  - end with an open, low-pressure question rather than a hard sell

Respond with JSON matching this shape:
{
  "draftParagraph": string,
  "aiConfidence": number
}
```

**Schema:** part of `src/ai/schemas/lead-analysis.ts` (pitch fields)

**Usage constraint:** The dashboard must present this output clearly labeled "AI-drafted starting point — review and personalize before sending," never as a one-click send action, consistent with `README.md`'s exclusion of "automated cold-email sending" from v1.

---

# 7. Validation and Retry

Every prompt response is validated against its Zod schema in `src/ai/schemas/`. On failure:

```text
Attempt 1 fails validation
        ↓
Append to prompt: "Your previous response was not valid JSON matching
the required schema. Respond again with ONLY valid JSON, no other text."
        ↓
Attempt 2
        ↓
Still fails → log AI_ERROR, return deterministic fallback (AI_PIPELINE.md §9)
```

Never attempt more than two total tries per lead — this keeps per-lead AI latency bounded on limited hardware.

---

# 8. Prohibited Prompt Patterns

Do not write a prompt that:

```text
- asks the model to search the web or claims it has browsing ability
- asks the model to estimate revenue, employee count, or other
  financial specifics not in the input
- asks the model to guess at protected characteristics of owners/staff
- asks the model to produce a complete, ready-to-send outreach email
  without human review
- omits the instruction to output JSON only
```

---

# 9. Versioning Prompts

When a prompt template changes in a way that could affect output structure or tone, bump a `promptVersion` string stored alongside the `Analysis` record, similar to `score_version` in `SCORING.md` §26. This keeps historical AI outputs interpretable even after prompts evolve.

---

# 10. Summary

Every prompt in this system exists to interpret evidence that deterministic code already collected — never to originate new claims about a business. If a prompt template can't be traced back to a specific set of input fields, it doesn't belong in this pipeline.
