# K!D Lead Hunter — AI Pipeline

## 1. Purpose

This document describes how the optional AI layer (`src/ai/`) fits into the
processing pipeline, what it receives, what it returns, and how the system
behaves when AI is unavailable.

It implements the philosophy defined in `README.md` ("Code before AI") and
the layer boundaries defined in `ARCHITECTURE.md` (§23–26, §58–59).

Nothing in this document overrides `SCORING.md`. The deterministic score is
always calculated first and is never replaced by an AI output.

---

## 2. Position in the Pipeline

```text
DISCOVER
   ↓
NORMALIZE
   ↓
DEDUPLICATE
   ↓
VERIFY (website)
   ↓
ANALYZE (website audit)
   ↓
SCORE (deterministic, SCORING.md)
   ↓
┌─────────────────────────────┐
│ AI CANDIDATE FILTER          │
│ (top N leads by score only)  │
└──────────────┬───────────────┘
               ↓
        AI_ENABLED?
               │
        ┌──────┴──────┐
        │             │
       yes            no
        │             │
        ▼             ▼
  AI INTERPRETATION   SKIP
        │             │
        └──────┬──────┘
               ▼
             SAVE
               ↓
            DISPLAY
```

AI never runs before scoring, and it never runs on every discovered
business — only on the candidates that already cleared the deterministic
score threshold. This keeps AI usage bounded, cheap (in CPU/RAM terms), and
optional.

---

## 3. Candidate Filter

Before any AI call is made, `src/pipeline/analyze.ts` selects a bounded
subset of leads to send to AI.

Default rule (configurable in Settings):

```text
AI candidates per run:  10
Minimum score to qualify: 60 (MODERATE or higher)
```

Rationale:

- AI interpretation is most useful on leads that are *already* worth
  investigating — it explains and contextualizes, it doesn't discover.
- Bounding the candidate count keeps a run's total AI latency and memory
  footprint predictable on a 4 GB machine.
- A lead that never reaches the AI stage is not penalized; it simply has no
  `AI INTERPRETATION` section in its detail view.

---

## 4. Input Contract

The AI layer never receives raw HTML, raw search results, or unprocessed
web content. It receives only structured, already-normalized data that the
deterministic layers produced.

```ts
interface AIAnalysisInput {
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
    status: "NO_WEBSITE_FOUND" | "OFFICIAL_WEBSITE_FOUND" | "DIRECTORY_ONLY"
      | "SOCIAL_ONLY" | "POSSIBLE_WEBSITE" | "WEBSITE_UNCERTAIN";
    url?: string;
    observations?: {
      mobile: Record<string, boolean>;
      seo: Record<string, boolean>;
      conversion: Record<string, boolean>;
      technology?: string;
    };
  };
  score: {
    total: number;
    priority: "CRITICAL" | "HIGH" | "GOOD" | "MODERATE" | "LOW" | "IGNORE";
    confidence: number;
    components: Record<string, number>;
    reasons: string[];
  };
}
```

This mirrors `LeadScore` in `SCORING.md` §34 and the "structured website
observations" described in `ARCHITECTURE.md` §23.

Rules:

- No full page HTML is ever forwarded to a model.
- No personal (non-business) information is included.
- The AI must be given the deterministic score and reasons *before* it
  produces an interpretation, so it is contextualizing evidence rather than
  re-deriving a competing score.

---

## 5. Output Contract

```ts
interface AIAnalysisOutput {
  aiConfidence: number;          // 0–100, the model's own confidence
  summary: string;               // 1–3 sentence plain-language explanation
  likelyPainPoints: string[];    // grounded in the input evidence only
  recommendedService: string;    // e.g. "new responsive website", "landing page + booking"
  suggestedPitchAngle: string;   // short, factual framing for outreach
  caveats: string[];             // anything uncertain or unverified
  model: string;                 // model identifier used
  generatedAt: string;           // ISO timestamp
}
```

Stored as an `Analysis` record (`ARCHITECTURE.md` §32) linked to the lead,
never merged into the `Lead` row itself. This keeps deterministic and AI
data physically separate, satisfying the "facts vs. inference" separation
in `ARCHITECTURE.md` §45.

---

## 6. Provider Abstraction

```ts
interface AIProvider {
  analyzeBusiness(input: BusinessAnalysisInput): Promise<BusinessAnalysis>;
  analyzeWebsite(input: WebsiteAnalysisInput): Promise<WebsiteAnalysis>;
  generatePitch(input: PitchInput): Promise<string>;
}
```

`src/ai/router.ts` selects a provider at runtime:

```text
AI_ENABLED=false
      → NullProvider (no-op, returns undefined, pipeline skips AI stage)

AI_ENABLED=true, Ollama reachable, model loaded
      → OllamaProvider (src/ai/ollama.ts)

AI_ENABLED=true, Ollama unreachable or model missing
      → falls back to deterministic-only, logs AI_ERROR, continues run
```

No other module imports `ollama.ts` or any concrete provider directly.
Everything goes through `AIProvider`, so a future cloud provider can be
added without touching the pipeline.

---

## 7. Health Check

Before a run attempts any AI call, `src/ai/health.ts` performs a cheap
pre-flight check:

```text
1. Is AI_ENABLED=true in configuration?
2. Is the Ollama HTTP endpoint reachable? (short timeout, ~1s)
3. Is the configured model present in `ollama list`?
4. Optional: does a 1-token test completion succeed?
```

If any step fails, the router logs a single `INFO`-level line
(`AI unavailable — continuing deterministic-only`) and the pipeline
proceeds without AI. The health check itself must never block or slow down
a run by more than the timeout above.

---

## 8. Model Expectations

Per `ARCHITECTURE.md` §25, the system must not require a large model.

```text
Recommended:  a small quantized instruction model (≈1–4B parameters)
Not required: 27B / 32B / 70B class models
Not assumed:  GPU acceleration
```

The AI layer must degrade gracefully if the configured model is slow —
a per-call timeout (default 30s) is enforced by `src/ai/client.ts`. A
timeout is treated the same as "AI unavailable" for that lead: the run
continues, and the lead is saved without an AI interpretation.

---

## 9. Structured Output Handling

Because small local models are unreliable at producing perfect JSON, every
AI call:

1. Instructs the model to return **only** JSON, no prose, no markdown
   fences (see `AI_PROMPTS.md`).
2. Validates the response against the corresponding Zod schema in
   `src/ai/schemas/`.
3. On validation failure, retries once with a stricter reminder appended.
4. On a second failure, discards the output, logs `AI_ERROR`, and falls
   back to a deterministic-only analysis record:

```ts
{
  summary: "No AI interpretation available (model output invalid).",
  aiConfidence: 0,
  likelyPainPoints: [],
  recommendedService: "",
  suggestedPitchAngle: "",
  caveats: ["AI output could not be parsed."],
  model: "none",
  generatedAt: new Date().toISOString(),
}
```

This guarantees the pipeline never crashes on malformed model output and
that a missing AI interpretation is always visually distinguishable from a
real one.

---

## 10. Factual Constraints on AI Output

The AI must not invent business facts (`ARCHITECTURE.md` §24). Concretely:

- The AI may not state a specific number (reviews, rating, years in
  business) that is not present in the input.
- The AI may not claim to have visited the website itself; if it discusses
  website quality, it must ground that discussion in the `observations`
  object it was given.
- The AI may not make claims like "they are losing customers" —
  see the ethical rules in `SCORING.md` §33. Phrasing is enforced through
  the prompt templates in `AI_PROMPTS.md` and spot-checked by validating
  that `likelyPainPoints` entries reference fields present in the input.

---

## 11. Never Overriding the Score

The AI layer has no code path that can write to `lead.score`,
`lead.priority`, or `lead.confidence`. Those fields are owned exclusively
by `src/scoring/`. AI output is stored only in the `Analysis` table, per
`SCORING.md` §28 (AI Override Policy).

---

## 12. Failure Isolation

A failure in the AI layer (timeout, malformed output, unreachable Ollama
process, out-of-memory) must never:

- crash the run,
- prevent the lead from being saved,
- block subsequent leads in the same batch from being processed.

Each AI call is wrapped:

```ts
try {
  return await ai.analyzeBusiness(input);
} catch (err) {
  logger.warn("AI_ERROR", { leadId, err });
  return buildDeterministicFallback(input);
}
```

This matches `ARCHITECTURE.md` §59.

---

## 13. Batch Behavior

AI calls are made sequentially, not concurrently, consistent with the
single-worker default in `ARCHITECTURE.md` §37. Running multiple local
model inferences in parallel on a 4 GB machine risks starving the rest of
the pipeline (and the OS) of memory.

```text
for each AI candidate (max 10 per run):
    run health check (cached for the run)
    call provider with timeout
    validate output
    save Analysis record
    continue to next candidate regardless of outcome
```

---

## 14. Future Extensions

Not part of the current pipeline, but compatible with this abstraction:

- Batched prompts (one call analyzing several leads) if a larger context
  window becomes available.
- A second `AIProvider` implementation for an optional cloud model, kept
  strictly opt-in and disabled by default (`ZERO_COST.md`).
- Caching AI interpretations by a hash of the input, so re-running a search
  does not re-spend AI time on unchanged leads.
