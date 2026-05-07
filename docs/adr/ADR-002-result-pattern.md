# ADR-002: Result<T, E> Pattern — No Throws in Business Logic

## Status

Accepted — 2026-05-03

## Context

Bureau is a distributed multi-agent system where errors cross process boundaries via BullMQ jobs and HTTP calls. The system must handle:

- LLM provider failures (rate limits, timeouts, 503s)
- Budget exhaustion mid-task
- MongoDB write failures
- QA rejections that may or may not escalate

In a throw-based system, any unhandled exception in an agent worker silently kills the job and requires forensic log analysis to understand what failed and why. This is especially painful in a system with 7+ agent divisions running in parallel.

TypeScript's type system also cannot track exceptions — `async function foo(): Promise<T>` gives no indication of what failures are possible.

## Options Considered

### Option 1: Exceptions (throw/try-catch)

- Pro: Familiar to most developers
- Pro: Less boilerplate for happy path
- Con: Failure modes invisible in type signatures
- Con: Unhandled rejections in async code silently kill workers
- Con: Can't compose error handling across agent boundaries
- Con: Hard to distinguish "expected" failures (budget exhausted) from "unexpected" bugs
- Rejected because: Invisible failures are catastrophic in a billing-sensitive system

### Option 2: Result<T, E> (Railway-Oriented Programming)

- Pro: Failure modes visible in type signature
- Pro: TypeScript exhaustive checking at error handling sites
- Pro: Forces explicit error handling before passing control
- Pro: Composable — `andThen`, `mapOk`, `mapErr` chains
- Con: More boilerplate at call sites
- Con: Unfamiliar to developers without FP background
- Accepted because: The boilerplate cost is worth it for a billing-sensitive distributed system

### Option 3: neverthrow or fp-ts

- Pro: Battle-tested libraries with more combinators
- Con: External dependency; adds lock-in
- Con: fp-ts is complex for team onboarding
- Rejected because: Our `Result<T, E>` needs are simple enough to own in `@bureau/shared-kernel`

## Decision

All business logic in `@bureau/core` and all `@bureau/*` packages return `Result<T, E>`. No `throw` in business logic.

Exceptions are allowed only in:

1. Infra layer initialization (MongoDB connection, Redis connection) — these are startup-time and there's nothing to do except crash
2. External library callbacks where we can't control the interface

Boundary rule: `try/catch` wraps external library calls and converts thrown exceptions to `err(...)` at the boundary.

## Consequences

### Diterima

- Every function's failure modes are visible in its return type
- TypeScript forces explicit error handling — you can't accidentally ignore a failure
- Workers can introspect failure type before deciding to retry, escalate, or fail
- `cost_analytics` can record failures accurately (llmInvoked flag)

### Trade-off yang disadari

- ~15% more code at call sites due to `if (!result.ok)` patterns
- New developers need to learn the pattern before being productive
- Some TypeScript inference issues with complex generic chains

## When to Revisit

Keputusan ini perlu di-review kalau:

- [ ] TypeScript adds native Result types or `throws` annotations to the language
- [ ] Team size grows beyond 10 engineers and onboarding cost becomes measurable
- [ ] We find a failure category that Result<T,E> handles worse than exceptions

## Known Unknowns saat keputusan dibuat

- Whether the boilerplate cost will compound as the codebase grows beyond 50k LOC
- Whether developers from throw-based backgrounds adapt well or resist
