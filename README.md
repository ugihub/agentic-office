# Agentic Office — Multi-Agent AI Platform

[![CI](https://github.com/ugihub/agentic-office/actions/workflows/ci.yml/badge.svg)](https://github.com/ugihub/agentic-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)

**Agentic Office** adalah platform multi-agent AI yang mensimulasikan struktur korporat — CEO, HR, Finance, Compliance, Production, QA, dan Marketing — untuk mengkoordinasikan tugas kompleks secara otomatis via satu API call atau plugin Claude Code.

---

## Daftar Isi

- [Cara Penggunaan](#cara-penggunaan)
- [Dependencies](#dependencies)
- [Instalasi & Setup](#instalasi--setup)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Menggunakan TypeScript SDK](#menggunakan-typescript-sdk)
- [Menggunakan MCP Plugin (Claude Code)](#menggunakan-mcp-plugin-claude-code)
- [Menggunakan REST API](#menggunakan-rest-api)
- [Arsitektur](#arsitektur)
- [Struktur Repo](#struktur-repo)
- [Divisions (Agent)](#divisions-agent)
- [Observability](#observability)
- [Contributing](#contributing)

---

## Cara Penggunaan

Ada **3 cara** menggunakan Agentic Office:

| Cara                   | Cocok untuk                                    | Prasyarat                |
| ---------------------- | ---------------------------------------------- | ------------------------ |
| **MCP Plugin**         | Pengguna Claude Code                           | Node.js + API key        |
| **TypeScript SDK**     | Developer yang ingin integrasi ke kode sendiri | Node.js                  |
| **Self-hosted Docker** | Tim yang ingin infrastruktur sendiri           | Docker + MongoDB + Redis |

---

## Dependencies

### Sistem (wajib diinstall manual)

| Dependency         | Versi Minimum | Instalasi                                         |
| ------------------ | ------------- | ------------------------------------------------- |
| **Node.js**        | >= 20.0.0     | [nodejs.org](https://nodejs.org)                  |
| **pnpm**           | >= 9.0.0      | `npm install -g pnpm@9`                           |
| **Docker**         | >= 24.0       | [docker.com](https://docs.docker.com/get-docker/) |
| **Docker Compose** | >= 2.0        | Sudah include di Docker Desktop                   |
| **Git**            | >= 2.30       | [git-scm.com](https://git-scm.com)                |

> **Opsional (untuk load testing):**
>
> - [k6](https://k6.io/docs/getting-started/installation/) — load testing tool
> - [Trivy](https://trivy.dev) — security scanner

### Layanan Eksternal (perlu API key)

| Layanan                      | Keperluan         | Wajib?                      |
| ---------------------------- | ----------------- | --------------------------- |
| **Anthropic Claude**         | LLM utama         | Ya (minimal satu LLM)       |
| **MongoDB Atlas**            | Database produksi | Opsional (Docker untuk dev) |
| **Redis / Upstash**          | Queue & cache     | Ya (Docker untuk dev)       |
| **Resend** atau **Postmark** | Email notifikasi  | Opsional                    |
| **Upstash Vector**           | Semantic cache    | Opsional                    |
| **OpenAI**                   | LLM alternatif    | Opsional                    |
| **Gemini**                   | LLM alternatif    | Opsional                    |
| **Mistral**                  | LLM alternatif    | Opsional                    |
| **DeepSeek**                 | LLM alternatif    | Opsional                    |

### Package npm (otomatis via `pnpm install`)

Package utama yang digunakan proyek ini:

```
fastify ^5.0.0          — HTTP API server (highload, production-grade)
@fastify/cors           — CORS handling
@fastify/helmet         — Security headers
@fastify/rate-limit     — Rate limiting
bullmq ^5.0.0           — Job queue di atas Redis
mongoose ^8.0.0         — MongoDB ODM
zod ^3.0.0              — Schema validation & type safety
@modelcontextprotocol/sdk — MCP stdio server
@ai-sdk/anthropic       — Vercel AI SDK untuk Anthropic
@opentelemetry/*        — Distributed tracing (Jaeger)
pino ^9.0.0             — Structured JSON logging
vitest ^1.0.0           — Unit & integration testing
turbo ^2.0.0            — Monorepo build orchestration
typescript ^5.4.0       — TypeScript compiler
```

---

## Instalasi & Setup

### 1. Clone Repository

```bash
git clone https://github.com/ugihub/agentic-office.git
cd agentic-office
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Buat File Environment

```bash
cp .env.example .env
```

Edit `.env` dengan nilai yang sesuai:

```env
# ── Core ─────────────────────────────────────────────────────────
NODE_ENV=development
LOG_LEVEL=debug

# ── Database ─────────────────────────────────────────────────────
# Development: gunakan MongoDB dari Docker (lihat step 4)
MONGO_URI=mongodb://bureau:bureau_secret@localhost:27017/bureau?authSource=admin

# Production: gunakan MongoDB Atlas
# MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/bureau

# ── Redis ─────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Auth ──────────────────────────────────────────────────────────
# Generate JWT keys dulu (lihat step selanjutnya)
JWT_PRIVATE_KEY_PATH=./secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=./secrets/jwt-public.pem
JWT_ISSUER=https://auth.bureau.id
JWT_EXPIRY=1h

# Generate dengan: openssl rand -hex 32
API_KEY_ENCRYPTION_KEY=your-32-byte-hex-here

# ── LLM Providers (isi minimal SATU) ─────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxx
# OPENAI_API_KEY=sk-xxxx
# GEMINI_API_KEY=AIzaxxxx
# MISTRAL_API_KEY=xxxx
# DEEPSEEK_API_KEY=xxxx

# ── Email (opsional — untuk notifikasi eskalasi) ──────────────────
RESEND_API_KEY=re_xxxx

# ── Observability ─────────────────────────────────────────────────
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=bureau

# ── Worker Config ─────────────────────────────────────────────────
BULLMQ_CONCURRENCY=4
MAX_LLM_CONCURRENCY=2
BULLMQ_LOCK_DURATION=60000
BULLMQ_STALLED_INTERVAL=30000
BULLMQ_MAX_STALLED_COUNT=2

# ── Ports ─────────────────────────────────────────────────────────
API_PORT=3001
MCP_PORT=3002
```

### 4. Generate JWT Keys

```bash
mkdir -p secrets

# Generate RSA key pair
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem

# Generate encryption key (copy hasilnya ke API_KEY_ENCRYPTION_KEY di .env)
openssl rand -hex 32
```

### 5. Jalankan Infrastruktur (Docker)

```bash
# Start Redis + MongoDB + Jaeger (tracing)
docker compose up -d redis mongo jaeger

# Opsional: Prometheus + Grafana untuk monitoring
docker compose up -d prometheus grafana

# Verifikasi semua container running
docker compose ps
```

| Service    | URL                      | Credentials            |
| ---------- | ------------------------ | ---------------------- |
| MongoDB    | `localhost:27017`        | bureau / bureau_secret |
| Redis      | `localhost:6379`         | —                      |
| Jaeger UI  | `http://localhost:16686` | —                      |
| Prometheus | `http://localhost:9090`  | —                      |
| Grafana    | `http://localhost:3002`  | admin / bureau_grafana |

### 6. Build Semua Package

```bash
pnpm build
```

Output: 16 packages ter-compile ke `dist/` masing-masing.

### 7. Jalankan Tests

```bash
# Semua tests (135 test cases)
pnpm test

# Test package spesifik
pnpm --filter "@bureau/core" test
pnpm --filter "@bureau/shared-kernel" test

# Watch mode
pnpm --filter "@bureau/core" test -- --watch
```

---

## Menjalankan Secara Lokal

Butuh **3 terminal** untuk menjalankan stack penuh:

**Terminal 1 — API Server**

```bash
pnpm --filter "@bureau/api-server" dev
# API berjalan di http://localhost:3001
```

**Terminal 2 — Background Workers**

```bash
pnpm --filter "@bureau/workers" dev
# Workers memproses BullMQ jobs (email, outbox, decision timeout)
```

**Terminal 3 — (Opsional) MCP Server**

```bash
pnpm --filter "@bureau/mcp-server" dev
# MCP stdio server untuk Claude Code
```

### Verifikasi API Berjalan

```bash
# Liveness check
curl http://localhost:3001/health/live

# Readiness check (MongoDB + Redis)
curl http://localhost:3001/health/ready
```

Response sukses:

```json
{
  "status": "ready",
  "checks": { "mongodb": "ok", "redis": "ok" },
  "timestamp": "2026-05-07T00:00:00.000Z"
}
```

---

## Menggunakan TypeScript SDK

### Install SDK

```bash
npm install @bureau/sdk
# atau
pnpm add @bureau/sdk
```

### Submit Task dan Poll Status

```typescript
import { BureauClient } from "@bureau/sdk";

const bureau = new BureauClient({
  apiKey: process.env.BUREAU_API_KEY,
  baseUrl: "http://localhost:3001", // atau https://api.bureau.id
});

// Submit task
const task = await bureau.submitTask({
  prompt:
    "Analisa laporan keuangan Q2 dan identifikasi anomali di atas Rp 10 juta",
  division: "finance",
  budget: { amount: "50000", currency: "IDR" },
  priority: "high",
});

console.log("Task ID:", task.taskId);

// Tunggu selesai dengan callback status
const result = await bureau.waitForTask(task.taskId, {
  onStatus: (status) => {
    console.log(`Stage: ${status.currentStage} — ${status.progress}%`);
  },
  timeoutMs: 300_000, // 5 menit
});

console.log("Output:", result.finalOutput);
```

### Stream Progress via SSE

```typescript
import { BureauClient } from "@bureau/sdk";

const bureau = new BureauClient({ apiKey: process.env.BUREAU_API_KEY });

const task = await bureau.submitTask({
  prompt: "Buat rencana rekrutmen untuk 10 engineer dalam 3 bulan",
  division: "hr",
});

// Stream event secara realtime
for await (const event of bureau.streamTask(task.taskId)) {
  switch (event.event) {
    case "task.stage_changed":
      console.log("Stage:", event.data.stage);
      break;
    case "task.division_progress":
      console.log("Division:", event.data.division, "—", event.data.message);
      break;
    case "task.decision_required":
      // Agent butuh keputusan manusia
      console.log("Keputusan diperlukan:", event.data.question);
      await bureau.submitDecision(task.taskId, {
        action: "approve",
        reason: "Disetujui oleh manager",
      });
      break;
    case "task.completed":
      console.log("Selesai:", event.data.output);
      break;
    case "task.failed":
      console.error("Gagal:", event.data.error);
      break;
  }
}
```

### Manage API Keys

```typescript
const bureau = new BureauClient({ apiKey: process.env.BUREAU_ADMIN_KEY });

// Buat API key baru
const newKey = await bureau.createApiKey({
  name: "Production App",
  expiresAt: new Date("2027-01-01"),
});

console.log("Key baru:", newKey.key); // Hanya muncul sekali!

// List semua keys
const keys = await bureau.listApiKeys();

// Hapus key
await bureau.deleteApiKey(newKey.id);
```

---

## Menggunakan MCP Plugin (Claude Code)

Plugin ini memungkinkan Claude Code mendelegasikan tugas ke Agentic Office.

### Install & Konfigurasi

**Cara 1 — Auto install via Claude Code CLI:**

```bash
claude mcp add bureau -- npx @bureau/mcp-server
```

Kemudian set environment variable:

```bash
claude mcp edit bureau
# Tambahkan env:
#   BUREAU_API_URL: http://localhost:3001
#   BUREAU_API_KEY: bureau_live_...
```

**Cara 2 — Manual (self-hosted):**

Edit `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "bureau": {
      "command": "node",
      "args": ["/path/to/agentic-office/pillars/mcp-server/dist/bin.js"],
      "env": {
        "BUREAU_API_URL": "http://localhost:3001",
        "BUREAU_API_KEY": "bureau_live_your_key_here"
      }
    }
  }
}
```

### Tools yang Tersedia di Claude Code

Setelah konfigurasi, Claude Code dapat menggunakan tool berikut:

```
bureau_submit_task    — Kirim task ke Agentic Office
bureau_task_status    — Cek progres task
bureau_cancel_task    — Batalkan task yang berjalan
bureau_task_decision  — Balas eskalasi AwaitingUserDecision
```

### Contoh Penggunaan di Claude Code

Setelah MCP terkonfigurasi, cukup minta Claude Code:

```
"Delegasikan ke bureau: buat laporan analisis kompetitor untuk produk kami
 vs Tokopedia, Shopee, dan Lazada. Budget maksimum Rp 50.000."
```

Claude Code akan otomatis:

1. Submit task ke Agentic Office
2. Monitor progres
3. Notifikasi jika ada eskalasi yang perlu keputusan Anda
4. Return hasil akhir

---

## Menggunakan REST API

Base URL: `http://localhost:3001` (dev) atau `https://api.bureau.id` (produksi)

### Authentication

Semua request membutuhkan API key di header:

```
X-Api-Key: bureau_live_your_key_here
```

### Endpoints

#### Submit Task

```http
POST /tasks
Content-Type: application/json
X-Api-Key: bureau_live_xxx
Idempotency-Key: unique-request-id-123

{
  "prompt": "Buat proposal partnership dengan 3 vendor cloud terbesar",
  "division": "marketing",
  "priority": "normal",
  "budget": {
    "amount": "100000",
    "currency": "IDR"
  },
  "constraints": {
    "maxLlmCalls": 20,
    "timeoutMs": 120000
  }
}
```

Response:

```json
{
  "taskId": "01J2XYZABC...",
  "status": "queued",
  "estimatedDurationMs": 45000
}
```

#### Get Task Status

```http
GET /tasks/:taskId
X-Api-Key: bureau_live_xxx
```

Response:

```json
{
  "taskId": "01J2XYZABC...",
  "status": "running",
  "currentStage": "production",
  "progress": 65,
  "divisions": {
    "ceo": "completed",
    "finance": "completed",
    "production": "running",
    "qa": "pending"
  },
  "createdAt": "2026-05-07T10:00:00.000Z",
  "updatedAt": "2026-05-07T10:01:30.000Z"
}
```

#### Stream Task Events (SSE)

```http
GET /tasks/:taskId/stream
X-Api-Key: bureau_live_xxx
Accept: text/event-stream
```

#### Cancel Task

```http
DELETE /tasks/:taskId
X-Api-Key: bureau_live_xxx
```

#### Submit Decision (Eskalasi)

```http
POST /tasks/:taskId/decision
X-Api-Key: bureau_live_xxx
Content-Type: application/json

{
  "action": "approve",
  "reason": "Disetujui setelah review manual"
}
```

#### Health Checks

```http
GET /health/live    # Liveness — selalu 200 jika proses berjalan
GET /health/ready   # Readiness — cek MongoDB + Redis
```

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│  Claude Code (MCP)  │  TypeScript SDK  │  REST API / curl   │
└──────────┬──────────┴────────┬─────────┴──────────┬─────────┘
           │                  │                     │
           ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│               Fastify API Server (:3001)                    │
│  Auth · Rate Limit · Tenant Isolation · OpenTelemetry OTLP  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Outbox → BullMQ jobs
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                       │
│      XState 5 state machine · AwaitingUserDecision          │
└──────┬─────────┬─────────┬─────────┬─────────┬─────────────┘
       │         │         │         │         │
       ▼         ▼         ▼         ▼         ▼
   CEO Agent  HR SSC  Finance SSC  Compliance  QA Agent
   (routing)  (hire)  (budget)     (policy)   (review)
       │         │         │         │         │
       └─────────┴─────────┴─────────┴─────────┘
                           │
               ┌───────────┼───────────┐
               ▼           ▼           ▼
          MongoDB        Redis      Upstash Vector
        (state/outbox)  (BullMQ)   (semantic cache)
```

### Keputusan Arsitektur Utama

- **`Result<T, E>` everywhere** — tidak ada `throw` di business logic; semua error adalah typed value
- **BullMQ only** — satu teknologi queue (ADR-001); tidak ada RabbitMQ/SQS
- **Financial TTL = 0** — respons LLM kategori finance tidak pernah di-cache (ADR-003)
- **Atomic budget reservation** — `findOneAndUpdate + $gte`, tanpa race condition
- **Distroless Docker** — image minimal, non-root, tanpa shell
- **Outbox pattern** — write MongoDB + enqueue BullMQ secara atomic; tidak ada job yang hilang
- **`@bureau/core` framework-free** — nol import Fastify/BullMQ di domain logic

---

## Struktur Repo

```
agentic-office/
├── packages/
│   ├── shared-kernel/      # Result<T,E>, ULID, Money, error hierarchy
│   ├── contracts/          # Zod schemas — source of truth semua domain object
│   ├── auth/               # JWT + API key management
│   ├── llm-providers/      # Adapter LLM (Anthropic, OpenAI, Gemini, dll.)
│   ├── infra-mongo/        # MongoDB repositories + Outbox pattern
│   ├── infra-messaging/    # BullMQ worker base
│   ├── task-machine/       # XState state machine task lifecycle
│   ├── cost-analytics/     # Tracking biaya LLM per division
│   ├── models/             # Mongoose models
│   ├── telemetry/          # Pino logger + OpenTelemetry
│   └── agents-core/        # Interface & kontrak agent
│
├── core/                   # @bureau/core — orchestration (ZERO framework imports)
│   └── src/agents/
│       ├── ssc/            # HR, Finance, IT, Compliance (Shared Service Centers)
│       ├── csuite/         # CEO Agent
│       └── core/           # Marketing, QA, Research, Production, Project Manager
│
├── pillars/
│   ├── api-server/         # Fastify 5 REST API (port 3001)
│   ├── workers/            # Background jobs (email, outbox, timeout)
│   ├── mcp-server/         # MCP stdio plugin untuk Claude Code
│   └── sdk/                # TypeScript client SDK (@bureau/sdk)
│
├── apps/
│   └── dashboard/          # Web dashboard (dalam pengembangan)
│
├── tests/
│   ├── e2e/                # End-to-end scenarios
│   ├── performance/        # Benchmark latency & throughput
│   ├── load/               # k6 load tests
│   ├── chaos/              # Chaos engineering (Redis restart, dll.)
│   └── security/           # Security scan scripts
│
├── deploy/
│   ├── Dockerfile.api-server
│   ├── Dockerfile.workers
│   ├── helm/bureau/        # Kubernetes Helm chart
│   ├── argocd/             # GitOps ArgoCD applications
│   ├── grafana/            # Dashboard provisioning
│   ├── prometheus.yml      # Metrics scrape config
│   └── scripts/            # Backup & deployment scripts
│
└── docs/
    ├── adr/                # Architecture Decision Records (ADR-001 s/d ADR-006)
    └── runbook.md          # On-call operational runbook
```

---

## Divisions (Agent)

| Division       | Tanggung Jawab                                   | SLO                      |
| -------------- | ------------------------------------------------ | ------------------------ |
| **CEO**        | Routing task, keputusan eskalasi                 | Escalation rate < 5%     |
| **HR**         | Rekrutmen, lifecycle agent, registry kapabilitas | Agent availability > 99% |
| **Finance**    | Reservasi budget, tracking pengeluaran           | Atomic reservation 100%  |
| **Compliance** | Policy enforcement, audit log                    | Zero policy bypass       |
| **Production** | Eksekusi task, retry logic                       | p95 latency < 2s         |
| **QA**         | Validasi output, quality gates                   | Pass rate > 95%          |
| **Marketing**  | Generasi laporan, konten async                   | Completion rate > 98%    |
| **IT**         | Infrastruktur, tooling internal                  | Uptime > 99.9%           |

---

## Observability

Stack monitoring bawaan:

- **Jaeger** (`http://localhost:16686`) — distributed tracing via OpenTelemetry
- **Prometheus** (`http://localhost:9090`) — metrics collection
- **Grafana** (`http://localhost:3002`) — dashboard visualisasi

Metrics yang dimonitor:

- Fast path ratio — % task tanpa eskalasi (SLO: ≥ 80%)
- AwaitingUserDecision resolution rate — % eskalasi selesai < 24 jam (SLO: ≥ 70%)
- LLM cost burn rate — biaya per provider per division
- Queue depth — saturasi BullMQ per division
- Semantic cache hit rate — efektivitas Upstash Vector
- p50/p95/p99 latency — per endpoint

---

## SLOs

| SLO                             | Target             | Alert                     |
| ------------------------------- | ------------------ | ------------------------- |
| API error rate                  | < 1%               | 5x burn rate selama 1 jam |
| POST /tasks p99 latency         | < 2 detik          | > 3 detik selama 5 menit  |
| AwaitingUserDecision resolution | ≥ 70% dalam 24 jam | < 60% → PagerDuty         |
| Fast path adoption              | ≥ 80% task         | < 70% → review            |
| Spending anomaly                | 0 unreviewed       | Langsung alert            |

---

## Perintah Development

```bash
# Install dependencies
pnpm install

# Build semua package
pnpm build

# Jalankan semua tests
pnpm test

# TypeScript check
pnpm typecheck

# Lint
pnpm lint

# Format kode
pnpm format

# Bersihkan semua dist/ dan node_modules
pnpm clean

# Test satu package
pnpm --filter "@bureau/core" test
pnpm --filter "@bureau/shared-kernel" test

# Load test (butuh k6 terinstall)
pnpm --filter "@bureau/tests" load:main

# Security scan (butuh Trivy terinstall)
pnpm --filter "@bureau/tests" security:scan
```

---

## Konvensi Commit

Menggunakan [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: tambah semantic cache invalidation endpoint
fix: perbaiki race condition di Finance atomic reservation
docs: update runbook untuk queue depth alert
chore: upgrade BullMQ ke 5.2.0
test: tambah chaos scenario untuk Redis restart
```

Commit dilint otomatis via `commitlint` di pre-commit hook.

---

## Contributing

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan lengkap.

**Rules yang tidak boleh dilanggar:**

1. `@bureau/core` harus nol import framework
2. Semua error pakai `Result<T, E>` — tidak boleh `throw` di business logic
3. Financial prompts dilarang di-cache
4. Budget reservation wajib atomic `findOneAndUpdate`
5. Semua state di MongoDB — Redis hanya ephemeral
6. Outbox pattern wajib untuk semua BullMQ enqueue
7. `correlationId` dan `taskId` di setiap log entry

---

## Lisensi

[MIT](LICENSE) — Copyright 2026 Agentic Office Team
