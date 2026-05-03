# ADR-003: Fast Path Classifier — Rule-Based, Not LLM

## Status
Accepted — 2026-05-03

## Context

Bureau's path classifier determines whether a task goes through:
- **Fast path** (3 divisions, <3s end-to-end): CEO + Production + Compliance (schema only)
- **Standard path** (5-7 divisions): adds Research, HR, IT
- **Full path** (all 9 divisions): everything including QA escalation

The classifier must run on every incoming request before any division work starts. The question: how do we classify?

## Options Considered

### Option 1: LLM call for classification
- Pro: Can understand nuanced intent ("give me a quick summary" vs "comprehensive analysis")
- Pro: Handles language variations well
- Con: Adds 1-3s latency and ~$0.001 cost before the task even starts
- Con: Circular dependency — using LLM to decide if we need LLM
- Con: Under high load, classification latency compounds with queue wait time
- Con: If LLM provider is down, nothing can be classified — system-wide failure
- Rejected because: One LLM call to decide if we need an LLM call is counterproductive at scale

### Option 2: Rule-based regex classifier
- Pro: <1ms latency, zero cost
- Pro: Deterministic and testable — same input always gives same classification
- Pro: No external dependencies — works even when LLM providers are down
- Pro: Easy to audit: "why was this fast path?" → point to specific regex match
- Con: Can misclassify edge cases ("what's the weather?" looks temporal but user wants analysis)
- Con: Regex rules need maintenance as new patterns emerge
- Accepted because: Speed and reliability wins for the gating decision

### Option 3: ML classifier (fine-tuned small model)
- Pro: Better accuracy than regex without LLM overhead
- Con: Model serving infrastructure for a classifier feels like overengineering
- Con: Requires training data, retraining pipeline, model versioning
- Rejected: Too much infrastructure for MVP. Revisit if feedback data shows >5% misclassification

### Option 4: Hybrid (rule-based fast path gate, LLM for standard vs full)
- Pro: LLM only runs for ambiguous cases
- Pro: Fast path stays fast, complex tasks get smarter routing
- Con: Still adds LLM latency for non-fast-path tasks
- Con: "Standard vs full" distinction is less critical — both paths have similar latency ceiling
- Partially accepted: LLM confidence scoring for standard vs full is allowed as an enhancement, not a gate

## Decision

Path classifier is rule-based regex. Criteria:
- `tokens < 150 AND no code signals AND no research signals AND no temporal signals` → **fast**
- `hasCode OR (hasResearch AND tokens > 300)` → **full**
- Everything else → **standard**

LLM confidence scoring may optionally influence standard↔full boundary but never gates fast path classification.

Finance SSC budget check always runs regardless of path — cannot be skipped.

## Consequences

### Diterima
- Zero-latency, zero-cost classification
- Predictable behavior under load
- Fast path available even during LLM provider outages

### Trade-off yang disadari
- Edge case misclassification exists. Mitigated by: user can specify `preferredModelTier` in request to force higher tier
- Regex patterns must be maintained in `classifyPath()` function

## When to Revisit

Keputusan ini perlu di-review kalau:
- [ ] Feedback data shows >5% of fast-path tasks have rating <2/5 (likely misclassified)
- [ ] Fast path adoption rate drops below 20% (rules too conservative, nothing qualifies)
- [ ] A pattern emerges where regex systematically misclassifies a task category

## Known Unknowns saat keputusan dibuat
- What percentage of real user prompts will qualify for fast path
- Whether users will understand/use the preferredModelTier override
