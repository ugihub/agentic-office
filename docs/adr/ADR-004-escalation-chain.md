# ADR-004: Escalation Chain and AwaitingUserDecision State

## Status
Accepted — 2026-05-03

## Context

Bureau's QA Agent can reject Production output. When rejection happens, we face a decision: retry with the same model, retry with a better model, or fail. Better models cost more. The system needs a strategy that:
1. Doesn't silently spend more money than the user authorized
2. Doesn't fail immediately on first QA rejection (that would be a bad UX)
3. Doesn't leave tasks stuck indefinitely if the user doesn't respond

Previous design (v3.0): unlimited retries with the same model → infinite loops possible.

## Options Considered

### Option 1: Always retry with same model
- Pro: Simple — no budget complexity
- Con: Infinite retry loop possible if model consistently fails this task type
- Con: No quality improvement on retry — same model, same prompt, same output
- Rejected: Infinite retry = potential infinite cost

### Option 2: Fail immediately after first QA rejection
- Pro: Simple, predictable
- Con: Terrible UX — users expect system to try harder
- Con: One QA failure doesn't mean the task is impossible
- Rejected: User frustration unacceptable

### Option 3: Pre-approved escalation chain with AwaitingUserDecision
- Pro: Finance SSC approves total budget for ALL attempts before task starts
- Pro: User knows worst-case cost upfront, not mid-task
- Pro: Graceful degradation: best_effort output available if user doesn't want to escalate
- Pro: 24-hour timeout with sensible default (best_effort) prevents tasks stuck forever
- Con: More complex state machine (adds AwaitingUserDecision state)
- Con: Requires email notification infrastructure
- Accepted: The budget transparency and graceful degradation justify the complexity

### Option 4: User sets budget, system uses it freely
- Pro: Simple — user says $1.00, system uses what it needs up to $1.00
- Con: User loses control of how budget is distributed across attempts
- Con: No visibility into what's happening mid-task
- Rejected: Budget opacity is a trust issue for a billing product

## Decision

**Escalation chain (pre-approved by Finance SSC):**
```
Attempt 1 → economy model (haiku/flash/deepseek)
Attempt 2 → standard model (sonnet/pro/mistral) [if QA rejects]
Attempt 3 → premium model (opus/gpt-5) [if QA rejects again]
```

Finance SSC approves total budget for the full chain before task starts.
If budget doesn't cover the next attempt → enter `AwaitingUserDecision`.

**AwaitingUserDecision state:**
- Reason: `budget_insufficient_for_escalation`
- Options: `best_effort` (use current output), `add_budget` (user tops up), `cancel` (full refund)
- Timeout: 24 hours → auto-execute `defaultAction` (usually `best_effort`)
- Email notification sent once via Resend/Postmark on state entry

**Max retries = 3.** After 3 QA failures with all escalation options exhausted → `Failed`.

## Consequences

### Diterima
- Users know maximum possible cost before task starts
- No surprise billing
- Graceful degradation: 80% quality output better than nothing
- Tasks never stuck forever (24h timeout + auto-execute)

### Trade-off yang disadari
- Email infrastructure required for notification (Resend/Postmark)
- State machine complexity: AwaitingUserDecision adds transition edges
- If user's email bounces, they might miss the decision window

## When to Revisit

Keputusan ini perlu di-review kalau:
- [ ] AwaitingUserDecision resolution rate drops below 70% in 2 hours (users not responding)
- [ ] >30% of AwaitingUserDecision tasks auto-execute best_effort (users abandoning)
- [ ] Support tickets about "I didn't know my task was waiting for input"

## Known Unknowns saat keputusan dibuat
- Whether 24-hour timeout is too long or too short for typical user behavior
- Whether best_effort output quality (estimated 0.7-0.8) is acceptable to users
- Email deliverability rate for different tenant email providers
