## Summary

<!-- 1-3 bullet points describing what this PR does -->

-
-

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] CI/CD / tooling change

## Motivation

<!-- Why is this change needed? Link to issue if applicable. Closes #XXX -->

## Implementation Notes

<!-- Technical decisions made, trade-offs, anything reviewers should know -->

## Critical Checklist

<!-- These are non-negotiable. PRs that fail these will not be merged. -->

- [ ] No `throw` in business logic — all errors return `Result<T, E>`
- [ ] Financial prompts: `SYSTEM_FLOOR_TTL.financial === 0` still true (check `category-cache.ts`)
- [ ] Finance budget reservation uses `findOneAndUpdate + $gte` (not read-modify-write)
- [ ] `@bureau/core` has zero framework imports (verify: `grep -r "from 'fastify'" core/`)
- [ ] All state changes go through MongoDB (not in-memory only)
- [ ] `correlationId` + `taskId` present in new log entries
- [ ] Outbox entry created before any BullMQ enqueue
- [ ] `schemaVersion: 'v1'` on any new MongoDB document types

## Testing

- [ ] Unit tests added/updated
- [ ] Tests pass locally: `pnpm test`
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] If touching LLM invocation: `cost_analytics` write path still works
- [ ] If touching Finance SSC: atomic reservation test passes

## ADR Impact

<!-- Does this PR require a new ADR or update to an existing one? -->

- [ ] No ADR impact
- [ ] New ADR needed (create in `docs/adr/`)
- [ ] Existing ADR updated: `docs/adr/ADR-XXX-...`

## Screenshots / Logs

<!-- If applicable, add screenshots or log output to help reviewers -->
