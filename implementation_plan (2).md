# Bureau — Implementation Plan

## Platform Multi-Agent AI Otonom dengan Arsitektur Perusahaan Korporat

**Versi:** 4.0 (Post-Architecture Review)
**Tanggal:** Mei 2026
**Mata Kuliah:** Pemrograman 3

> Versi ini mencerminkan hasil diskusi arsitektur mendalam yang merevisi beberapa keputusan dari v3.0.
> Semua perubahan dari versi sebelumnya ditandai dengan catatan **[REVISED]** atau **[NEW]**.

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Visi dan Tiga Pilar Distribusi](#2-visi-dan-tiga-pilar-distribusi)
3. [Tumpukan Teknologi](#3-tumpukan-teknologi)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Struktur Agent dan Worker](#5-struktur-agent-dan-worker)
6. [Skema MongoDB](#6-skema-mongodb)
7. [Spesifikasi API](#7-spesifikasi-api)
8. [Strategi Kontrol Biaya LLM](#8-strategi-kontrol-biaya-llm)
9. [Fase Pengembangan](#9-fase-pengembangan)
10. [Poin Kritis yang Wajib Diperhatikan](#10-poin-kritis-yang-wajib-diperhatikan)
11. [ADR Template](#11-adr-template)
12. [Checklist Production Readiness](#12-checklist-production-readiness)

---

## 1. Ringkasan Eksekutif

**Bureau** adalah platform multi-agent AI yang mensimulasikan struktur perusahaan korporat nyata. Ketika user mengirim satu prompt, sistem mendistribusikan pekerjaan ke tujuh divisi AI yang bekerja secara hierarkis dan paralel.

Sistem ini dirancang dengan tiga cara distribusi sekaligus:

- **Plugin** untuk Claude Code, Gemini CLI, dan Codex via MCP
- **SaaS** dengan API key dan billing bulanan
- **Open Source** self-hosted via GitHub

Ketiganya menggunakan satu paket inti yang sama: `@bureau/core`.

**Filosofi implementasi [NEW]:** Abstraksi yang baik ditemukan, bukan dirancang. Setiap generalisasi baru harus punya dua contoh konkret sebelum diabstraksi. Pertanyaan yang ditempel di monitor: _"Apakah ini butuh ada hari ini untuk demo besok?"_

---

## 2. Visi dan Tiga Pilar Distribusi

### Konsep Inti

Fondasi filosofis sistem ini diambil dari dokumen riset **"Analisis Komprehensif Arsitektur Organisasi"**:

| Konsep dari Dokumen Riset          | Implementasi di Bureau                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Shared Services Center (SSC)       | Agent HR, Finance, Compliance, IT yang selalu hidup melayani semua proyek |
| Standard Operating Procedure (SOP) | System prompt setiap agent — instruksi permanen yang mendefinisikan peran |
| TOGAF — fase Vision ke Execution   | Urutan langkah CEO Agent saat menerima proyek baru                        |
| ERP Single Source of Truth         | MongoDB sebagai satu-satunya tempat semua state disimpan                  |
| Proses Inti vs Proses Pendukung    | Core agents (spawn per proyek) vs SSC agents (selalu hidup)               |

### Tiga Pilar

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│     PILAR 1         │  │     PILAR 2          │  │     PILAR 3         │
│     Plugin          │  │     SaaS             │  │     Open Source     │
│                     │  │                      │  │                     │
│  MCP stdio protocol │  │  REST API + API key  │  │  Self-hosted        │
│  Tidak butuh server │  │  Rp 49k/149k/349k    │  │  docker compose up  │
│  npx @bureau/mcp    │  │  Rate limiting       │  │  API key sendiri    │
│                     │  │                      │  │                     │
│  Gratis             │  │  Berbayar            │  │  Gratis selamanya   │
│  Awareness          │  │  Revenue utama       │  │  Kepercayaan        │
└──────────┬──────────┘  └──────────┬───────────┘  └──────────┬──────────┘
           │    MCP call            │    HTTP                  │  local call
           └────────────────────────┼──────────────────────────┘
                                    ▼
                         ┌─────────────────────┐
                         │    @bureau/core      │
                         │  npm package murni   │
                         │  framework-agnostic  │
                         └─────────────────────┘
```

**Prinsip terpenting:** `@bureau/core` tidak boleh mengandung import dari framework apapun.

---

## 3. Tumpukan Teknologi

### Keputusan Stack dan Justifikasinya [REVISED]

| Lapisan              | Teknologi                          | Justifikasi                                                                                                                                                                  |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime              | Node.js 20 LTS                     | Stabilitas jangka panjang, worker_threads native                                                                                                                             |
| Bahasa               | TypeScript 5.4+ (strict)           | Type safety end-to-end via shared contracts                                                                                                                                  |
| Pilar 1 — Plugin     | `@modelcontextprotocol/sdk`        | Standar MCP resmi, kompatibel Claude Code dan Gemini CLI                                                                                                                     |
| Pilar 2 — API Server | Fastify 5                          | Lebih ringan dari Express, schema-first, performa tinggi                                                                                                                     |
| Pilar 2 — Dashboard  | Next.js 15 App Router              | API dan UI dalam satu deployment, SSE native                                                                                                                                 |
| **Message Bus**      | **BullMQ (Redis 7) — saja**        | **[REVISED] RabbitMQ dihapus dari MVP. BullMQ cukup untuk semua kebutuhan antar-divisi dalam satu cluster. RabbitMQ ditambahkan nanti kalau butuh cross-cluster broadcast.** |
| Database Utama       | MongoDB Atlas (Mongoose 8)         | Dokumen bersarang dinamis, replica set, TTL index                                                                                                                            |
| Paralelisme I/O      | p-limit + Promise.all              | Concurrency control untuk panggilan LLM                                                                                                                                      |
| Paralelisme CPU      | Piscina (worker_threads)           | Thread OS sejati untuk parsing, hashing, embedding                                                                                                                           |
| Validasi             | Zod 3 — `.strip()` sebagai default | Runtime validation + TypeScript inference. Strip unknown fields, tidak error.                                                                                                |
| State Machine        | XState 5                           | Lifecycle task yang explicit dan persistable                                                                                                                                 |
| LLM Streaming        | Vercel AI SDK                      | Zero-overhead, support semua provider                                                                                                                                        |
| Resilience           | Cockatiel                          | Retry eksponensial, circuit breaker, bulkhead                                                                                                                                |
| Cache                | Redis (ioredis) + Upstash Vector   | Category-based TTL (lihat bagian 8), semantic cache 95% threshold                                                                                                            |
| Auth                 | JWT RS256 + jose                   | Token signing dengan rotasi kunci                                                                                                                                            |
| Logging              | Pino + pino-pretty                 | Structured JSON, `logger.child({ taskId, correlationId, division })`                                                                                                         |
| Telemetri            | OpenTelemetry + Jaeger             | Distributed tracing end-to-end                                                                                                                                               |
| Metrics              | Prometheus + Grafana               | Dashboard per divisi, cost burn rate per tenant                                                                                                                              |
| Email Transaksional  | **Resend atau Postmark**           | **[NEW] Untuk notifikasi AwaitingUserDecision. Satu API call, tidak perlu infrastructure email sendiri.**                                                                    |
| Monorepo             | Turborepo + pnpm workspaces        | Build cache, task pipeline, incremental build                                                                                                                                |
| Testing              | Vitest + Testcontainers + k6       | Unit, integration, load test                                                                                                                                                 |
| CI/CD                | GitHub Actions + ArgoCD            | Build ke test ke scan ke staging ke prod                                                                                                                                     |
| Secrets              | Doppler / HashiCorp Vault          | Tidak ada secret di codebase                                                                                                                                                 |
| Container            | Docker multi-stage (distroless)    | Image kurang dari 150MB, non-root, read-only fs                                                                                                                              |

### ADR: Keputusan BullMQ-only [NEW]

Lihat `docs/adr/ADR-001-bullmq-only.md`. Ringkasan: RabbitMQ dan BullMQ adalah dua sistem yang overlapping. Untuk MVP dalam satu cluster, BullMQ di atas Redis sudah cukup untuk job queue, fan-out, retry, dan dead letter. RabbitMQ ditambahkan kalau ada kebutuhan cross-cluster broadcast yang nyata, bukan spekulatif. BullMQ stalled job detection (`stalledInterval`, `lockDuration`, `maxStalledCount`) menggantikan heartbeat mechanism custom.

### Konvensi Error Handling [NEW]

Sebelum baris bisnis apapun ditulis, pattern ini dikunci di `@bureau/shared-kernel`:

```typescript
// packages/shared-kernel/src/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export async function tryAsync<T>(
  fn: () => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
```

**Aturan yang tidak bisa dilanggar:** tidak ada `throw` di business logic. Semua return `Result<T, E>`. Exceptions hanya diizinkan di infra layer (koneksi database, dsb) dan selalu di-catch di boundary.

### Konvensi Logging [NEW]

Correlation ID dan taskId harus ada dari hari pertama karena ini cross-cutting concern yang tidak bisa di-retrofit:

```typescript
// packages/telemetry/src/logger.ts
import pino from "pino";

const base = pino({ level: process.env.LOG_LEVEL ?? "info" });

export function createLogger(ctx: {
  taskId?: string;
  correlationId?: string;
  division?: string;
  agentId?: string;
}) {
  return base.child(ctx);
}

// Konvensi field name wajib konsisten di seluruh codebase:
// taskId, correlationId, division — selalu nama ini, tidak ada variasi
```

---

## 4. Arsitektur Sistem

### Struktur Repositori (Monorepo)

```
bureau/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml
│   ├── cd-staging.yml
│   └── cd-production.yml
│
├── packages/
│   ├── contracts/                     # @bureau/contracts — Zod schemas
│   ├── shared-kernel/                 # @bureau/shared-kernel — Result<T,E>, ULID, Money
│   ├── infra-mongo/                   # @bureau/infra-mongo — repository, outbox
│   ├── infra-messaging/               # @bureau/infra-messaging — BullMQ wrapper [REVISED: bukan RabbitMQ]
│   ├── agents-core/                   # @bureau/agents-core — orchestrator, worker base
│   ├── telemetry/                     # @bureau/telemetry — OTel + Pino + createLogger
│   ├── auth/                          # @bureau/auth — JWT, API key
│   └── llm-providers/                 # @bureau/llm-providers
│       └── src/
│           ├── IModelProvider.ts
│           ├── claude/                # Implementasi konkret ditulis dulu
│           ├── gemini/                # Baru abstraksi setelah dua provider jelas
│           ├── qwen/
│           ├── mistral/
│           ├── deepseek/
│           └── pricing.config.ts
│
├── core/                              # @bureau/core — framework-agnostic
│   └── src/
│       ├── agents/
│       │   ├── csuite/
│       │   ├── ssc/
│       │   └── core/
│       ├── orchestrator/
│       ├── path-classifier/           # [NEW] Fast path classifier
│       └── index.ts
│
├── pillars/
│   ├── mcp-server/
│   ├── api-server/
│   └── sdk/
│
├── apps/
│   └── dashboard/
│
├── tests/
├── deploy/
└── docs/
    ├── adr/                           # [NEW] ADR per keputusan arsitektur besar
    ├── runbook.md
    └── api-spec.openapi.yaml
```

### Alur Request — Fast Path vs Full Path [REVISED]

```
Client kirim request
  │
  ▼
Path Classifier (rule-based, bukan LLM call)
  │
  ├─[Fast Path] → prompt < 150 token, no code, no research signals
  │               → CEO Agent (1 call) → Production (1 call)
  │               → Compliance (light: schema only) → Marketing
  │               → 3 divisi, bukan 7
  │
  └─[Standard/Full Path] → prompt kompleks, ada riset, ada kode
                          → CEO → SSC paralel (HR + Finance + IT)
                          → Research → Production → QA gate → Marketing
                          → 7 divisi penuh

Finance SSC selalu terlibat di kedua path — budget check tidak bisa di-skip.
```

**Kriteria fast path (rule-based classifier):**

````typescript
function classifyPath(prompt: string): "fast" | "standard" | "full" {
  const tokens = estimateTokens(prompt);
  const hasCode = /```|function |class |import |SELECT |CREATE /.test(prompt);
  const hasResearch =
    /analisis|riset|bandingkan|tren|kompetitor|data|statistik/i.test(prompt);
  const hasTemporal = /hari ini|terbaru|sekarang|minggu ini|terkini/i.test(
    prompt,
  );

  if (!hasCode && !hasResearch && !hasTemporal && tokens < 150) return "fast";
  if (hasCode || (hasResearch && tokens > 300)) return "full";
  return "standard";
}
````

LLM confidence score hanya dipakai untuk borderline case antara `standard` dan `full` — bukan untuk gating fast path. Alasan: overhead satu LLM call untuk menentukan apakah perlu LLM call itu kontraproduktif saat load tinggi.

**QA di fast path: lightweight, bukan skip.** Satu validator (schema compliance) tetap jalan. Skip QA sepenuhnya berarti mengirim output yang belum divalidasi ke user.

### State Machine Task (XState 5) [REVISED]

```
Submitted
  │
  ▼
Preparing (SSC paralel: HR + Finance + IT)
  │
  ▼
Researching (skip untuk fast path)
  │
  ▼
Producing
  │
  ├── [QA gagal] ──────────────────────────────────────────┐
  │                                                        │
  ▼                                                        │
Reviewing                                                  │
  │                                                        │
  ├── [lulus] ──► Formatting ──► Completed                 │
  │                                                        │
  ├── [gagal, budget cukup untuk eskalasi] ──► Producing ──┘
  │                (dengan model tier lebih tinggi)
  │
  ├── [gagal, budget tidak cukup untuk eskalasi]
  │     │
  │     ▼
  │   AwaitingUserDecision  ←── [NEW STATE]
  │     │ timeout 24 jam, default: best_effort
  │     ├── [best_effort] ──► Formatting ──► Completed (dengan label best_effort)
  │     ├── [add_budget]  ──► Producing (dengan model tier lebih tinggi)
  │     └── [cancel]      ──► Cancelled (full budget refund)
  │
  └── [max retry 3x] ──► Failed

[user cancel kapan saja] ──► Cancelled
```

**Eskalasi chain [NEW]:** Setiap task punya `escalationChain` yang di-pre-approve Finance SSC di awal. Attempt 1 pakai model A, attempt 2 pakai model B, attempt 3 pakai model C. Finance harus pre-approve total biaya chain sebelum task dimulai. Kalau budget tidak cukup untuk attempt berikutnya, masuk `AwaitingUserDecision` — bukan langsung Failed.

---

## 5. Struktur Agent dan Worker

### Dua Jenis Agent Berdasarkan Cara Hidupnya

**SSC Agents — Persistent Pool (selalu hidup)**

```
HR Agent
  Pool: 5 slot
  Worker: ModelEvaluatorWorker
  Tugasnya: evaluasi N kandidat model paralel, pilih terbaik
  Kriteria: complexity_score × 0.4 + (1/latency) × 0.3 + quality × 0.3
  [NEW] Juga menentukan escalationChain berdasarkan budget yang tersedia

Finance Agent
  Pool: 3 slot
  Worker: EstimatorWorker → ValidatorWorker → ReserverWorker
  [REVISED] Debit budget pakai findOneAndUpdate dengan $gte condition — atomic, bukan read-modify-write
  [NEW] Reservations array per task: { taskId, amount, reservedAt }
  [NEW] Release mechanism saat task selesai/gagal: kembalikan saldo yang tidak terpakai

Compliance Agent
  Pool: 5 slot
  Worker: ToxicityWorker + FactualityWorker + SchemaWorker (paralel)
  [NEW] Fast path hanya pakai SchemaWorker (1 validator), bukan 3

IT Agent
  Pool: 3 slot
  Worker: ProvisionerWorker, RotatorWorker
```

**Core Agents — Ephemeral (spawn per proyek)**

```
Project Manager Agent
  Membaca pathType dari classifier: 'fast' | 'standard' | 'full'
  Assign divisi sesuai path

Research Agent — Scatter (skip di fast path)
  WebSearchWorker, KnowledgeBaseWorker, EmbeddingWorker (paralel)

Production Agent — Pool + Semaphore + Escalation [REVISED]
  ChunkWorker (max 3 paralel)
  Setiap attempt menggunakan model dari escalationChain[attemptNumber]
  Catat attemptReason di agent_executions: 'initial' | 'qa_escalation' | 'stall_requeue'

QA Agent — Gate [REVISED]
  Full path: FormatValidator + CompletenessChecker + RelevanceChecker (paralel)
  Fast path: SchemaValidator saja
  Kalau gagal: kirim failure reason ke Production untuk perbaikan yang ditargetkan
  Max retry 3x — kalau gagal semua, cek apakah ada eskalasi yang tersisa di escalationChain

Marketing Agent — Pipeline (berurutan)
  FormatterWorker → CitationWorker → DeliveryWorker
```

### BullMQ Job Lifecycle [REVISED]

```typescript
// Konfigurasi wajib di setiap Worker — menggantikan heartbeat custom
const worker = new Worker(
  "production",
  async (job) => {
    const isRequeue = job.attemptsMade > 0;
    const attemptReason = isRequeue ? "stall_requeue" : "initial";
    // ... catat ke agent_executions
  },
  {
    lockDuration: 60000, // 60 detik lock per job
    stalledInterval: 30000, // cek stalled setiap 30 detik
    maxStalledCount: 2, // retry max 2x sebelum failed
  },
);

// Tidak ada heartbeat custom. BullMQ native menangani stalled detection.
// Redis boundary rule: Redis untuk ephemeral (BullMQ jobs, cache, rate limit).
// MongoDB untuk semua state yang matter.
```

---

## 6. Skema MongoDB

**Database:** `bureau` | **ODM:** Mongoose 8 | **Konvensi:** ULID, ISO 8601, Decimal128

### Aturan Strict Schema [NEW]

- Gunakan `strict: true` di Mongoose secara default
- Tidak ada field "reserved for future use" — mulai strict, migration nanti kalau perlu
- Setiap dokumen wajib punya `schemaVersion: 'v1'` (string) dan `updatedAt` (auto-managed)
- Zod schema di `@bureau/contracts` pakai `.strip()` default — field tidak dikenal di-drop, bukan error
- Untuk multi-version: `z.discriminatedUnion('schemaVersion', [V1Schema, V2Schema])`

### 6.1 Collection `task_envelopes` [REVISED]

```typescript
{
  taskId: "task_01HXYZABC123",
  tenantId: "tenant_001",
  userId: "user_123",                  // [NEW] untuk GDPR anonymization
  submittedAt: ISODate,
  completedAt: null,
  currentStage: "Producing",
  stageVersion: 5,                     // optimistic concurrency

  executionPath: "standard",           // [NEW] 'fast' | 'standard' | 'full'

  originalRequest: {
    prompt: "string",
    constraints: {
      maxCostUsd: Decimal128("0.50"),
      maxLatencyMs: 30000,
      preferredModelTier: "standard"
    },
    outputFormat: "markdown",
    metadata: {}
  },

  routing: {
    selectedModel: "claude-sonnet-4-6",
    escalationChain: [                 // [NEW] pre-approved oleh Finance SSC
      { attempt: 1, model: "claude-haiku-4-5", maxCostUsd: Decimal128("0.10") },
      { attempt: 2, model: "claude-sonnet-4-6", maxCostUsd: Decimal128("0.30") },
      { attempt: 3, model: "claude-opus-4-7", maxCostUsd: Decimal128("0.50") }
    ],
    complexityScore: 4,
    pathType: "standard",
    rationale: "...",
    decidedBy: "agent_hr_ssc",
    decidedAt: ISODate
  },

  budget: {
    maxCostUsd: Decimal128("0.90"),    // total semua attempt di escalationChain
    reservedUsd: Decimal128("0.90"),
    consumed: {
      tokensIn: 23400, tokensOut: 5800,
      costUsd: Decimal128("0.032")
    },
    reservations: [                    // [NEW] per-task reservation tracking
      { taskId: "task_01HXYZ...", amount: Decimal128("0.10"), reservedAt: ISODate }
    ]
  },

  pendingDecision: null,               // [NEW] diisi saat masuk AwaitingUserDecision
  // Shape kalau ada:
  // {
  //   reason: "budget_insufficient_for_escalation",
  //   attemptNumber: 2,
  //   bestEffortOutput: { available: true, qualityEstimate: 0.8 },
  //   escalationOption: { targetModel: "claude-opus-4-7", additionalCostUsd: Decimal128("0.32") },
  //   expiresAt: ISODate,
  //   defaultAction: "best_effort",
  //   notifiedAt: null                 // diisi setelah email dikirim, cegah duplikat
  // }

  intermediateOutputs: {
    research: { summary: "...", sources: [], confidence: 0.87 },
    production: { draft: "...", version: 1, attemptNumber: 1 },
    qa: null
  },

  finalOutput: null,
  outputQuality: null,                 // [NEW] 'best_effort' | 'standard' | null

  stateTransitions: [
    { from: "Submitted", to: "Preparing", at: ISODate, byAgent: "ceo_agent", correlationId: "..." }
  ],

  retryCount: { production: 0, qa: 0 },
  cancellationRequested: false,
  schemaVersion: "v1",                 // string, bukan number
  updatedAt: ISODate
}
```

### 6.2 Collection `audit_trail` [REVISED]

```typescript
{
  messageId: "msg_01HXYZ...",
  taskId: "task_01HXYZABC123",
  correlationId: "corr_01HXYZ...",
  causationId: "msg_prev_id",
  timestamp: ISODate,

  messageType: "Command",
  messageName: "SelectModelCommand",
  schemaVersion: "v1",

  fromDivision: "Executive",
  toDivision: "HRSSc",
  fromAgent: "ceo_agent",
  toAgent: "hr_ssc_slot_2",

  payloadHash: "sha256:abcd1234...",
  payloadSizeBytes: 2048,
  // payloadSnapshot dihilangkan dari sini — lihat task_envelopes.intermediateOutputs

  transport: "BullMQ",                 // [REVISED] bukan RabbitMQ
  queueName: "bureau.ssc.hr",
  jobId: "bullmq_job_abc123",          // [NEW] BullMQ job ID untuk tracing
  status: "Completed",
  attempts: 1,
  latencyMs: 124,

  traceId: "0af7651916cd43dd...",
  spanId: "00f067aa0ba902b7",

  schemaVersion: "v1",
  updatedAt: ISODate
}
```

### 6.3 Collection `agent_executions` [REVISED]

```typescript
{
  executionId: "exec_01HXYZ...",
  taskId: "task_01HXYZABC123",
  division: "Production",
  headAgentId: "prod_head_agent",
  decompositionStrategy: "MapReduce",
  executionPath: "standard",           // [NEW] fast | standard | full

  startedAt: ISODate,
  endedAt: ISODate,
  totalDurationMs: 4123,
  parallelDegree: 3,

  workers: [
    {
      workerId: "chunk_worker_1",
      jobId: "bullmq_job_abc",         // BullMQ job ID
      subTaskRef: "chunk_01",
      attemptNumber: 1,                // dari BullMQ job.attemptsMade
      attemptReason: "initial",        // [NEW] 'initial' | 'stall_requeue' | 'qa_escalation' | 'user_retry'
      llmInvoked: true,                // [NEW] apakah attempt ini sampai ke LLM call?
      status: "Completed",
      startedAt: ISODate, endedAt: ISODate,
      durationMs: 3200,
      llmInvocation: {                 // null kalau llmInvoked = false
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        tokensIn: 8500, tokensOut: 2200,
        costUsd: Decimal128("0.0089"),
        cachedTokens: 4200             // dari prompt caching
      },
      errorMessage: null
    }
  ],

  aggregationResult: { tokenCount: 4521, method: "concatenate-and-deduplicate" },
  failureCount: 0,
  schemaVersion: "v1",
  updatedAt: ISODate
}
```

### 6.4 Collection `cost_analytics` [NEW — wajib dari hari pertama]

**Write path harus ada sejak hari pertama. Read path (anomaly detection) bisa ditambahkan di minggu 3-4.**

```typescript
{
  eventId: "evt_01HXYZ...",           // ULID, unique
  tenantId: "tenant_001",
  userId: "user_123",                  // untuk GDPR anonymization — null kalau sudah di-anonymize
  taskId: "task_01HXYZABC123",
  division: "Production",
  agentId: "chunk_worker_1",

  model: "claude-sonnet-4-6",
  provider: "anthropic",
  tokensIn: 8500,
  tokensOut: 2200,
  cachedTokens: 4200,
  costUsd: Decimal128("0.0089"),

  retryAttempt: 0,                     // berapa kali task ini sudah retry sebelum event ini
  isEscalated: false,                  // apakah ini hasil dari escalation chain?
  escalationTier: null,                // 'tier1' | 'tier2' | 'tier3' | null

  durationMs: 3200,
  timestamp: ISODate,

  anonymizedAt: null,                  // diisi saat GDPR deletion request
  schemaVersion: "v1"
}
```

**Indeks:** `{ tenantId: 1, timestamp: -1 }`, `{ taskId: 1 }`, `{ userId: 1 }`, TTL 365 hari.

**Aturan:** Jangan simpan prompt text di `cost_analytics`. Kalau perlu investigasi, lookup via `taskId` ke `task_envelopes`. Collection ini adalah financial record, bukan conversation log.

### 6.5 Collection `outbox` [REVISED — BullMQ, bukan RabbitMQ]

```typescript
{
  outboxId: "out_01HXYZ...",
  occurredAt: ISODate,
  processedAt: null,                   // null = belum diproses
  status: "Pending",                   // Pending | Completed | Failed
  attempts: 0,
  nextAttemptAt: ISODate,

  targetQueue: "bureau.ssc.hr",        // [REVISED] BullMQ queue name, bukan exchange
  jobName: "SelectModelCommand",
  jobData: {},
  headers: { "x-correlation-id": "...", "traceparent": "..." }
}
```

Background worker poll `Pending` setiap 1 detik, tambahkan ke BullMQ queue dalam MongoDB transaction, mark `Completed`. Outbox pattern tetap diperlukan meski pakai BullMQ karena menjamin atomicity antara DB write dan job enqueue.

### 6.6 Collection `api_keys`

```typescript
{
  keyId: "key_01HXYZ...",
  keyHash: "sha256:abcd1234...",       // HASH — tidak pernah simpan plaintext
  keyPrefix: "bureau_live_aBcD",
  ownerId: "user_123",
  tenantId: "tenant_001",
  name: "Production App",
  status: "active",
  permissions: ["task:write", "task:read"],
  rateLimit: { requestsPerMinute: 60, requestsPerDay: 500 },
  usage: { totalRequests: 47, totalCostUsd: Decimal128("2.84") },
  createdAt: ISODate, lastUsedAt: ISODate, expiresAt: null,
  schemaVersion: "v1"
}
```

### 6.7 Collection `user_provider_keys`

```typescript
{
  userId: "user_123",
  provider: "anthropic",
  encryptedKey: "aes256gcm:iv:tag:ciphertext",  // AES-256-GCM — bisa di-decrypt, bukan hash
  keyPreview: "sk-ant-...xK9m",                 // hanya 4 char terakhir
  isActive: true,
  createdAt: ISODate, lastUsedAt: ISODate,
  schemaVersion: "v1"
}
```

### 6.8 Strategi GDPR [NEW]

```typescript
// Anonymize, bukan hard delete — untuk menjaga integritas financial record
async function anonymizeUserData(userId: string) {
  // cost_analytics: null-kan userId, pertahankan data finansial
  await CostEvent.updateMany(
    { userId },
    { $set: { userId: null, anonymizedAt: new Date() } },
  );

  // task_envelopes: anonymize prompt dan output
  await TaskEnvelope.updateMany(
    { userId },
    {
      $set: {
        "originalRequest.prompt": "[REDACTED]",
        finalOutput: "[REDACTED]",
        anonymizedAt: new Date(),
      },
    },
  );

  // Hard delete untuk data yang genuinely personal tanpa audit trail value
  await UserProviderKey.deleteMany({ userId });
  await ApiKey.deleteMany({ ownerId: userId });
}
```

---

## 7. Spesifikasi API

**Base URL:** `https://api.bureau.id/api/v1`
**Auth:** `X-Api-Key: bureau_live_xxxx` atau `Authorization: Bearer <JWT>`

### Endpoint Utama [REVISED]

| Method     | Path                          | Fungsi                                    | Scope        |
| ---------- | ----------------------------- | ----------------------------------------- | ------------ |
| `POST`     | `/tasks`                      | Submit task baru                          | `task:write` |
| `GET`      | `/tasks`                      | List task                                 | `task:read`  |
| `GET`      | `/tasks/:taskId`              | Envelope lengkap                          | `task:read`  |
| `GET`      | `/tasks/:taskId/status`       | Status + pending decision                 | `task:read`  |
| `GET`      | `/tasks/:taskId/stream`       | SSE real-time                             | `task:read`  |
| `GET`      | `/tasks/:taskId/audit`        | Log antar-agent (paginated)               | `task:read`  |
| `GET`      | `/tasks/:taskId/executions`   | Detail worker per divisi                  | `task:read`  |
| `POST`     | `/tasks/:taskId/cancel`       | Batalkan task                             | `task:write` |
| **`POST`** | **`/tasks/:taskId/decision`** | **[NEW] Respond ke AwaitingUserDecision** | `task:write` |
| **`POST`** | **`/tasks/:taskId/feedback`** | **[NEW] Rating 1-5 + opsional comment**   | `task:write` |
| `POST`     | `/auth/keys`                  | Buat API key                              | `keys:write` |
| `GET`      | `/auth/keys`                  | List API key                              | `keys:read`  |
| `DELETE`   | `/auth/keys/:keyId`           | Cabut API key                             | `keys:write` |
| `GET`      | `/health/live`                | Liveness probe                            | none         |
| `GET`      | `/health/ready`               | Readiness probe                           | none         |

### GET /tasks/:taskId/status — dengan Pending Decision [REVISED]

Response standar sama seperti sebelumnya. Tambahan kalau ada pending decision:

```json
{
  "taskId": "task_01HXYZ",
  "currentStage": "AwaitingUserDecision",
  "pendingDecision": {
    "reason": "budget_insufficient_for_escalation",
    "attemptNumber": 2,
    "bestEffortOutput": {
      "available": true,
      "qualityEstimate": 0.8
    },
    "escalationOption": {
      "targetModel": "claude-opus-4-7",
      "additionalCostUsd": "0.32",
      "available": true
    },
    "expiresAt": "2026-05-03T10:00:00Z",
    "defaultAction": "best_effort"
  }
}
```

**Desain polling-friendly:** Status endpoint ini adalah sumber kebenaran. SSE push event `decision_required` dengan payload yang identik sebagai enhancement. Email transaksional via Resend/Postmark dikirim saat state pertama kali masuk `AwaitingUserDecision` (satu kali, tidak duplikat via field `notifiedAt`).

### POST /tasks/:taskId/decision [NEW]

```json
{
  "action": "best_effort" // "best_effort" | "add_budget" | "cancel"
}
```

Response `200 OK` jika berhasil. Response `409 Conflict` jika decision sudah expire atau task sudah selesai.

### POST /tasks/:taskId/feedback [NEW]

```json
{
  "rating": 4, // 1-5
  "comment": "Output bagus tapi perlu lebih spesifik"
}
```

Feedback ini adalah **validation mechanism untuk complexity scoring**, bukan hanya nice-to-have. Data dikumpulkan dari hari pertama via endpoint ini. Auto-adjustment scoring **tidak** dilakukan otomatis — data di-aggregate, anomaly di-flag untuk review manual.

### SSE Events [REVISED]

```
event: task.stage.changed
data: {"taskId":"...","from":"Producing","to":"Reviewing","at":"..."}

event: division.progress
data: {"taskId":"...","division":"Production","progress":0.4}

event: decision_required              ← [NEW]
data: {"taskId":"...","pendingDecision":{...}}

event: task.completed
data: {"taskId":"...","output":"...","outputQuality":"standard","costUsd":"0.032"}

event: task.completed                 ← best effort variant
data: {"taskId":"...","output":"...","outputQuality":"best_effort","costUsd":"0.032"}

event: task.failed
data: {"taskId":"...","reason":"qa_max_retry","attempts":3}
```

---

## 8. Strategi Kontrol Biaya LLM

### Harga Provider (referensi Mei 2026)

| Provider  | Model                 | Input /1M (USD) | Output /1M (USD) |
| --------- | --------------------- | --------------- | ---------------- |
| Anthropic | Claude Haiku 4.5      | $1.00           | $5.00            |
| Anthropic | Claude Sonnet 4.6     | $3.00           | $15.00           |
| Anthropic | Claude Opus 4.7       | $5.00           | $25.00           |
| Google    | Gemini 2.5 Flash-Lite | $0.10           | $0.40            |
| Google    | Gemini 2.5 Flash      | $0.30           | $2.50            |
| Google    | Gemini 2.5 Pro        | $1.25           | $10.00           |
| OpenAI    | GPT-5                 | $1.25           | $10.00           |
| DeepSeek  | DeepSeek V3.2         | $0.28           | $0.42            |
| Mistral   | Mistral Medium 3      | $0.40           | $2.00            |
| Qwen      | Qwen 2.5-7B           | $0.30           | $0.80            |
| Kimi      | Kimi K2.5             | $0.60           | $2.50            |

_Simpan di `pricing.config.ts`. Alert otomatis kalau cost per request menyimpang lebih dari 20% dari baseline minggu sebelumnya._

### Smart Routing dan Escalation Chain [REVISED]

Complexity score menentukan tier model _awal_. Kalau QA reject, naik ke tier berikutnya (bukan retry dengan model yang sama):

```
Attempt 1 (skor 0-2): Gemini Flash / Haiku / DeepSeek V3.2
Attempt 2 (QA reject): Sonnet / Gemini Pro / Mistral Large
Attempt 3 (QA reject lagi): Opus / GPT-5

Finance SSC pre-approve total budget semua attempt sebelum task dimulai.
Kalau budget tidak cukup untuk attempt berikutnya → AwaitingUserDecision.
```

**Edge case yang ditangani:** Sebelumnya ada risiko cascade escalation yang mahal. Sekarang Finance SSC pre-approve total budget chain di awal — kalau budget tidak cukup untuk chain penuh, user diberi tahu sebelum task dimulai, bukan di tengah jalan.

### Atomic Budget Reservation [NEW]

```typescript
// BENAR — atomic, mencegah race condition
const result = await Budget.findOneAndUpdate(
  {
    tenantId,
    remaining: { $gte: estimatedCost }, // condition dan update adalah atomic
  },
  {
    $inc: { remaining: -estimatedCost },
    $push: {
      reservations: { taskId, amount: estimatedCost, reservedAt: new Date() },
    },
  },
  { new: true },
);

if (!result) throw new InsufficientBudgetError(tenantId, estimatedCost);

// SALAH — read-modify-write di application layer, race condition window
const budget = await Budget.findOne({ tenantId });
if (budget.remaining >= estimatedCost) {
  budget.remaining -= estimatedCost;
  await budget.save(); // ← race condition antara findOne dan save
}
```

Dua worker paralel dari tenant yang sama akan atomic — salah satu berhasil, satunya mendapat `InsufficientBudgetError`. Tanpa ini, saldo bisa menjadi negatif di production meski tidak pernah terjadi di development.

### Category-Based TTL Cache [REVISED]

```typescript
// SYSTEM_FLOOR_TTL — hard constraint, tidak bisa di-override tenant
const SYSTEM_FLOOR_TTL = {
  financial: 0, // tidak pernah di-cache, titik
  temporal: 60, // minimum 1 menit
  personnel: 3600, // minimum 1 jam
  inventory: 300, // minimum 5 menit
  default: 3600, // minimum 1 jam
};

// TENANT_MAX_TTL — tenant bisa adjust ke atas dalam batas ini
const TENANT_MAX_TTL = {
  financial: 0, // tidak ada override untuk financial
  temporal: 600, // max 10 menit
  personnel: 86400, // max 24 jam
  inventory: 3600, // max 1 jam
  default: 604800, // max 7 hari
};

// Klasifikasi prompts — cek ini setiap request, bukan hanya di test
function classifyPromptCategory(prompt: string): CacheCategory {
  if (/harga|price|kurs|saham|crypto|bitcoin|stock|nilai tukar/i.test(prompt)) {
    return "financial"; // TTL = 0, tidak pernah di-cache
  }
  if (/hari ini|sekarang|terbaru|terkini|minggu ini/i.test(prompt)) {
    return "temporal";
  }
  if (/CEO|CTO|direktur|presiden|kepala|pemimpin/i.test(prompt)) {
    return "personnel";
  }
  if (/tersedia|available|stok|stock|inventory/i.test(prompt)) {
    return "inventory";
  }
  return "default";
}
```

**TenantCacheConfig interface** ada dari awal di schema, tapi UI konfigurasi ditunda sampai ada tenant yang benar-benar request.

### Tiga Lapis Perlindungan Biaya

```
Lapis 1 — Per request
  Estimasi token SEBELUM kirim ke LLM. Batalkan kalau melebihi max.

Lapis 2 — Per task
  Finance SSC pre-approve escalation chain di awal.
  Setiap worker debit via atomic findOneAndUpdate.
  Budget habis → AwaitingUserDecision, bukan langsung Failed.

Lapis 3 — Per tenant
  Kuota bulanan sesuai tier.
  80% kuota → email warning.
  100% kuota → semua task dibekukan.

Spending Anomaly Detection [NEW]
  collection cost_analytics: per-invocation record.
  Background aggregation: rolling average per tenant per jam.
  Alert kalau current_hour > 3x avg_7_days untuk tenant yang sama.
  Per-tenant baseline, bukan global — user yang biasa spend 50rb/hari
  tidak di-alert kalau spend 60rb, tapi di-alert kalau spend 500rb.
```

---

## 9. Fase Pengembangan

### Overview Timeline

```
Development   ████████████████  8 minggu   (Fase 0–5)
Testing       ██████████        5 minggu   (Fase 6–8)
Production    ████████          3+ minggu  (Fase 9–11)
──────────────────────────────────────────────────────
Total estimasi: 16 minggu (~4 bulan)
```

### Rencana Minggu Pertama yang Dikunci [NEW]

Sebelum masuk fase formal, urutan hari pertama:

```
Hari 1: Result<T,E> di @bureau/shared-kernel
  Lock pattern error handling sebelum baris bisnis apapun.
  Konvensi: tidak ada throw di business logic, semua return Result.

Hari 2: Budget model dengan atomic reservation
  findOneAndUpdate + $gte + reservations array + release mechanism.
  Ini sebelum ada urge untuk nyambung ke API manapun.

Hari 3: Satu LLM call end-to-end
  Hardcoded Claude Sonnet. curl masuk, token keluar.
  Bukan IModelProvider abstraction — itu nanti setelah dua provider konkret.

Hari 4-5: TaskEnvelope skeleton dengan XState
  State: Submitted → Preparing → Producing → Completed/Failed.
  Belum ada Research, QA, Marketing.
  CEO "berpikir" (satu call) + Production (satu call) + Budget check.

Hari 6-7: Docker Compose + satu integration test
  MongoDB Atlas M0 (bukan lokal) + Redis + BullMQ.
  Satu test: submit → selesai → output tersimpan → budget tercatat.
```

---

### TAHAP DEVELOPMENT — Fase 0 sampai 5

#### Fase 0 — Inisiasi Infrastruktur

**Durasi:** Minggu 1 (5 hari)

- [ ] Setup monorepo Turborepo + pnpm workspaces + `turbo.json` pipeline
- [ ] `tsconfig.base.json` strict mode, ESLint + Prettier + Husky + commitlint
- [ ] **`docker-compose.yml`: MongoDB, Redis, Jaeger, Prometheus, Grafana** [REVISED: tidak ada RabbitMQ]
- [ ] CI/CD GitHub Actions minimal: build + lint + typecheck
- [ ] Secrets: Doppler + `.env.example`
- [ ] **MongoDB Atlas M0 dari minggu pertama** [NEW] — tidak pakai lokal Docker untuk development data
- [ ] BullMQ topology: queue per divisi, dead letter queue
- [ ] **ADR-001: BullMQ-only (kenapa RabbitMQ tidak dipakai di MVP)** [NEW]

**Definition of Done:** `docker compose up` berhasil, Atlas terhubung, CI hijau.

---

#### Fase 1 — Shared Kernel & Contracts

**Durasi:** Minggu 2 (7 hari)

- [ ] **`@bureau/shared-kernel`: `Result<T,E>`, `ok`, `err`, `tryAsync` — file pertama yang ditulis** [NEW]
- [ ] `@bureau/shared-kernel`: ULID, Money (decimal.js), error class hierarchy
- [ ] `@bureau/contracts` — Zod schemas dengan `.strip()` default + `schemaVersion` di setiap schema
- [ ] `@bureau/infra-mongo` — MongoContext, repository base, outbox pattern ⚠️ KRITIS
- [ ] **`@bureau/infra-messaging` — BullMQ wrapper** [REVISED: bukan RabbitMQ]
- [ ] `@bureau/agents-core` — `IHeadAgent`, `IWorkerAgent`, `ParallelOrchestrator`
- [ ] **`@bureau/telemetry` — OpenTelemetry + Pino + `createLogger({ taskId, correlationId, division })` dari hari pertama** [NEW]
- [ ] `@bureau/auth` — JWT RS256, API key hash
- [ ] Unit test semua package, coverage minimal 80%

---

#### Fase 2 — C-Suite + SSC Agents

**Durasi:** Minggu 3–4 (10 hari)

- [ ] CEO Agent + path classifier (rule-based) ⚠️ fast path tidak skip Finance [NEW]
- [ ] State machine XState 5 — termasuk `AwaitingUserDecision` state [REVISED]
- [ ] Next.js Executive API — `POST /tasks`, `GET /status`, SSE, `POST /decision`, `POST /feedback`
- [ ] Auth middleware JWT + API key ⚠️ KRITIS
- [ ] Rate limiting via `@upstash/ratelimit`
- [ ] Idempotency-Key handling
- [ ] **HR SSC — complexity scoring + escalation chain builder** [REVISED]
- [ ] **Finance SSC — atomic reservation (`findOneAndUpdate` + `$gte`), release mechanism** ⚠️ KRITIS [REVISED]
- [ ] **`cost_analytics` write path** ⚠️ KRITIS — dari sini semua LLM invocation dicatat [NEW]
- [ ] Compliance SSC — fast path (1 validator) vs full path (3 validator) [NEW]
- [ ] IT SSC — provisioner worker dasar
- [ ] Outbox publisher — poll ke BullMQ queue [REVISED]
- [ ] **Email transaksional (Resend/Postmark) untuk AwaitingUserDecision** [NEW]
- [ ] Background job auto-execute default action setelah 24 jam timeout [NEW]

---

#### Fase 3 — Core Execution Agents

**Durasi:** Minggu 5–6 (14 hari)

**Track A: Research + QA**

- [ ] Project Manager Agent — decompose berdasarkan pathType
- [ ] Research Agent — scatter, 3 worker paralel, reranking
- [ ] **QA Agent — gate pattern, lightweight untuk fast path, escalation trigger untuk full path** [REVISED]
- [ ] QA rejection menyertakan failure reason + rekomendasi escalation tier

**Track B: Production + Marketing**

- [ ] Production Agent — pool + semaphore, `attemptReason` tracking [REVISED]
- [ ] **ChunkWorker — catat `llmInvoked: false` sebelum call, `true` setelah** [NEW]
- [ ] Marketing Agent — pipeline berurutan
- [ ] AbortController propagasi ⚠️ KRITIS
- [ ] SIGTERM handler di semua service

**Definition of Done:** Happy path end-to-end `Completed` di MongoDB, cost tercatat di `cost_analytics`.

---

#### Fase 4 — LLM Providers & Smart Routing

**Durasi:** Minggu 7 (7 hari)

- [ ] Claude konkret dulu → Gemini konkret → baru `IModelProvider` abstraction [REVISED]
- [ ] Cockatiel policies: retry eksponensial + circuit breaker + bulkhead
- [ ] **Escalation chain aktif di HR SSC + Finance pre-approval** [NEW]
- [ ] Cost calculator + debit ke Finance SSC
- [ ] `pricing.config.ts` + alert delta 20%
- [ ] Vercel AI SDK streaming
- [ ] **Category-based TTL cache** [REVISED] — SYSTEM_FLOOR_TTL + TENANT_MAX_TTL
- [ ] **Semantic cache Upstash Vector 95%** dengan time-sensitivity signal [REVISED]
- [ ] Fallback chain provider

---

#### Fase 5 — Tiga Pilar Distribusi

**Durasi:** Minggu 8 (7 hari)

- [ ] **Pilar 1** — `@bureau/mcp-server`: stdio, tools, bin entry
- [ ] **Pilar 2** — `@bureau/api-server`: Fastify, billing, semua endpoint termasuk `/feedback` dan `/decision`
- [ ] **Pilar 3** — docker-compose self-host, README 10 menit, deploy ke Railway/Render one-click
- [ ] `@bureau/sdk` — TypeScript client dengan streaming
- [ ] User provider key — enkripsi AES-256-GCM ⚠️ KRITIS
- [ ] Portal API key
- [ ] `docs/adr/` — ADR lengkap semua keputusan besar dari Fase 0-5 [NEW]

---

### TAHAP TESTING — Fase 6 sampai 8

#### Fase 6 — Unit & Integration Test

**Durasi:** Minggu 9 (7 hari)

- [ ] Unit test `@bureau/*` — Vitest, coverage minimal 80%
- [ ] Mock LLM provider — deterministic, tanpa biaya
- [ ] Integration test tiap agent — Testcontainers (MongoDB + Redis)
- [ ] Test outbox pattern — crash recovery
- [ ] Test idempotency
- [ ] **Test Finance atomic reservation — dua worker paralel tidak bisa buat saldo negatif** [NEW] ⚠️
- [ ] Test tenant isolation ⚠️ KRITIS
- [ ] Test enkripsi API key
- [ ] **Test escalation chain — QA reject dua kali, model naik tier** [NEW]
- [ ] **Test AwaitingUserDecision — timeout 24 jam, auto-execute best_effort** [NEW]
- [ ] **Test fast path classifier — prompts sederhana tidak masuk full pipeline** [NEW]
- [ ] **Test classification financial category — financial prompts tidak masuk cache** [NEW]
- [ ] **Test GDPR anonymization — userId null setelah delete, financial data tetap ada** [NEW]

---

#### Fase 7 — E2E & Skenario Komunikasi

**Durasi:** Minggu 10–11 (10 hari)

- [ ] Skenario A — Happy path ketiga pilar end-to-end
- [ ] Skenario B — QA reject loop, eskalasi model, task selesai dengan model lebih tinggi [REVISED]
- [ ] Skenario C — Budget habis setelah attempt ke-2 → AwaitingUserDecision → best_effort [REVISED]
- [ ] Skenario D — LLM provider 503, fallback provider, task selesai
- [ ] **Skenario E — BullMQ stalled job, requeue via native BullMQ, tidak ada data hilang** [REVISED — bukan RabbitMQ down]
- [ ] Skenario F — SIGTERM saat task in-flight
- [ ] Skenario G — Prompt injection, Compliance blokir
- [ ] Skenario H — 50 task paralel, tidak ada race condition
- [ ] **Skenario I — Fast path: prompt sederhana selesai dalam 3 divisi saja** [NEW]
- [ ] **Skenario J — Spending anomaly: tenant 3x rata-rata → alert dikirim** [NEW]
- [ ] **Skenario K — Financial prompt tidak ter-cache, temporal prompt TTL 5 menit** [NEW]
- [ ] Verifikasi audit trail lengkap

---

#### Fase 8 — Load Test & Performance

**Durasi:** Minggu 12–13 (10 hari)

- [ ] k6 — 50 concurrent, throughput minimal 5 task/detik
- [ ] p99 POST /tasks kurang dari 500ms
- [ ] Memory leak test 24 jam
- [ ] Cost benchmark — smart routing + escalation hemat minimal 60%
- [ ] **Fast path vs full path latency comparison** [NEW]
- [ ] Security scan — Trivy + pnpm audit
- [ ] UAT 3-5 early adopter
- [ ] **User feedback collection aktif dan data masuk ke cost_analytics** [NEW]

---

### TAHAP PRODUCTION — Fase 9 sampai 11

#### Fase 9 — Observability & Monitoring

**Durasi:** Minggu 14 (7 hari)

- [ ] Jaeger tracing — correlationId via BullMQ job metadata [REVISED]
- [ ] Prometheus metrics per divisi
- [ ] **Grafana dashboard tambahkan: fast path vs full path ratio, escalation frequency, AwaitingUserDecision expiry rate** [NEW]
- [ ] Alert rules: error rate, cost anomaly, queue depth, latency
- [ ] **Alert: spending anomaly per tenant (3x rolling average)** [NEW]
- [ ] Pino redaction list
- [ ] Liveness + readiness probe
- [ ] Runbook

---

#### Fase 10 — Production Hardening

**Durasi:** Minggu 15 (7 hari)

- [ ] Dockerfile multi-stage → distroless, kurang dari 150MB
- [ ] Kubernetes Helm chart + HPA
- [ ] MongoDB Atlas backup + test restore
- [ ] Upstash Vector semantic cache
- [ ] Prompt caching aktif
- [ ] CD pipeline ArgoCD
- [ ] Chaos test

---

#### Fase 11 — Launch & Iterasi

**Durasi:** Minggu 16 dan seterusnya

- [ ] npm publish
- [ ] GitHub open source
- [ ] Landing page + docs
- [ ] Soft launch 50 beta user
- [ ] Dependabot + security scan
- [ ] **SLO review: tambahkan metrik AwaitingUserDecision resolution rate dan fast path adoption rate** [NEW]
- [ ] Pricing tier review

---

## 10. Poin Kritis yang Wajib Diperhatikan

### Fondasi — Tidak Bisa Diubah Belakangan

**`Result<T,E>` dikunci sebelum baris bisnis apapun [NEW]**
Pattern error handling menyebar ke seluruh codebase dalam 500 commit pertama. Codebase yang setengahnya throw exceptions dan setengahnya return null tidak bisa di-refactor tanpa effort besar.

**`@bureau/core` harus benar-benar framework-agnostic**
Kalau core bergantung ke NestJS atau Next.js, Pilar 1 tidak bisa jalan di komputer user.

**State hanya boleh hidup di MongoDB**
Batas ini harus explicit dan terdokumentasi: Redis untuk ephemeral (cache, rate limit, BullMQ jobs). MongoDB untuk semua state yang matter. Tidak ada pengecualian.

**Outbox pattern wajib sejak Fase 1**
Tanpa outbox, crash antara DB write dan BullMQ enqueue menyebabkan pesan hilang selamanya.

**`cost_analytics` write path dari hari pertama [NEW]**
Data yang tidak pernah di-capture tidak bisa di-backfill. Schema-nya dengan `retryAttempt`, `isEscalated`, `userId` harus benar dari awal.

### Biaya LLM

**Finance atomic reservation — bukan read-modify-write [NEW]**
Race condition budget adalah bug yang tidak pernah muncul di development tapi selalu muncul di production dengan concurrent users. `findOneAndUpdate` dengan `$gte` adalah satu-satunya cara yang benar.

**Escalation chain harus di-pre-approve [NEW]**
Finance SSC menyetujui total budget semua attempt sebelum task dimulai. Kalau budget tidak cukup untuk chain penuh, user diberi tahu di awal — bukan di tengah attempt ke-3.

**Cache financial data TTL = 0, tidak bisa di-override [NEW]**
Hard constraint, bukan konfigurasi. Classifier finansial dijalankan di setiap request sebagai runtime assertion, bukan hanya di test.

### Reliabilitas

**BullMQ native stalledInterval, bukan heartbeat custom [REVISED]**
Heartbeat custom yang menulis ke MongoDB setiap 10 detik adalah write storm yang tidak perlu. BullMQ sudah menyediakan stalled detection yang benar.

**Idempotency di semua BullMQ consumer [REVISED]**
BullMQ bisa re-deliver job yang sama. Setiap processor cek jobId di MongoDB sebelum memproses — kalau sudah ada, skip tanpa error.

**AwaitingUserDecision butuh background job timeout [NEW]**
Kalau user abandon session, task tidak boleh stuck selamanya. Background job scan task dengan state ini dan `expiresAt` yang sudah lewat, auto-execute default action.

**Graceful shutdown SIGTERM wajib ditest**
Kubernetes SIGTERM sebelum mematikan pod. Handler: stop accept new request → drain BullMQ jobs → close connections → exit 0.

### Skema dan Versioning [NEW]

**Mulai strict, migration nanti**
Tidak ada field "reserved for future use". Field ambigu tidak punya owner dan tidak punya deadline. Kalau butuh field baru, tulis migration script yang well-tested.

**Zod `.strip()` sebagai default**
Field tidak dikenal di-drop, bukan error. Ini memungkinkan rolling deployment di mana agent versi baru dan lama bisa berjalan bersamaan.

**ADR untuk setiap keputusan arsitektur besar**
Setiap ADR punya section `When to Revisit` — checklist kondisi kapan keputusan ini perlu di-review ulang.

---

## 11. ADR Template [NEW]

Setiap ADR disimpan di `docs/adr/ADR-XXX-nama-keputusan.md`:

```markdown
# ADR-XXX: [Judul Keputusan]

## Status

Accepted — YYYY-MM-DD

## Context

[Situasi yang memaksa keputusan ini perlu dibuat.
Apa masalah yang sedang diselesaikan? Mengapa ini perlu diputuskan sekarang?]

## Options Considered

### Option 1: [Nama opsi]

- Pro: ...
- Con: ...
- Rejected/Accepted karena: ...

### Option 2: [Nama opsi]

- Pro: ...
- Con: ...
- Rejected/Accepted karena: ...

## Decision

[Keputusan yang diambil dalam satu kalimat.]

## Consequences

### Diterima

- [Trade-off positif yang disadari]

### Trade-off yang disadari

- [Trade-off negatif yang disadari dan diterima]

## When to Revisit

Keputusan ini perlu di-review kalau:

- [ ] [Kondisi konkret yang mengindikasikan keputusan ini mungkin salah]
- [ ] [Metrik atau threshold yang menjadi trigger review]

## Known Unknowns saat keputusan dibuat

- [Asumsi yang belum terverifikasi]
- [Data yang tidak ada saat keputusan dibuat]
```

**ADR yang harus ditulis di Fase 0-5:**

- `ADR-001-bullmq-only.md` — kenapa RabbitMQ tidak dipakai di MVP
- `ADR-002-result-pattern.md` — kenapa Result<T,E> bukan exceptions
- `ADR-003-fast-path-classifier.md` — rule-based vs LLM confidence
- `ADR-004-escalation-chain.md` — desain AwaitingUserDecision state
- `ADR-005-cache-ttl-categories.md` — category-based TTL vs binary keyword
- `ADR-006-schema-strict-no-reserved.md` — strict schema vs reserved fields

---

## 12. Checklist Production Readiness

### Fondasi [REVISED]

- [ ] `Result<T,E>` dipakai di seluruh business logic, tidak ada throw
- [ ] Correlation ID di setiap log entry via `logger.child({ taskId, correlationId })`
- [ ] `@bureau/core` tidak mengandung import dari framework apapun
- [ ] Semua state agent baca dan tulis dari MongoDB
- [ ] Redis boundary rule terdokumentasi: hanya untuk ephemeral data
- [ ] Outbox pattern aktif di semua publisher
- [ ] Semua BullMQ consumer idempoten dengan deduplikasi jobId
- [ ] Kontrak Zod semua message punya `schemaVersion`
- [ ] ADR ditulis untuk semua keputusan arsitektur besar

### Biaya [REVISED]

- [ ] Finance SSC pakai atomic `findOneAndUpdate` + `$gte` untuk budget debit
- [ ] Budget reservation array aktif — bisa release kalau task gagal
- [ ] Escalation chain di-pre-approve Finance sebelum task dimulai
- [ ] `cost_analytics` write path aktif dari hari pertama
- [ ] Financial prompt classifier — TTL = 0, tidak bisa di-override
- [ ] Hard limit tiga lapis aktif (per-request, per-task, per-tenant)
- [ ] Spending anomaly detection: per-tenant rolling average, alert 3x
- [ ] `pricing.config.ts` terisi, alert delta 20% aktif

### Keamanan

- [ ] Semua endpoint dilindungi auth + rate limit
- [ ] Idempotency-Key di-enforce pada POST /tasks
- [ ] User LLM API key dienkripsi AES-256-GCM
- [ ] Tenant isolation di-enforce di level repository
- [ ] Prompt injection detection di Compliance SSC
- [ ] Secrets tidak ada di codebase
- [ ] Trivy scan bersih, pnpm audit bersih

### Reliabilitas [REVISED]

- [ ] BullMQ `stalledInterval`, `lockDuration`, `maxStalledCount` dikonfigurasi
- [ ] SIGTERM handler ditest dan bekerja
- [ ] Circuit breaker aktif untuk semua dependency eksternal
- [ ] AwaitingUserDecision background job timeout aktif [NEW]
- [ ] Email transaksional Resend/Postmark untuk decision notification [NEW]
- [ ] Backpressure: queue lebih dari 1.000 → 503 + Retry-After
- [ ] MongoDB Atlas backup terjadwal dan restore pernah ditest

### Observability

- [ ] OpenTelemetry traces sampai di Jaeger
- [ ] Prometheus metrics scrape berhasil
- [ ] Grafana dashboard: tambahkan fast path ratio, escalation frequency
- [ ] Alert rules aktif
- [ ] Liveness dan readiness probe semua service
- [ ] Runbook ditulis

### SLO

| Metrik                               | Target                                 |
| ------------------------------------ | -------------------------------------- |
| Availability POST /tasks             | 99.9% per bulan                        |
| p95 latency POST /tasks              | kurang dari 500ms (bukan termasuk LLM) |
| Fast path p95 latency                | kurang dari 3 detik end-to-end         |
| p99 end-to-end happy path            | kurang dari 60 detik                   |
| AwaitingUserDecision resolution rate | lebih dari 70% dalam 2 jam             |
| Data durability                      | 99.999999999%                          |
| RPO                                  | 5 menit                                |
| RTO                                  | 30 menit                               |

### Variabel Environment Wajib [REVISED]

```bash
# Core
NODE_ENV=production
MONGO_URI=mongodb+srv://...
REDIS_URL=rediss://default:pass@host  # BullMQ + cache + rate limit
# [DIHAPUS] RABBITMQ_URL — tidak dipakai di MVP

# Auth
JWT_PUBLIC_KEY=...
JWT_ISSUER=https://auth.bureau.id
API_KEY_ENCRYPTION_KEY=...           # 32 byte hex untuk AES-256-GCM

# Email transaksional [NEW]
RESEND_API_KEY=re_...                 # atau POSTMARK_API_KEY

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...
DEEPSEEK_API_KEY=...
QWEN_API_KEY=...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
LOG_LEVEL=info

# Per service
DIVISION_NAME=production
BULLMQ_CONCURRENCY=8
MAX_LLM_CONCURRENCY=3
BULLMQ_LOCK_DURATION=60000
BULLMQ_STALLED_INTERVAL=30000
BULLMQ_MAX_STALLED_COUNT=2
```

---

## Referensi

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Next.js 15 App Router](https://nextjs.org/docs/app)
- [Fastify Documentation](https://fastify.dev)
- [BullMQ Documentation](https://docs.bullmq.io)
- [MongoDB Atlas Best Practices](https://www.mongodb.com/docs/atlas/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
- [XState v5](https://stately.ai/docs/xstate)
- [Vercel AI SDK](https://sdk.vercel.ai)
- [Twelve-Factor App](https://12factor.net)
- [Resend Documentation](https://resend.com/docs)
- Dokumen Riset: _Analisis Komprehensif Arsitektur Organisasi, Orkestrasi Proses Bisnis, dan Digitalisasi Sistem Perkantoran_

---

_Versi 4.0. Setiap perubahan dari v3.0 ditandai [REVISED] atau [NEW]. Keputusan arsitektur besar didokumentasikan di `docs/adr/`. Dokumen ini bersifat hidup — review setiap sprint, update kalau ada yang tidak sesuai dengan temuan di lapangan._
