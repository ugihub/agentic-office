# Bureau — CLAUDE.md

## Project Overview

Multi-Agent AI Platform with corporate enterprise architecture. Users submit tasks (prompts); the system routes them through a hierarchy of AI agents (CEO → SSC → Core agents), tracks cost, and streams progress to a dashboard.

## Tech Stack

| Layer         | Technology                                                  |
| ------------- | ----------------------------------------------------------- |
| Runtime       | Node.js ≥20, TypeScript 5, ES2022, NodeNext modules         |
| Build         | Turborepo + pnpm workspaces (pnpm@9)                        |
| API Server    | Fastify 5 (CORS, Helmet, rate-limit)                        |
| Frontend      | Next.js 14 + Tailwind CSS v3, React 19                      |
| Database      | MongoDB 7 via Mongoose                                      |
| Queue         | BullMQ on Redis 7 (no RabbitMQ — see ADR-001)               |
| LLM SDK       | Vercel AI SDK (`ai` package) — Anthropic + Google           |
| State machine | XState 5                                                    |
| Auth          | JWT RS256 (jose) + API key hash                             |
| Telemetry     | OpenTelemetry + Pino, Jaeger (traces), Prometheus + Grafana |
| Testing       | Vitest (unit), Playwright (e2e)                             |
| CI            | GitHub Actions (ci.yml, publish.yml, security.yml)          |
| Secrets       | Doppler (staging/prod); `.env` locally                      |

## Monorepo Layout

```
core/              → Framework-agnostic agent orchestration (NO framework imports)
packages/
  shared-kernel    → Result<T,E>, ULID, Money, error hierarchy — zero deps
  contracts        → Zod schemas for ALL domain objects (.strip() on all)
  models           → Mongoose models (all MongoDB collections)
  agents-core      → IHeadAgent/IWorkerAgent interfaces, ParallelOrchestrator
  auth             → JWT RS256 + API key validation
  cost-analytics   → LLM cost tracking (write path)
  infra-messaging  → BullMQ typed queues + dead-letter handling
  infra-mongo      → MongoContext, repository base, outbox pattern
  llm-providers    → IModelProvider + Claude/Gemini implementations
  task-machine     → XState 5 task state machine
  telemetry        → OpenTelemetry + Pino (correlation IDs)
pillars/
  api-server       → Fastify 5 HTTP entry point (port 3001)
  workers          → BullMQ background workers (outbox, timeout, task processor)
  mcp-server       → Claude Code / Gemini CLI plugin via stdio
  sdk              → TypeScript SDK for external callers
apps/
  dashboard        → Next.js 14 frontend (port 3000)
```

## Critical Conventions

### Result<T,E> — always

Never throw across package boundaries. Use `Result<T,E>` from `@bureau/shared-kernel`:

```ts
import { ok, err, type Result } from "@bureau/shared-kernel";
```

### Zod schemas — .strip() on all objects

Every schema must call `.strip()` to drop unknown fields:

```ts
const MySchema = z.object({ ... }).strip();
```

### IDs — ULID with prefix

```ts
import { newId, EntityPrefix } from "@bureau/shared-kernel";
const id = newId(EntityPrefix.TASK); // "tsk_01HXXX..."
```

### Agents — dependency injection

Agent constructors take a `deps` object (no direct imports of infra):

```ts
class MyAgent implements IWorkerAgent {
  constructor(private readonly deps: MyAgentDeps) {}
}
```

### core/ — NO framework imports

`core/` must remain importable from MCP (stdio), Fastify, and Docker. Never import Fastify/Next/NestJS there.

### Logging

```ts
import { createLogger } from "@bureau/telemetry";
const log = createLogger({ division: "Executive", taskId, correlationId });
log.info({ ... }, "message");
```

### TypeScript — strict mode

All strict flags enabled including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`.

## Common Commands

```bash
# Dev (all services)
pnpm dev

# Build everything
pnpm build

# Test
pnpm test

# Lint / format
pnpm lint
pnpm format

# Typecheck
pnpm typecheck

# Docker dev stack (Redis + Mongo + Jaeger + Prometheus + Grafana)
docker-compose up -d redis mongo jaeger

# Run single package
pnpm --filter @bureau/shared-kernel build
pnpm --filter @bureau/api-server dev
```

## Task Lifecycle (Domain Model)

```
Submitted → Preparing → Researching → Producing → QA → Completed
                                               ↘ AwaitingUserDecision
                                                         ↘ Cancelled
```

## API Endpoints (api-server, port 3001)

- `GET /health/live` — liveness (no auth)
- `POST /api/v1/tasks` — submit task
- `GET /api/v1/tasks/:id` — get task
- `GET /api/v1/tasks/:id/status` — status
- `GET /api/v1/tasks/:id/stream` — SSE stream
- `POST /api/v1/tasks/:id/decision` — resolve AwaitingUserDecision
- `POST /api/v1/auth-keys` — create API key
- `GET /api/v1/auth-keys` — list keys
- `DELETE /api/v1/auth-keys/:id` — revoke

## Commit Style (Conventional Commits)

```
feat(scope): description
fix(scope): description
docs: description
refactor(scope): description
test(scope): description
```

Enforced by commitlint + husky pre-commit hook.
