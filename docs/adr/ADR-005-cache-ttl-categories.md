# ADR-005: Category-Based TTL Cache — SYSTEM_FLOOR_TTL + TENANT_MAX_TTL

## Status
Accepted — 2026-05-03

## Context

Bureau caches LLM responses in Redis to reduce costs. A simple "cache everything for N seconds" approach fails because:
- Financial data (prices, exchange rates) must never be cached — stale price data = incorrect financial advice = legal/trust risk
- Time-sensitive data (today's news, current events) has short cache windows
- Personnel data (CEO names, org charts) changes rarely but is high-sensitivity
- General knowledge changes slowly and can be cached for days

A binary "cache or don't cache" approach forces operators to choose between cost savings and accuracy. A category-based approach with floor constraints gives both.

## Options Considered

### Option 1: Single TTL for all requests
- Pro: Simple configuration
- Con: One TTL can't handle both "bitcoin price" and "history of Rome"
- Con: Setting TTL low for safety means expensive general queries re-execute unnecessarily
- Con: Setting TTL high for savings means financial data gets stale
- Rejected: Fundamentally wrong tradeoff

### Option 2: Per-request TTL (user/tenant sets per-call)
- Pro: Maximum flexibility
- Con: Every LLM call needs TTL annotation — developer burden
- Con: If developer forgets to set TTL on a financial query, default caches it → billing bug
- Con: No system-level safety floor — tenant can set TTL=86400 on "bitcoin price"
- Rejected: Too easy to misconfigure in ways with real financial consequences

### Option 3: Category-based TTL with system floor constraints
- Pro: Classifier runs on every request (runtime assertion, not just tests)
- Pro: Financial TTL=0 is a hard system constraint — tenants cannot override it
- Pro: Tenant customization within safe bounds (can increase TTL for their use case)
- Pro: Categories map to real-world data volatility
- Con: Regex classifier has false positives/negatives
- Con: 5 categories may not cover all use cases
- Accepted: System-level safety for financial data is non-negotiable

### Option 4: Semantic cache only (vector similarity threshold)
- Pro: More nuanced than exact-match — "price of bitcoin" ≈ "bitcoin current value"
- Con: Vector similarity doesn't know if content is financial — would cache financial queries
- Con: Adds Upstash Vector dependency for basic caching
- Partially accepted: Semantic cache at 95% threshold is used as LAYER 2 on top of category-based TTL, not as a replacement. Semantic cache inherits the same TTL rules.

## Decision

**SYSTEM_FLOOR_TTL (hard minimum — cannot be lowered by tenant):**
```
financial:  0        // never cached — runtime assertion
temporal:   60s      // min 1 minute
personnel:  3600s    // min 1 hour
inventory:  300s     // min 5 minutes
default:    3600s    // min 1 hour
```

**TENANT_MAX_TTL (hard maximum — tenant can set TTL anywhere in [FLOOR, MAX]):**
```
financial:  0        // no override ever
temporal:   600s     // max 10 minutes
personnel:  86400s   // max 24 hours
inventory:  3600s    // max 1 hour
default:    604800s  // max 7 days
```

**Classifier runs on every request** as a runtime assertion, not just in tests.

**Layer 2:** Semantic cache via Upstash Vector at 95% similarity threshold, inheriting same TTL rules. Time-sensitivity signal from `hasTemporal` flag lowers semantic threshold to 99.5% for temporal queries.

## Consequences

### Diterima
- Financial data can never be served stale — hard system guarantee
- Significant cost reduction for general knowledge queries (7-day cache = 99% cache hit rate for stable content)
- Per-tenant customization within safety bounds

### Trade-off yang disadari
- Regex classifier has false positives: "I work for Goldman Sachs, analyze..." → may not be classified financial
- Layer 2 (semantic) adds Upstash dependency and latency for first miss
- Cache invalidation for personnel data (e.g., CEO changes) requires manual TTL management

## When to Revisit

Keputusan ini perlu di-review kalau:
- [ ] A financial data leak traced to cache TTL misclassification
- [ ] Cache hit rate below 40% for "default" category queries (categories too conservative)
- [ ] Tenant requests categories we don't have (e.g., "medical" data sensitivity)

## Known Unknowns saat keputusan dibuat
- False positive rate of the regex financial classifier on real user prompts
- Whether semantic cache 95% threshold is appropriate without empirical data
- Whether tenants will actually use per-category TTL customization
