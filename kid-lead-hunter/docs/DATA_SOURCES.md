# K!D Lead Hunter — Data Sources

## 1. Purpose

This document catalogs every external data source the application uses (or may use), and documents the rules from `ARCHITECTURE.md` §10 for each one:

```text
- source name
- access method
- rate limitations
- attribution requirements
- data-storage limitations
- prohibited uses
- fields collected
```

Every new `DiscoverySource` adapter added to `src/discovery/sources/` must have a corresponding entry here before it ships.

---

# 2. Source Interface Recap

All sources implement:

```ts
interface DiscoverySource {
  search(query: DiscoveryQuery): Promise<BusinessCandidate[]>;
}
```

This document is the human-readable companion to that code — the "why" and "what's allowed" behind each adapter.

---

# 3. OpenStreetMap (Overpass API)

```text
Source name:            OpenStreetMap via Overpass API
Access method:          Public Overpass API endpoint (overpass-api.de
                         or a configured mirror), HTTP queries
Authentication:         None required
Rate limitations:       Shared public infrastructure — keep queries
                         infrequent, batch by bounding box, avoid
                         hammering the endpoint (self-imposed: 1
                         request at a time, backoff on 429/504)
Attribution:            "© OpenStreetMap contributors" required
                         wherever OSM-derived data is displayed
                         (dashboard footer / export footer)
Data-storage:           Store business name, category, address,
                         coordinates, phone/website if tagged.
                         No restriction on retention for this
                         personal, non-redistributed use, but data
                         should stay reasonably fresh (re-verify
                         periodically rather than treating it as
                         permanently accurate).
Prohibited uses:        No bulk redistribution of raw OSM extracts
                         as a dataset product. No use that violates
                         the Overpass API fair-use policy.
Fields collected:       name, category/tags, address, lat/lon,
                         phone (if present), website (if present)
```

---

# 4. Foursquare Places API

```text
Source name:            Foursquare Places API
Access method:          REST API, API key required (free tier)
Authentication:         API key stored in .env, never committed
Rate limitations:       Governed by Foursquare's free-tier quota
                         (check current limits before relying on
                         volume; the app must track usage and stop
                         calling the API once the free quota is
                         reached for the period)
Attribution:            Per Foursquare's current developer terms
                         (check at integration time; display
                         attribution if required)
Data-storage:           Store only fields needed for scoring
                         (name, category, address, rating, tip/
                         review count, website if present). Do not
                         store raw API responses beyond what's
                         needed for debugging, and only temporarily.
Prohibited uses:        No resale of Foursquare data. No use beyond
                         personal lead research. No caching that
                         violates Foursquare's data-retention terms
                         — check current terms before setting a
                         cache TTL longer than what's permitted.
Fields collected:       name, category, address, phone, website,
                         rating, review/tip count, social links
                         if exposed
```

---

# 5. Permitted Web Search

```text
Source name:            General web search (used to discover a
                         possible official domain when no website
                         field exists)
Access method:          Whatever search mechanism is configured
                         and permitted (e.g. a search API with its
                         own terms, or manually-triggered lookups)
Authentication:         Depends on provider; key stored in .env
Rate limitations:       Governed by the chosen provider's terms;
                         keep query volume conservative (one
                         targeted query per business, not broad
                         scraping of result pages)
Attribution:            None typically required for using search
                         to locate a URL, but do not reproduce
                         search-result snippets verbatim in stored
                         records or exports
Data-storage:           Store only the resolved candidate domain(s)
                         and the confidence signals used to accept
                         or reject them — not full search-result
                         pages
Prohibited uses:        No scraping of the search provider's result
                         pages outside their permitted API/terms.
                         No use to bypass paywalls or access
                         controls on found pages.
Fields collected:       candidate domain(s), match-confidence
                         signals (name/city/phone match)
```

---

# 6. Business Websites (Direct Fetch)

```text
Source name:            The business's own website (once a domain
                         is identified)
Access method:          Plain HTTP(S) GET requests; Playwright only
                         as an escalation when JS rendering is
                         required (see ARCHITECTURE.md §18)
Authentication:         None — public pages only
Rate limitations:       Self-imposed: modest request rate per
                         domain, no aggressive crawling, single
                         page or a small handful of pages per site
                         (home page + maybe a contact/services page)
Attribution:            Not applicable (not redistributing content,
                         only extracting structural observations)
Data-storage:           Store structured observations (title, meta
                         tags, viewport, forms, CTAs, technology
                         fingerprints) — not full HTML, per
                         ARCHITECTURE.md §55
Prohibited uses:        No bypassing authentication or technical
                         access controls. No ignoring robots.txt
                         where it restricts automated access. No
                         aggressive crawling that could look like a
                         denial-of-service pattern. No downloading
                         or storing copyrighted media assets from
                         the site beyond what's needed to determine
                         load characteristics.
Fields collected:       title, meta description, viewport presence,
                         heading structure, form/CTA/booking
                         presence, phone/email links, technology
                         fingerprint, response time, HTTP/HTTPS
                         status
```

---

# 7. Social Media Profiles

```text
Source name:            Publicly visible business social profiles
                         (Facebook Page, Instagram business profile,
                         etc.) reached via links discovered on the
                         website or through discovery sources
Access method:          Public page metadata only (no login, no
                         private API access, no scraping behind
                         auth walls)
Authentication:         None
Rate limitations:       Minimal — a small number of checks per
                         business, not continuous monitoring
Attribution:            Not applicable
Data-storage:           Store only: platform, profile URL, whether
                         it appears active (recent post signal),
                         follower/engagement counts if publicly
                         displayed. Do not store post content.
Prohibited uses:        No scraping of individual posts, comments,
                         or follower lists. No circumventing a
                         platform's access controls or terms of
                         service.
Fields collected:       platform name, profile URL, activity signal,
                         aggregate counts if visible
```

---

# 8. User-Supplied Lists

```text
Source name:            User-provided CSV or manually entered
                         business records
Access method:          Local file upload / manual entry
Authentication:         Not applicable
Rate limitations:       Not applicable
Attribution:            Not applicable
Data-storage:           Same rules as any other business record
Prohibited uses:        The user is responsible for ensuring they
                         have the right to use any list they supply
                         (e.g., not importing a list obtained
                         through a data breach or in violation of
                         someone else's terms)
Fields collected:       Whatever the user provides, mapped to the
                         standard business schema
```

---

# 9. Adding a New Source

Before adding a new `DiscoverySource`, fill out a new section in this document using the same template, and confirm:

```text
□ Does the source's current terms of service permit this use?
□ Is there a free tier sufficient for personal use (see ZERO_COST.md)?
□ What is the rate limit, and how will the app respect it?
□ What attribution, if any, is required?
□ What is the minimum set of fields actually needed for scoring?
□ Is there any prohibited use we need to explicitly avoid?
```

Only after this checklist is filled in should the adapter be implemented.

---

# 10. Review Cadence

Third-party terms of service change. Before each significant release, or at least twice a year, revisit each source's current terms and confirm this document still reflects reality. Terms drift silently; this document should not.
