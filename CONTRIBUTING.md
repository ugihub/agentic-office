# Contributing to Bureau

Bureau is an open-source multi-agent AI platform. Contributions are welcome.

## Quick Start

```bash
git clone https://github.com/bureau-id/bureau
cd bureau
pnpm install
docker compose up -d   # Redis, MongoDB, Jaeger, Prometheus, Grafana
pnpm build
pnpm test
```

## Project Structure

```
packages/          Shared packages (@bureau/*)
core/              @bureau/core — framework-agnostic orchestration
pillars/
  api-server/      Fastify HTTP API (Pilar 2)
  mcp-server/      MCP stdio plugin (Pilar 1)
  workers/         Background workers (outbox, decision timeout)
  sdk/             TypeScript client SDK
tests/             E2E, load, performance, security, chaos tests
deploy/            Docker, Helm, ArgoCD, Prometheus, Grafana
docs/              ADRs, runbook, API spec
```

## Development Workflow

### Branches

- `main` — production-ready, protected
- `staging` — staging environment, auto-deployed via ArgoCD
- `feat/your-feature` — feature branches
- `fix/issue-description` — bug fixes

### Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add semantic cache invalidation endpoint
fix: prevent race condition in Finance atomic reservation
docs: update runbook for queue depth alert
chore: upgrade BullMQ to 5.2.0
test: add chaos scenario for Redis restart
```

Commits are linted via `commitlint` on pre-commit hook.

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter "@bureau/shared-kernel" test

# Chaos unit tests
pnpm --filter "@bureau/tests" test tests/chaos/

# Load tests (requires k6)
k6 run tests/load/k6-load-test.js

# Security scan (requires Trivy)
CI=true bash tests/security/security-scan.sh
```

### Code Style

- **TypeScript strict** — `tsconfig.base.json` strict mode enforced
- **Result<T,E> pattern** — no `throw` in business logic (see ADR-002)
- **No framework imports in `@bureau/core`** (see ADR-001)
- **Zod `.strip()` as default** on all schemas (see ADR-006)
- Prettier + ESLint via pre-commit hook

## Architecture Decisions

Read the ADRs before submitting significant changes:

| ADR | Decision |
|---|---|
| [ADR-001](docs/adr/ADR-001-bullmq-only.md) | BullMQ-only (no RabbitMQ) |
| [ADR-002](docs/adr/ADR-002-result-pattern.md) | Result\<T,E\> — no throw in business logic |
| [ADR-003](docs/adr/ADR-003-fast-path-classifier.md) | Rule-based path classifier (not LLM) |
| [ADR-004](docs/adr/ADR-004-escalation-chain.md) | Escalation chain + AwaitingUserDecision |
| [ADR-005](docs/adr/ADR-005-cache-ttl-categories.md) | Category-based TTL cache |
| [ADR-006](docs/adr/ADR-006-schema-strict-no-reserved.md) | Strict schema, no reserved fields |

## Critical Rules

These rules are non-negotiable. PRs violating them will not be merged:

1. **Financial prompts must never be cached** — `SYSTEM_FLOOR_TTL.financial === 0` at all times
2. **Finance budget reservation must use atomic `findOneAndUpdate + $gte`** — no read-modify-write
3. **No `throw` in business logic** — all errors return `Result<T, E>`
4. **`@bureau/core` must have zero framework imports** — it runs in MCP stdio context
5. **All state lives in MongoDB** — Redis is ephemeral only (BullMQ, cache, rate limit)
6. **Outbox pattern for all BullMQ enqueues** — no direct enqueue without outbox entry first
7. **`correlationId` and `taskId` in every log entry** — use `createLogger({ taskId, correlationId })`

## Submitting a Pull Request

1. Fork the repo and create a feature branch
2. Run tests locally: `pnpm test`
3. Run typecheck: `pnpm typecheck`
4. Ensure `cost_analytics` write path is untouched if touching LLM invocation code
5. Open PR against `staging` branch (not `main`)
6. Fill in the PR template
7. A maintainer will review within 48 hours

## Reporting Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Email: security@bureau.id

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We will respond within 72 hours and coordinate a responsible disclosure.

## License

MIT — see [LICENSE](LICENSE).
