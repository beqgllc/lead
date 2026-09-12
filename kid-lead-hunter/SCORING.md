# K!D Lead Hunter — Lead Scoring System

## 1. Purpose

K!D Lead Hunter uses a deterministic scoring system to rank businesses by their apparent **website-development opportunity**.

The score is not intended to predict revenue, purchasing power, or whether a business will become a client.

Instead, it answers:

> **"Based on observable evidence, how worthwhile is this business for me to investigate and potentially contact about web development?"**

The scoring system must remain:

- explainable
- deterministic
- adjustable
- reproducible
- conservative about unknown information
- usable without AI
- lightweight enough for a Surface Pro 3 with 4 GB RAM

AI may provide additional interpretation later, but AI must not be required to calculate the base score.

---

# 2. Core Principle

The system should reward **evidence of opportunity**, not simply the absence of a website.

A business with no website is interesting.

A business with:

- 250 reviews
- 4.8 stars
- active social media
- multiple services
- a broken or outdated website

may be even more interesting.

Therefore, the score combines:

```text
Business Strength
+
Digital Presence Weakness
+
Website Opportunity
+
Customer/Market Signals
-
Strong Existing Web Presence
=
Opportunity Score
```

---

# 3. Score Structure

The recommended score range is:

```text
0–100
```

The score is divided into six components:

```text
A. Website Status
B. Website Quality
C. Business Strength
D. Digital Presence
E. Opportunity Potential
F. Confidence
```

The final score should never exceed 100.

---

# 4. Priority Classification

| Score | Priority | Meaning |
|---:|---|---|
| 90–100 | CRITICAL | Exceptional prospect; investigate first |
| 80–89 | HIGH | Strong prospect |
| 70–79 | GOOD | Worth reviewing |
| 60–69 | MODERATE | Potential opportunity |
| 40–59 | LOW | Weak or uncertain opportunity |
| 0–39 | IGNORE | Usually not worth pursuing |

These ranges are starting defaults and should be adjusted after real-world use.

---

# 5. Website Status Score

The strongest signal is the condition of the business's independent website.

## No independent website

```text
+40
```

This requires reasonable confidence that no legitimate business website was found.

Examples:

- only Facebook exists
- only Instagram exists
- only Yelp/Google/directories exist
- business website field is absent
- domain discovery finds no credible official domain

Do not award this score merely because one source lacks a website field.

---

## Website exists but is unreachable

```text
+30
```

Examples:

- domain does not resolve
- persistent server failure
- dead domain
- repeated timeout
- major DNS failure

A temporary outage should not automatically receive the full score.

---

## Website exists but appears broken

```text
+25
```

Examples:

- major navigation failures
- missing resources
- broken layout
- unusable forms
- obvious fatal JavaScript/page errors
- important pages unavailable

---

## Website is extremely outdated

```text
+20
```

Possible indicators:

- obsolete layout
- fixed desktop-width presentation
- outdated markup
- broken responsive behavior
- old copyright/date signals when meaningful
- visibly obsolete technology
- significant usability problems

Age must never be inferred from a single superficial signal.

---

# 6. Website Quality Penalties

These values reduce the score or increase opportunity depending on context.

The initial implementation should treat them as **opportunity points** rather than arbitrary penalties.

## Mobile problems

```text
+15
```

Potential indicators:

- no viewport meta tag
- fixed-width layout
- horizontal overflow
- tiny/unusable controls
- obvious mobile layout failure

---

## Poor SEO foundation

```text
+15
```

Indicators may include:

- missing title
- missing meta description
- missing canonical where appropriate
- poor heading structure
- weak location/service relevance
- missing structured data where reasonably expected
- inaccessible important content

A missing SEO feature is not automatically proof of poor SEO. Score only observable deficiencies.

---

## Poor conversion experience

```text
+15
```

Examples:

- no clear call to action
- no obvious contact path
- no quote request
- no booking mechanism where one would reasonably be useful
- buried phone number
- difficult navigation to contact information

---

## No contact form

```text
+10
```

Only award where a contact form would reasonably benefit the business.

---

## No clear CTA

```text
+10
```

Examples:

```text
Request a Quote
Book Now
Call Now
Schedule Service
Get Started
```

Absence should be evaluated in context.

---

## No online booking

```text
+10
```

Only for industries where appointments/bookings are relevant.

Examples:

- salons
- barbers
- auto detailing
- cleaning
- personal services
- home services with scheduling

Do not penalize a restaurant or manufacturer simply because it lacks online booking.

---

# 7. Website Strength Deductions

Some websites should actively reduce the lead score.

## Modern professional website

```text
-25
```

Indicators:

- responsive
- fast
- clear navigation
- strong conversion flow
- current visual design
- useful service content
- strong contact experience

---

## Strong conversion experience

```text
-15
```

Examples:

- obvious CTA
- online quote
- booking
- lead form
- click-to-call
- service-specific landing pages

---

## Strong technical foundation

```text
-10
```

Potential signals:

- HTTPS
- fast performance
- responsive design
- good semantics
- valid metadata
- accessible structure

The application should avoid double-counting the same underlying issue.

---

# 8. Business Strength Signals

The purpose of these signals is to distinguish:

> "No website and barely operating"

from:

> "No website despite strong evidence of an established customer base."

## Rating

Suggested points:

```text
4.0–4.49 stars    +3
4.5–4.79 stars    +6
4.8–5.0 stars     +8
```

Do not score businesses with insufficient review data as if they had positive ratings.

---

## Review volume

Suggested points:

```text
10–24 reviews       +2
25–49 reviews       +4
50–99 reviews       +6
100–249 reviews     +8
250–499 reviews    +10
500+ reviews       +12
```

Cap the review component at 12.

Review volume is a signal of visibility and customer activity, not proof of financial success.

---

# 9. Social Presence

Social presence can indicate that the business actively participates in online customer acquisition.

Suggested scoring:

```text
One active social profile       +3
Two active profiles              +5
Three or more active profiles    +7
```

Activity matters.

An abandoned profile should not receive the same score as an active account.

Potential signals:

- recent posts
- recent business updates
- current contact information
- consistent branding
- customer engagement

---

# 10. Digital Presence Gap

This measures the difference between the strength of the business's public presence and the quality of its owned website.

Examples:

### Strong reputation + no website

```text
+10
```

### Strong social presence + weak website

```text
+7
```

### Multiple active channels + no independent website

```text
+8
```

This category is especially important because it identifies businesses that have already demonstrated willingness to operate online but have weak owned infrastructure.

---

# 11. Business Complexity / Opportunity Signals

Some businesses can benefit from substantially more web functionality.

Suggested points:

```text
Multiple services             +4
Large service area             +4
Multiple locations             +6
Booking/appointment business   +5
Quote-driven business          +5
High-ticket services           +5
E-commerce potential           +4
Strong local search demand     +4
```

These should be used conservatively.

A business should receive points only when evidence supports the condition.

---

# 12. Industry Relevance

Some business categories naturally have higher potential for website-development work.

Suggested baseline modifiers:

```text
High-value local services       +10
Appointment-based services       +8
Home services                    +8
Professional services            +7
Hospitality                      +6
Retail                            +5
Low-complexity microbusiness      +2
```

The exact classification should be configurable.

The industry modifier must never dominate the entire score.

---

# 13. High-Value Service Categories

Potential examples:

```text
Roofing
HVAC
Plumbing
Electrical
Remodeling
General contracting
Tree services
Landscaping
Pest control
Auto repair
Auto detailing
Towing
Moving
Cleaning
Legal services
Accounting
Real estate services
Private medical/dental services
Aesthetic services
Home improvement
```

This is a configurable list, not a fixed truth.

---

# 14. Negative Signals

Some conditions should reduce priority significantly.

## Clearly strong existing website

```text
-25
```

## Large corporate/franchise presence

```text
-10
```

Use cautiously. A local franchise may still have a local development need.

## Recently redesigned website

```text
-15
```

Only when there is credible evidence.

## No meaningful web activity

```text
-5
```

This can indicate that online acquisition is not a major priority for the business.

## Business appears inactive

```text
-20
```

Possible signals:

- permanently closed indicators
- obsolete contact information
- no recent activity
- repeated conflicting business records

Do not classify a business as inactive based on one stale signal.

---

# 15. Confidence Score

Opportunity score and confidence are separate.

A business might score 92/100 but have only 45% confidence that the website truly does not exist.

That should remain visible.

Recommended confidence range:

```text
0–100%
```

### High confidence

```text
90–100%
```

Multiple sources agree.

### Good confidence

```text
75–89%
```

Evidence is strong but not complete.

### Moderate confidence

```text
50–74%
```

Some uncertainty exists.

### Low confidence

```text
0–49%
```

The system should avoid treating this as a confirmed opportunity.

---

# 16. Confidence Calculation

Example:

```text
Official website field says none          +30
Web search finds no official domain      +25
Social profiles have no official site    +15
Domain candidates tested and failed      +15
Business name/domain mismatch resolved   +10
Independent confirmation                  +5
```

Maximum:

```text
100
```

This score should describe **confidence in the data**, not confidence that the business will buy.

---

# 17. Final Score Formula

The implementation may begin with:

```text
Raw Score =
  Website Opportunity
+ Website Quality Problems
+ Business Strength
+ Digital Presence
+ Business Complexity
+ Industry Relevance
- Website Strength
- Negative Signals
```

Then:

```text
Final Score = clamp(Raw Score, 0, 100)
```

Example pseudocode:

```ts
function calculateLeadScore(input: LeadSignals): number {
  const score =
    input.websiteOpportunity +
    input.websiteQuality +
    input.businessStrength +
    input.digitalPresence +
    input.businessComplexity +
    input.industryRelevance -
    input.websiteStrength -
    input.negativeSignals;

  return Math.max(0, Math.min(100, score));
}
```

---

# 18. Example: Excellent Lead

```text
Business:
Tampa Roofing Example

Website:
None detected

Rating:
4.9

Reviews:
187

Social:
Facebook + Instagram active

Services:
Multiple

Service area:
Large local area

Industry:
Roofing
```

Possible score:

```text
No website                         +40
Rating 4.8+                         +8
100+ reviews                        +8
Two active socials                  +5
Digital presence gap               +10
Multiple services                  +4
Large service area                  +4
High-value service                  +5
High-value industry               +10

--------------------------------------
RAW SCORE                          94
```

Final:

```text
94/100
CRITICAL
```

---

# 19. Example: Existing Poor Website

```text
Business:
Local Auto Detailer

Website:
Exists

Rating:
4.8

Reviews:
126

Social:
Instagram + Facebook

Website:
Slow
Poor mobile layout
No booking
No quote form
Weak CTA
```

Possible score:

```text
Poor mobile                       +15
Poor conversion                   +15
No booking                        +10
No contact form                   +10
Rating 4.8+                        +8
100+ reviews                       +8
Two active socials                 +5
Digital presence gap               +7
Appointment service                +5
High-value/local service           +8

Modern-site deductions              0
```

Result:

```text
83/100
HIGH
```

Even though the business technically has a website.

---

# 20. Example: Bad Lead

```text
Business:
Small Local Service

Website:
Modern

Rating:
4.9

Reviews:
310

Social:
Active

Website:
Responsive
Fast
Strong CTA
Booking
Quote form
Excellent SEO foundation
```

Possible result:

```text
Business strength                  +8
Reviews                            +10
Social presence                     +7
Industry relevance                  +5

Modern website                     -25
Strong conversion                  -15
Strong technical foundation        -10

--------------------------------------
LOW / MODERATE OPPORTUNITY
```

The high review count does not override a strong existing website.

---

# 21. Preventing Double Counting

The scoring engine must avoid rewarding or penalizing the same condition repeatedly.

For example:

```text
No viewport
Poor mobile
Fixed-width layout
Horizontal overflow
```

could all be symptoms of one underlying problem.

The system should group them under a single **Mobile Experience** category.

Likewise:

```text
No CTA
No quote button
No booking button
No contact form
```

should not become an unlimited collection of points.

Use category caps.

Example:

```text
Mobile category       MAX +15
SEO category          MAX +15
Conversion category   MAX +20
```

---

# 22. Category Caps

Recommended maximum contributions:

```text
Website opportunity       +40
Website quality           +35
Business strength         +20
Digital presence          +15
Business complexity       +15
Industry relevance       +10
```

Negative modifiers may subtract up to:

```text
-40
```

The final score is still clamped to:

```text
0–100
```

---

# 23. Score Explainability

Every score must have an explanation.

Do not display only:

```text
Score: 91
```

Display:

```text
91/100 — CRITICAL

Why:
+40 No independent website detected
+8 4.9-star rating
+8 100+ reviews
+5 Active Facebook and Instagram
+10 Strong digital-presence gap
+8 High-value local service
+5 Multiple service offerings
+7 High local opportunity

Confidence:
94%

Key uncertainty:
Official domain not found in available sources.
```

This allows manual verification before contacting a prospect.

---

# 24. Lead States

The score and workflow status are separate.

Recommended lead statuses:

```text
NEW
REVIEW
QUALIFIED
CONTACTED
RESPONDED
INTERESTED
NOT_INTERESTED
FOLLOW_UP
CLIENT
ARCHIVED
```

A lead can have:

```text
Score: 94
Status: REVIEW
```

until manually verified.

---

# 25. Score Recalculation

Scores should be recalculated when relevant evidence changes.

Examples:

- new website discovered
- website comes back online
- website redesign detected
- review count changes
- social activity changes
- business closes
- new location appears

Store:

```text
score
score_version
calculated_at
```

This allows changes to the scoring algorithm without losing historical context.

---

# 26. Score Versions

Every scoring algorithm should have a version.

Example:

```text
score_version = "1.0"
```

When weights change:

```text
score_version = "1.1"
```

Historical scores remain understandable.

---

# 27. AI and Scoring

AI must not replace the deterministic score.

The preferred flow is:

```text
Raw evidence
      ↓
Deterministic score
      ↓
Top prospects
      ↓
Optional AI interpretation
```

AI can then provide:

```text
AI confidence
AI reasoning
recommended service
potential pain points
suggested pitch
```

But those outputs should remain separate from the base score.

---

# 28. AI Override Policy

The AI should never silently change:

```text
score = 94
```

to:

```text
score = 73
```

Instead:

```text
Deterministic Score: 94
AI Assessment: Strong prospect
AI Confidence: 88%
```

If human review changes the score, store:

```text
manual_score
manual_reason
manual_updated_at
```

---

# 29. Initial MVP Scoring

The first implementation should be simpler than the complete system.

Start with:

```text
NO WEBSITE                 +40
WEBSITE BROKEN             +30
OUTDATED WEBSITE           +20
POOR MOBILE                +15
POOR CONVERSION            +15
NO CONTACT FORM            +10
NO BOOKING                 +10
4.5+ RATING                 +6
100+ REVIEWS                +8
ACTIVE SOCIAL               +5
HIGH-VALUE INDUSTRY        +10
MULTIPLE SERVICES           +4
MULTIPLE LOCATIONS          +6
```

Then add more sophisticated rules only after reviewing actual results.

---

# 30. Calibration

The scoring system should be calibrated from actual observations.

After reviewing approximately 50–100 prospects, record:

```text
Predicted priority
Actual interest
Website condition
Contact outcome
Lead quality
```

Then adjust weights.

For example:

If you find that:

```text
No website + 200 reviews
```

consistently produces excellent prospects, increase the weighting.

If:

```text
Outdated design
```

does not correlate with good opportunities, reduce its weighting.

The scoring system should evolve from your real experience rather than theoretical assumptions.

---

# 31. Recommended Dashboard Display

Each lead should show:

```text
┌─────────────────────────────────────────────┐
│ ABC ROOFING                                 │
│                                             │
│ 94/100        CRITICAL                      │
│ Confidence: 96%                             │
│                                             │
│ WEBSITE                                     │
│ ❌ No independent website detected          │
│                                             │
│ BUSINESS                                    │
│ ⭐ 4.9      187 reviews                     │
│ 📱 Facebook + Instagram                     │
│                                             │
│ OPPORTUNITIES                                │
│ • No website                                │
│ • Strong reputation                         │
│ • Active social presence                    │
│ • High-value service                        │
│                                             │
│ [VIEW] [VERIFY] [EXPORT]                    │
└─────────────────────────────────────────────┘
```

The score should never be displayed without its reasoning.

---

# 32. Verification Requirement

A high score does **not** mean the business definitely needs a website.

It means:

> **The available evidence makes the business worth investigating.**

Before contacting a prospect, manually verify the critical facts.

At minimum:

```text
□ Business is active
□ Business name is correct
□ Business location is correct
□ Website status appears accurate
□ Contact information is current
□ Lead reason is legitimate
```

---

# 33. Ethical and Accuracy Rules

The system should never manufacture a sales problem.

Do not report:

```text
"They are losing customers."
```

unless there is evidence.

Prefer:

```text
"The business has no independent website detected."
```

or:

```text
"The current website lacks an obvious quote request path."
```

The system should separate:

```text
OBSERVED FACT
```

from:

```text
INFERENCE
```

from:

```text
RECOMMENDATION
```

---

# 34. Recommended Data Structure

A lead's scoring record should resemble:

```ts
interface LeadScore {
  total: number;
  priority: "CRITICAL" | "HIGH" | "GOOD" | "MODERATE" | "LOW" | "IGNORE";
  confidence: number;

  components: {
    websiteOpportunity: number;
    websiteQuality: number;
    businessStrength: number;
    digitalPresence: number;
    businessComplexity: number;
    industryRelevance: number;
    websiteStrength: number;
    negativeSignals: number;
  };

  reasons: string[];

  scoreVersion: string;

  calculatedAt: string;
}
```

---

# 35. Future Scoring Extensions

Possible future signals include:

- domain age
- technology age
- local SEO visibility
- search-result position
- Google Business activity
- review velocity
- social posting frequency
- service-area coverage
- hiring activity
- new-location signals
- online advertising presence
- competitor web quality
- website accessibility
- website content depth
- structured data
- conversion path quality

These should be introduced gradually.

---

# 36. Final Rule

The scoring engine exists to answer one question:

> **"Which businesses should I investigate first?"**

It does not exist to pretend that an algorithm knows which businesses will buy.

The system should therefore favor:

**evidence + transparency + verification + useful ranking**

over:

**fake precision + aggressive automation + unsupported assumptions.**
