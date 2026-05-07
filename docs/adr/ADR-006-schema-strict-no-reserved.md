# ADR-006: Strict Schema — No "Reserved for Future Use" Fields

## Status

Accepted — 2026-05-03

## Context

When designing MongoDB schemas for a growing system, teams often add "reserved" or "future" fields to avoid migrations later:

```typescript
reservedField1: { type: String, default: null },  // for future use
flags: { type: Map, default: {} },  // catch-all
extendedData: Schema.Types.Mixed,   // ¯\_(ツ)_/¯
```

This creates technical debt without a deadline. "Reserved" fields never get used for their original purpose — by the time the use case is clear, the requirements have changed. But the field stays forever, consuming space and confusing future developers.

The question for Bureau: strict schemas or flexible "future-proof" schemas?

## Options Considered

### Option 1: Flexible schemas with reserved fields

- Pro: Avoid future migrations when requirements change
- Pro: Common in early-stage products where requirements are unclear
- Con: "Reserved for future use" has no owner, no deadline, no requirements
- Con: Accumulates over time — 50 "future" fields in production is a maintenance nightmare
- Con: Violates "make the simple case simple" — every read of these fields is confusing
- Rejected: Premature flexibility creates real costs with no real benefits

### Option 2: Mongoose strict: false (allow arbitrary fields)

- Pro: Maximum flexibility
- Con: MongoDB document structure becomes unknown — loses type safety
- Con: Any typo in a field name silently adds a new field instead of failing
- Con: Completely negates TypeScript's benefits
- Rejected: Type safety is a core requirement

### Option 3: Strict schemas with explicit migration strategy

- Pro: Every field has a clear purpose and owner
- Pro: TypeScript type inference works correctly on all fields
- Pro: When new fields needed → write a migration script → run → done
- Pro: Zod `.strip()` on message contracts handles rolling deployments safely
- Con: Migrations require coordination and testing
- Con: More upfront discipline required
- Accepted: Discipline upfront vs. technical debt forever

### Option 4: Event sourcing (schema evolution via event versioning)

- Pro: Full audit trail, easy replay
- Con: Significantly more complex infrastructure for MVP
- Con: Overkill when task lifecycle fits in a single document
- Rejected: Too complex for MVP. Consider for v2 if audit requirements demand it.

## Decision

**Mongoose `strict: true` on all models.**

Every field must be:

1. Documented (JSDoc or inline comment)
2. Typed explicitly
3. Part of the schema on day 1 or added via migration

**Migration rule:** When a new field is needed:

1. Write migration script in `deploy/migrations/`
2. Test against a snapshot of production documents
3. Deploy migration before deploying code that uses the field
4. Never deploy code that reads a field that doesn't exist in the schema yet

**Zod `.strip()` for message contracts** (not MongoDB schemas):

- BullMQ job payloads and API request/response bodies use `.strip()` to allow rolling deployments
- Unknown fields are silently dropped, not errors
- This is safe because Zod strips unknown fields — MongoDB documents stay clean

**`schemaVersion: 'v1'` on every document:**

- Enables future `z.discriminatedUnion('schemaVersion', [V1Schema, V2Schema])` migration
- String, not number — cleaner in discriminated unions

## Consequences

### Diterima

- All fields have clear purpose and ownership
- TypeScript inference correct on all fields
- No mystery fields accumulating in production
- Zod `.strip()` ensures safe rolling deployments without field conflicts

### Trade-off yang disadari

- Migrations required for schema changes (extra work)
- Discipline required to write migrations for every new field
- If migration is missed, production deployment can fail

## When to Revisit

Keputusan ini perlu di-review kalau:

- [ ] Migration failures in production cause more downtime than reserved fields would have caused
- [ ] Team is spending >10% of sprint time on schema migrations (too frequent)
- [ ] A requirement emerges that genuinely requires dynamic schema (unlikely for core task lifecycle)

## Known Unknowns saat keputusan dibuat

- Rate of schema changes once system is in production
- Whether the Zod `.strip()` approach handles all rolling deployment scenarios or has edge cases
