# Bureau — Developer Documentation

> Dokumentasi teknis untuk kontributor dan developer.
> Untuk panduan penggunaan end-user: [README.md](README.md)

---

## Daftar Isi

1. [Arsitektur](#1-arsitektur)
2. [Struktur Monorepo](#2-struktur-monorepo)
3. [Tech Stack & ADR](#3-tech-stack--adr)
4. [Database Schemas](#4-database-schemas)
5. [API Reference](#5-api-reference)
6. [Agent System](#6-agent-system)
7. [Task State Machine](#7-task-state-machine)
8. [Dashboard Frontend](#8-dashboard-frontend)
9. [Development Guide](#9-development-guide)
10. [Deployment Guide](#10-deployment-guide)
11. [SLO Targets](#11-slo-targets)

---

## 1. Arsitektur

### Tiga Pilar Deployment

Bureau dirancang untuk tiga deployment mode:

| Pillar         | Package                                  | Target                                  |
| -------------- | ---------------------------------------- | --------------------------------------- |
| **Plugin**     | `core/`                                  | Claude Code MCP (stdio, no HTTP server) |
| **SaaS**       | `pillars/api-server` + `pillars/workers` | Multi-tenant hosted service             |
| **OpenSource** | `pillars/api-server` + `pillars/workers` | Self-hosted Docker                      |

**Prinsip utama:** `@bureau/core` adalah framework-agnostic. Tidak boleh import dari NestJS, Next.js, Fastify, atau framework web apapun. Ini memungkinkan `core/` jalan di Claude Code MCP (stdio) tanpa HTTP server.

### Data Flow

```
User → REST API / MCP / Dashboard
          │
          ▼
    pillars/api-server  (Fastify)
          │
    POST /tasks  →  classifyTask()  →  fast | standard | full
          │
    TaskEnvelope created in MongoDB
          │
    Outbox entry → BullMQ queue
          │
          ▼
    pillars/workers  (BullMQ)
          │
    ┌─────────────────────────────────┐
    │  SSC Agents (shared services)   │
    │  Finance → HR → Compliance      │
    │  → CEO orchestration            │
    └─────────────────────────────────┘
          │
    ┌─────────────────────────────────┐
    │  Core Agents (per task)         │
    │  Research → Production → QA     │
    │  → Formatting                   │
    └─────────────────────────────────┘
          │
    SSE stream → Dashboard / SDK
```

### Execution Paths

| Path       | Trigger             | Description                           |
| ---------- | ------------------- | ------------------------------------- |
| `fast`     | tokenCount < 500    | Research skip, single LLM call, no QA |
| `standard` | tokenCount 500–2000 | Full SSC + core agents, single model  |
| `full`     | tokenCount > 2000   | Full pipeline + escalation chain      |

Path ditentukan oleh `classifyTask()` di `@bureau/core/path-classifier`.

---

## 2. Struktur Monorepo

```
bureau/
├── apps/
│   └── dashboard/            # Next.js 15 monitoring dashboard
├── core/                     # @bureau/core — framework-agnostic orchestration
│   └── src/
│       ├── agents/
│       │   ├── ssc/          # Shared Service Centers (Finance, HR, Compliance)
│       │   ├── csuite/       # C-Suite (CEO orchestrator)
│       │   └── core/         # Core divisions (Research, Production, QA, Formatting)
│       └── path-classifier/  # fast/standard/full classification
├── packages/
│   ├── agents-core/          # Agent interfaces (IHeadAgent, IWorkerAgent)
│   ├── auth/                 # JWT + API key auth utilities
│   ├── contracts/            # Zod schemas — domain objects
│   ├── cost-analytics/       # Cost tracking + budget management
│   ├── infra-messaging/      # BullMQ queue helpers
│   ├── infra-mongo/          # Mongoose models + outbox pattern
│   ├── llm-providers/        # Multi-provider LLM abstraction
│   ├── models/               # Mongoose document types
│   ├── shared-kernel/        # Result<T,E>, newId(), EntityPrefix, logger
│   ├── task-machine/         # XState 5 task lifecycle state machine
│   └── telemetry/            # OpenTelemetry + structured logging
├── pillars/
│   ├── api-server/           # Fastify HTTP API (SaaS + self-hosted)
│   ├── mcp-server/           # MCP stdio server (Claude Code plugin)
│   ├── sdk/                  # @bureau/sdk — TypeScript client library
│   └── workers/              # BullMQ worker processes
├── deploy/
│   ├── mongo-init.js         # MongoDB collection + index initialization
│   ├── prometheus.yml        # Prometheus scrape config
│   └── grafana/              # Grafana datasource provisioning
├── docs/
│   └── adr/                  # Architecture Decision Records
├── tests/
│   ├── load/                 # k6 load tests
│   └── security/             # Trivy + security scans
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

### Package Responsibilities

#### `@bureau/contracts`

Zod schemas untuk semua domain objects. Convention: `.strip()` on all schemas, `schemaVersion` pada semua documents.

- `TaskEnvelopeSchema` — primary domain object
- `CreateTaskRequestSchema`, `TaskDecisionRequestSchema`
- `QUEUE_NAMES` constants (e.g., `bureau.ssc.finance`, `bureau.production`)
- `Division`, `TaskStage`, `ExecutionPath` enums

#### `@bureau/shared-kernel`

Primitives yang dipakai semua packages:

- `Result<T, E>` — never throw, always return Result
- `newId(prefix)` — ULID-based IDs (`tsk_01...`, `key_01...`)
- `EntityPrefix` enum

#### `@bureau/task-machine`

XState 5 state machine untuk task lifecycle. Persistable — snapshot disimpan di MongoDB dan bisa di-restore.

#### `@bureau/agents-core`

Interface contracts untuk semua agents:

- `IHeadAgent` — orchestrates workers dalam satu division, spawned per-task
- `IWorkerAgent` — executes single unit of work, poolable

#### `@bureau/llm-providers`

Multi-provider abstraction. Mendukung: `anthropic | google | openai | deepseek | mistral | qwen`. Semantic cache via Upstash Vector (threshold 0.95).

#### `@bureau/auth`

JWT RS256 (PKCS#8 PEM) + API key management. API keys di-hash dengan `argon2`, encrypted dengan `AES-256-GCM`. Permissions: `task:read`, `task:write`, `keys:read`, `keys:write`, `provider-keys:write`.

---

## 3. Tech Stack & ADR

### Stack

| Layer             | Technology                               |
| ----------------- | ---------------------------------------- |
| Language          | TypeScript 5.4, strict mode              |
| Runtime           | Node.js 22 LTS                           |
| Monorepo          | pnpm workspaces + Turborepo              |
| HTTP Framework    | Fastify 5                                |
| Database          | MongoDB 7 (Mongoose 8)                   |
| Queue             | BullMQ 5 (Redis-backed)                  |
| State Machine     | XState 5                                 |
| Schema Validation | Zod 3                                    |
| Auth              | jose (JWT RS256) + argon2                |
| LLM               | Anthropic SDK, Google GenAI, OpenAI SDK  |
| Semantic Cache    | Upstash Vector                           |
| Dashboard         | Next.js 15 + React 19 + Tailwind CSS 3.4 |
| Observability     | OpenTelemetry + Pino logger              |
| CI/CD             | GitHub Actions                           |
| Containerization  | Docker + docker-compose                  |

### Architecture Decision Records

| ADR                                                      | Keputusan                                    | Status   |
| -------------------------------------------------------- | -------------------------------------------- | -------- |
| [ADR-001](docs/adr/ADR-001-bullmq-only.md)               | BullMQ-only, no RabbitMQ di MVP              | Accepted |
| [ADR-002](docs/adr/ADR-002-result-pattern.md)            | Result<T,E> pattern, never throw             | Accepted |
| [ADR-003](docs/adr/ADR-003-fast-path-classifier.md)      | Fast/Standard/Full path classification       | Accepted |
| [ADR-004](docs/adr/ADR-004-escalation-chain.md)          | Escalation chain pre-approved by Finance SSC | Accepted |
| [ADR-005](docs/adr/ADR-005-cache-ttl-categories.md)      | Semantic cache TTL categories                | Accepted |
| [ADR-006](docs/adr/ADR-006-schema-strict-no-reserved.md) | Strict schema, no reserved fields            | Accepted |

---

## 4. Database Schemas

Database: MongoDB `bureau`. Initialized via `deploy/mongo-init.js`.

### Collections & Indexes

#### `task_envelopes`

Primary domain object. Required fields: `taskId`, `tenantId`, `userId`, `submittedAt`, `currentStage`, `schemaVersion`.

```
Indexes:
  { taskId: 1 }                              unique
  { tenantId: 1, submittedAt: -1 }
  { currentStage: 1 }
  { "pendingDecision.expiresAt": 1 }         sparse
```

Key sub-documents:

- `budget` — `maxCostUsd`, `reservedUsd`, `consumed.{tokensIn, tokensOut, costUsd}`, `reservations[]`
- `routing` — `selectedModel`, `escalationChain[]`, `complexityScore`, `pathType`, `rationale`
- `originalRequest` — `prompt`, `constraints.{maxCostUsd, maxLatencyMs, preferredModelTier}`, `outputFormat`
- `pendingDecision` — hanya ada saat stage = `AwaitingUserDecision`

Escalation chain format:

```json
[
  { "attempt": 1, "model": "claude-haiku-4-5", "maxCostUsd": "0.10" },
  { "attempt": 2, "model": "claude-sonnet-4-6", "maxCostUsd": "0.50" },
  { "attempt": 3, "model": "claude-opus-4-6", "maxCostUsd": "2.00" }
]
```

#### `audit_trail`

Event log per task. Append-only.

```
Indexes:
  { taskId: 1 }
  { correlationId: 1 }
  { timestamp: -1 }
```

#### `agent_executions`

Per-division execution records. Tracks duration, token consumption, worker count.

```
Indexes:
  { taskId: 1 }
  { division: 1, startedAt: -1 }
```

#### `cost_analytics`

Aggregated cost events. **TTL: 365 hari** (`expireAfterSeconds: 31536000`).

```
Indexes:
  { tenantId: 1, timestamp: -1 }
  { taskId: 1 }
  { userId: 1 }
  { timestamp: 1 }    TTL index
```

#### `outbox`

Transactional outbox untuk reliable message delivery ke BullMQ. Prevents dual-write.

```
Indexes:
  { status: 1, nextAttemptAt: 1 }
  { outboxId: 1 }    unique
```

#### `api_keys`

API key store. Keys di-hash dengan argon2 sebelum simpan.

```
Indexes:
  { keyHash: 1 }     unique
  { ownerId: 1 }
```

#### `user_provider_keys`

Per-user LLM provider keys. Encrypted at rest (AES-256-GCM).

```
Indexes:
  { userId: 1, provider: 1 }    unique
```

---

## 5. API Reference

Base URL: `http://localhost:3000` (dev) atau env `API_URL`.

Authentication: `Authorization: Bearer <api_key>` atau `Authorization: Bearer <jwt_token>`.

### Tasks

#### `POST /tasks`

Submit task baru.

Headers:

- `Authorization: Bearer <key>` — requires `task:write`
- `Idempotency-Key: <string>` — optional, mencegah duplicate submission

Request body:

```json
{
  "prompt": "string (max 50000 chars)",
  "constraints": {
    "maxCostUsd": "0.50",
    "maxLatencyMs": 30000,
    "preferredModelTier": "standard"
  },
  "outputFormat": "markdown | json | text | html"
}
```

Response `201`:

```json
{
  "taskId": "tsk_01HXXX",
  "currentStage": "Submitted",
  "executionPath": "standard"
}
```

#### `GET /tasks`

List tasks untuk tenant aktif.

Query params: `limit` (default 20, max 100), `offset`, `stage`

Response `200`: array of `TaskEnvelope` (summary fields).

#### `GET /tasks/:taskId`

Full task envelope termasuk `budget`, `routing`, `originalRequest`, `pendingDecision`.

#### `GET /tasks/:taskId/status`

Compact status + pending decision (jika ada).

#### `GET /tasks/:taskId/stream`

SSE real-time stream. Content-Type: `text/event-stream`.

Event types:

```
data: {"type":"stage_change","stage":"Researching"}
data: {"type":"division_update","division":"Research","message":"..."}
data: {"type":"completed","output":"..."}
data: {"type":"error","message":"..."}
```

#### `POST /tasks/:taskId/cancel`

Cancel task. Requires `task:write`.

#### `POST /tasks/:taskId/decision`

Respond ke `AwaitingUserDecision`. Requires `task:write`.

Body:

```json
{ "action": "best_effort | add_budget | cancel" }
```

#### `POST /tasks/:taskId/feedback`

Submit quality feedback post-completion. Requires `task:write`.

### Auth — API Keys

#### `GET /auth/keys`

List API keys milik caller. Requires `keys:read`.

#### `POST /auth/keys`

Create API key baru. Requires `keys:write`.

Body:

```json
{
  "name": "my-key",
  "permissions": ["task:read", "task:write"],
  "expiresInDays": 90
}
```

Response: includes `plaintext` key — **shown once only**.

#### `DELETE /auth/keys/:keyId`

Revoke API key. Requires `keys:write`.

### Auth — Provider Keys

#### `POST /auth/provider-keys`

Store LLM provider key (encrypted at rest). Requires `provider-keys:write`.

Body:

```json
{
  "provider": "anthropic | google | openai | deepseek | mistral | qwen",
  "key": "sk-..."
}
```

#### `DELETE /auth/provider-keys/:provider`

Remove provider key. Requires `provider-keys:write`.

### Health

#### `GET /health/ready`

Readiness check — verifies MongoDB + Redis connectivity.

Response `200`:

```json
{ "status": "ok", "mongo": "ok", "redis": "ok" }
```

---

## 6. Agent System

### Dua Tipe Agent

#### SSC Agents (Shared Service Centers)

Persistent pool. Dipanggil untuk setiap task dalam pipeline.

| SSC        | Queue                   | Responsibility                               |
| ---------- | ----------------------- | -------------------------------------------- |
| Finance    | `bureau.ssc.finance`    | Budget validation, escalation chain approval |
| HR         | `bureau.ssc.hr`         | Model tier selection, compliance pre-check   |
| Compliance | `bureau.ssc.compliance` | Output compliance review                     |

SSC agents diimplementasikan di `core/src/agents/ssc/`.

#### Core Agents (per task)

Spawned ephemeral per task. Satu instance per task per division.

| Division   | Queue               | Responsibility                                 |
| ---------- | ------------------- | ---------------------------------------------- |
| CEO        | `bureau.csuite.ceo` | Task orchestration, division routing           |
| Research   | `bureau.research`   | Information gathering, context building        |
| Production | `bureau.production` | Primary content generation                     |
| QA         | `bureau.qa`         | Quality assessment, pass/fail + retry decision |
| Formatting | `bureau.formatting` | Output formatting (markdown/json/html/text)    |

Core agents diimplementasikan di `core/src/agents/core/` dan `core/src/agents/csuite/`.

### Agent Interface

Semua agents implement `IHeadAgent` dari `@bureau/agents-core`:

```typescript
interface IHeadAgent {
  readonly division: Division;
  readonly agentId: string;
  execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>>;
}
```

**Rules:**

- Never throw — selalu return `Result<T, E>`
- Check `ctx.signal.aborted` sebelum operasi LLM yang mahal
- Idempotent — bisa di-retry tanpa side effects

### Menambahkan Agent Baru

1. Buat class yang implements `IHeadAgent` di `core/src/agents/`
2. Export dari `core/src/agents/<category>/index.ts`
3. Tambahkan queue name ke `QUEUE_NAMES` di `@bureau/contracts`
4. Daftarkan worker di `pillars/workers/src/`
5. Tambahkan stage baru ke `TaskStage` di `@bureau/contracts` jika diperlukan
6. Update `taskMachine` di `@bureau/task-machine` untuk state transition baru

---

## 7. Task State Machine

Diimplementasikan dengan XState 5 di `@bureau/task-machine`.

### State Diagram

```
Submitted
    │
    ▼ (SSC_READY)
Preparing ─────────────────────────────────────────────┐
    │                                                   │
    ▼ (RESEARCH_COMPLETE)                               │
Researching ────────────────────────────────────────────│
    │                                                   │
    ▼ (RESEARCH_COMPLETE)                               │
Producing ──────────────────────┐                       │
    │                           │                       │
    ▼ (PRODUCTION_COMPLETE)     │ (QA_FAILED, canEscalate)
Reviewing                       │                       │
    │                           │                       │
    ├── QA_PASSED ──────────────┘ (back to Producing    │
    │              with higher model)                   │
    │                                                   │
    ▼ (QA_PASSED, retries exhausted OR fast path)      │
Formatting                                              │
    │                                                   │
    ▼ (FORMATTING_COMPLETE)                             │
Completed                                               │
                                                        │
    ┌───────────────────────────────────────────────────┘
    │ (BUDGET_INSUFFICIENT_FOR_ESCALATION)
    ▼
AwaitingUserDecision (24h timeout)
    │
    ├── USER_DECISION: best_effort → Formatting
    ├── USER_DECISION: add_budget  → Producing (with new budget)
    ├── USER_DECISION: cancel      → Cancelled
    └── DECISION_TIMEOUT           → Formatting (best_effort default)

[any state] ─── CANCEL event ──────────────────────────▶ Cancelled
[any state] ─── ERROR / MAX_RETRIES_EXCEEDED ──────────▶ Failed
```

### Key Design Decisions

- **QA max retries:** 3 kali. Setelah itu → `MAX_RETRIES_EXCEEDED` → `Failed`
- **Fast path:** Research stage di-skip, QA di-skip, langsung Producing → Formatting
- **Finance always consulted:** Bahkan di fast path, Finance SSC memvalidasi budget
- **AwaitingUserDecision timeout:** 24 jam. Default action: `best_effort`
- **Snapshot persistence:** Machine snapshot disimpan di `task_envelopes.machineSnapshot` untuk recovery setelah crash

### TaskContext Fields

```typescript
interface TaskContext {
  taskId: string;
  tenantId: string;
  executionPath: "fast" | "standard" | "full";
  selectedModel: string | null;
  escalationChain: Array<{
    attempt: number;
    model: string;
    maxCostUsd: string;
  }>;
  currentAttempt: number;
  productionOutput: string | null;
  qaFailureReason: string | null;
  retryCount: { production: number; qa: number };
  finalOutput: string | null;
  outputQuality: "best_effort" | "standard" | null;
  pendingDecision: PendingDecision | null;
  error: string | null;
}
```

---

## 8. Dashboard Frontend

Stack: Next.js 15, React 19, TypeScript 5.4, Tailwind CSS 3.4, SWR.

Lokasi: `apps/dashboard/`.

### Design Tokens

Dark mode enterprise theme. Defined di `tailwind.config.ts`:

```
base     #080808   body background
surface  #111111   cards, sidebar
raised   #1a1a1a   inputs, hover states
border   #262626   all borders
primary  #ededed   primary text
secondary #888888  secondary text
muted    #555555   disabled/muted
brand-500 #3b82f6  primary brand color
brand-400 #60a5fa  lighter brand
running  #8b5cf6   purple — AI active state
success  #10b981
warning  #f59e0b
danger   #ef4444
```

### Component Map

```
src/components/
├── Sidebar.tsx              # Nav, health status dot, branding
├── StageBadge.tsx           # Color-coded stage pill
├── MetricsRow.tsx           # 4 stat cards (Total/Running/Completed/Success Rate)
├── TaskList.tsx             # SWR "tasks", filter pills, dark table
├── StageProgress.tsx        # Horizontal segmented progress bar
├── DivisionCards.tsx        # Active division glow + scanline + typing effect
├── DecisionPanel.tsx        # AwaitingUserDecision countdown + actions
├── AgentThinkingDots.tsx    # ◈ ◈ ◈ animated thinking indicator
├── TerminalLog.tsx          # Terminal-style event log (JetBrains Mono)
├── StageOverlay.tsx         # Full-viewport stage transition overlay
└── settings/
    ├── ConnectionTab.tsx    # API URL + key settings
    ├── ApiKeysTab.tsx       # Create/list/revoke API keys
    └── ProviderKeysTab.tsx  # LLM provider key management
```

### Hooks (tidak dimodifikasi)

- `useTaskStream(taskId)` — SSE subscription, returns `{ stream, isRunning, activeDivision, events }`
- `useSettings()` — localStorage settings, returns `{ settings, save }`

### Data Fetching Pattern

`MetricsRow` dan `TaskList` share SWR key `"tasks"` — zero double-fetch:

```typescript
// Keduanya pakai key yang sama
useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 10000 });
```

### Provider Key State

Backend tidak punya `GET /auth/provider-keys` endpoint. Status di-track di localStorage:

```typescript
const STORAGE_KEY = "bureau_provider_keys_status";
// Format: { anthropic: boolean, google: boolean, openai: boolean, ... }
```

---

## 9. Development Guide

### Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose
- MongoDB Atlas account (atau local Docker MongoDB)

### Setup

```bash
# Clone dan install
git clone <repo>
cd bureau
pnpm install

# Copy env
cp .env.example .env
# Edit .env — isi MONGO_URI, REDIS_URL, LLM keys

# Generate JWT keys
mkdir -p secrets
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem

# Generate API key encryption key
openssl rand -hex 32
# Paste ke .env sebagai API_KEY_ENCRYPTION_KEY

# Start infra (Redis, Prometheus, Grafana)
docker-compose up -d redis prometheus grafana

# Build semua packages
pnpm build

# Start API server (dev mode)
pnpm --filter @bureau/api-server dev

# Start workers
pnpm --filter @bureau/workers dev

# Start dashboard
pnpm --filter @bureau/dashboard dev
```

### Conventions

#### Commit Messages

Conventional Commits enforced via commitlint:

```
feat(scope): description       # New feature
fix(scope): description        # Bug fix
refactor(scope): description   # Refactoring
test(scope): description       # Tests
docs(scope): description       # Documentation
chore(scope): description      # Maintenance
```

#### TypeScript

- Strict mode diaktifkan (`tsconfig.base.json`)
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- Semua function public harus punya return type explicit

#### Error Handling

Gunakan `Result<T, E>` dari `@bureau/shared-kernel`. Jangan throw di agent implementations:

```typescript
import type { Result } from "@bureau/shared-kernel";

// ✅ Benar
async function doWork(): Promise<Result<Output, Error>> {
  try {
    const result = await someOp();
    return { ok: true, value: result };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
}

// ❌ Salah — jangan throw di agent
async function doWork() {
  throw new Error("...");
}
```

#### ID Generation

```typescript
import { newId, EntityPrefix } from "@bureau/shared-kernel";

const taskId = newId(EntityPrefix.TASK); // "tsk_01HXXX..."
const keyId = newId(EntityPrefix.KEY); // "key_01HXXX..."
```

### Testing

```bash
# Unit tests (semua packages)
pnpm test

# Single package
pnpm --filter @bureau/contracts test

# Watch mode
pnpm --filter @bureau/task-machine test --watch

# Coverage
pnpm test --coverage
```

Test framework: Vitest. Coverage target: 80%+.

#### Test Conventions

- Unit tests: `*.test.ts` co-located dengan source
- Integration tests: `tests/` di root atau package
- Agent tests: mock LLM providers, jangan hit real API di CI
- State machine tests: gunakan XState `createActor` dengan event sequences

### Adding a New Package

```bash
# Buat directory
mkdir packages/my-package
cd packages/my-package

# Init
pnpm init

# Edit package.json — gunakan pola yang sama seperti packages lain:
# - name: "@bureau/my-package"
# - exports: "./src/index.ts"
# - references tsconfig.base.json
```

Tambahkan ke `turbo.json` pipeline jika perlu build step.

### Pre-commit Hooks

Husky menjalankan otomatis:

1. `tsc --noEmit` — typecheck
2. ESLint + Biome lint
3. Prettier format check

Fix format issues:

```bash
npx prettier --write "apps/dashboard/src/**/*.tsx"
```

---

## 10. Deployment Guide

### Docker Compose (Self-Hosted)

```bash
# Production build
docker-compose -f docker-compose.yml up -d

# Services yang berjalan:
# - mongo:27017     MongoDB
# - redis:6379      Redis
# - api-server:3000 Bureau API
# - workers         BullMQ workers
# - dashboard:3001  Next.js dashboard
# - prometheus:9090
# - grafana:3000
```

### Environment Variables Reference

| Variable                      | Required | Description                            |
| ----------------------------- | -------- | -------------------------------------- |
| `NODE_ENV`                    | yes      | `development` / `production`           |
| `MONGO_URI`                   | yes      | MongoDB connection string              |
| `REDIS_URL`                   | yes      | Redis connection string                |
| `JWT_PRIVATE_KEY_PATH`        | yes      | Path ke PKCS#8 PEM private key         |
| `JWT_PUBLIC_KEY_PATH`         | yes      | Path ke PEM public key                 |
| `JWT_ISSUER`                  | yes      | JWT issuer URL                         |
| `JWT_EXPIRY`                  | yes      | JWT expiry (e.g., `1h`)                |
| `API_KEY_ENCRYPTION_KEY`      | yes      | 32-byte hex untuk AES-256-GCM          |
| `ANTHROPIC_API_KEY`           | depends  | Required untuk Anthropic models        |
| `GEMINI_API_KEY`              | depends  | Required untuk Google models           |
| `OPENAI_API_KEY`              | depends  | Required untuk OpenAI models           |
| `DEEPSEEK_API_KEY`            | depends  | Required untuk DeepSeek models         |
| `MISTRAL_API_KEY`             | depends  | Required untuk Mistral models          |
| `BULLMQ_CONCURRENCY`          | no       | Default: 8                             |
| `MAX_LLM_CONCURRENCY`         | no       | Default: 3                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no       | OpenTelemetry collector                |
| `UPSTASH_VECTOR_REST_URL`     | no       | Semantic cache (optional)              |
| `RESEND_API_KEY`              | no       | Email notifications (AwaitingDecision) |
| `API_PORT`                    | no       | Default: 3000                          |
| `DIVISION_NAME`               | no       | Worker division name                   |

### Secrets Management

Production: gunakan **Doppler** (config di `.doppler/`). Jangan commit `.env` ke git.

Development: gunakan `.env` (sudah di `.gitignore`).

### Monitoring

- **Prometheus:** scrapes `/metrics` dari api-server dan workers
- **Grafana:** dashboards di `deploy/grafana/`
- **OpenTelemetry:** traces dikirim ke OTLP endpoint (Jaeger/Tempo)
- **Structured logs:** Pino JSON logs, bisa di-ingest ke Loki

---

## 11. SLO Targets

| Metric                   | Target  | Notes                          |
| ------------------------ | ------- | ------------------------------ |
| API p99 latency          | < 200ms | Untuk non-LLM endpoints        |
| Task submission p99      | < 500ms | Termasuk DB write + queue push |
| SSE first event          | < 2s    | Dari submission                |
| Fast path completion     | < 10s   | End-to-end                     |
| Standard path completion | < 60s   | End-to-end                     |
| Full path completion     | < 120s  | End-to-end                     |
| API uptime               | 99.9%   | Monthly                        |
| Worker recovery          | < 30s   | Setelah crash restart          |

Worker stalled detection: `stalledInterval: 30000ms`, `maxStalledCount: 2`. Setelah 2 stalls, job masuk dead letter queue.

---

_Dokumentasi ini diperbarui seiring perkembangan platform. Untuk riwayat keputusan arsitektur, lihat `docs/adr/`._
