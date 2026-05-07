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
- [Tech Stack](#tech-stack)
- [Dependencies](#dependencies)
- [Instalasi & Setup](#instalasi--setup)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Dashboard Web UI](#dashboard-web-ui)
- [Menggunakan TypeScript SDK](#menggunakan-typescript-sdk)
- [Menggunakan MCP Plugin (Claude Code)](#menggunakan-mcp-plugin-claude-code)
- [Menggunakan REST API](#menggunakan-rest-api)
- [Arsitektur](#arsitektur)
- [Struktur Repo](#struktur-repo)
- [Divisions (Agent)](#divisions-agent)
- [Observability](#observability)
- [Perintah Development](#perintah-development)
- [Contributing](#contributing)

---

## Cara Penggunaan

Ada **4 cara** menggunakan Agentic Office:

| Cara                   | Cocok untuk                                    | Prasyarat                |
| ---------------------- | ---------------------------------------------- | ------------------------ |
| **Dashboard Web UI**   | Visual monitoring & submit task via browser    | Node.js + API key        |
| **MCP Plugin**         | Pengguna Claude Code                           | Node.js + API key        |
| **TypeScript SDK**     | Developer yang ingin integrasi ke kode sendiri | Node.js                  |
| **Self-hosted Docker** | Tim yang ingin infrastruktur sendiri           | Docker + MongoDB + Redis |

---

## Tech Stack

| Layer              | Teknologi                                                     |
| ------------------ | ------------------------------------------------------------- |
| **Backend API**    | Fastify 5, TypeScript 5, Node.js 20                           |
| **Frontend**       | Next.js 15 (App Router), React 19, Tailwind CSS 3             |
| **State/Realtime** | SSE (Server-Sent Events), SWR, React hooks                    |
| **Database**       | MongoDB 7 (via Mongoose)                                      |
| **Queue**          | BullMQ 5 (Redis-backed)                                       |
| **Agent State**    | XState 5 state machine                                        |
| **LLM Providers**  | Anthropic Claude (primary), OpenAI, Gemini, Mistral, DeepSeek |
| **Observability**  | OpenTelemetry, Jaeger, Prometheus, Grafana, Pino              |
| **Monorepo**       | Turborepo 2, pnpm workspaces                                  |
| **CI/CD**          | GitHub Actions                                                |

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

```
# Backend
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
xstate ^5.0.0           — State machine untuk agent lifecycle

# Frontend (Dashboard)
next ^15.0.0            — Next.js App Router
react ^19.0.0           — React 19
tailwindcss ^3.4.0      — Utility-first CSS
swr ^2.2.0              — Data fetching + polling
react-markdown ^9.0.0   — Render output markdown

# Dev tooling
vitest ^1.0.0           — Unit & integration testing
turbo ^2.0.0            — Monorepo build orchestration
typescript ^5.4.0       — TypeScript compiler
prettier ^3.0.0         — Code formatter
husky ^9.0.0            — Git hooks
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

Output: semua packages ter-compile ke `dist/` masing-masing.

### 7. Jalankan Tests

```bash
# Semua tests
pnpm test

# Test package spesifik
pnpm --filter "@bureau/core" test
pnpm --filter "@bureau/shared-kernel" test

# Watch mode
pnpm --filter "@bureau/core" test -- --watch
```

---

## Menjalankan Secara Lokal

Butuh **3 terminal** untuk menjalankan backend stack penuh + **1 terminal tambahan** untuk Dashboard:

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

**Terminal 4 — Dashboard (Frontend)**

```bash
pnpm --filter "@bureau/dashboard" dev
# Dashboard berjalan di http://localhost:3000
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

## Dashboard Web UI

Dashboard adalah antarmuka visual berbasis Next.js 15 untuk memantau dan mengontrol agent secara realtime.

**URL:** `http://localhost:3000`

### Fitur Dashboard

| Fitur              | Deskripsi                                                             |
| ------------------ | --------------------------------------------------------------------- |
| **Task List**      | Tabel semua task dengan status, stage, biaya, dan timestamp           |
| **New Task Form**  | Form submit task dengan pilihan budget dan model tier                 |
| **Task Detail**    | Halaman detail task dengan SSE realtime stream                        |
| **Stage Progress** | Visual progress bar 7 stage (Submitted → Completed)                   |
| **Division Cards** | 8 kartu agent (CEO, HR, Finance, dll.) dengan indikator live activity |
| **Decision Panel** | Panel interaktif untuk Approve/Best Effort/Cancel saat eskalasi       |
| **Event Log**      | Stream semua SSE event mentah untuk debugging                         |
| **Settings**       | Konfigurasi API URL dan API Key, tersimpan di localStorage            |

### Setup Environment Dashboard

```bash
cd apps/dashboard
cp .env.local.example .env.local
```

Edit `apps/dashboard/.env.local`:

```env
NEXT_PUBLIC_BUREAU_API_URL=http://localhost:3001
NEXT_PUBLIC_BUREAU_API_KEY=bureau_live_your_key_here
```

> **Catatan:** Environment variable `NEXT_PUBLIC_*` dapat di-override di runtime melalui halaman Settings (`/settings`) — nilai disimpan di `localStorage` browser.

### Menjalankan Dashboard

```bash
# Development (hot reload)
pnpm --filter "@bureau/dashboard" dev

# Build production
pnpm --filter "@bureau/dashboard" build

# Start production server
pnpm --filter "@bureau/dashboard" start
```

### Alur Penggunaan Dashboard

#### 1. Submit Task Baru

1. Buka `http://localhost:3000`
2. Klik tombol **"＋ New Task"** di kanan atas atau sidebar
3. Isi form:
   - **Task Prompt** (wajib) — deskripsi task untuk agent
   - **Max Budget** (opsional) — batas pengeluaran dalam USD
   - **Model Tier** — Economy / Standard / Premium
4. Klik **"Submit Task to Agents"**
5. Browser otomatis redirect ke halaman detail task

#### 2. Monitor Task Realtime

Di halaman Task Detail (`/tasks/:id`):

- **Stage Progress** — visual progress bar menunjukkan posisi task saat ini
- **Division Cards** — kartu agent yang sedang aktif berdenyut (pulsing indicator)
- **Event Log** — semua SSE event masuk secara realtime
- **● live** — indikator kanan atas bahwa SSE stream aktif
- Klik **"Cancel"** untuk membatalkan task yang berjalan

#### 3. Menangani Eskalasi (AwaitingUserDecision)

Saat agent memerlukan keputusan manusia:

1. **Decision Panel** muncul otomatis berwarna amber
2. Panel menampilkan:
   - Alasan eskalasi (teks dari agent)
   - Countdown timer (waktu sebelum timeout)
   - Estimasi kualitas output best-effort (jika tersedia)
   - Estimasi biaya eskalasi ke model yang lebih baik (jika tersedia)
3. Pilih salah satu aksi:
   - **Approve & Escalate** — tambah budget, gunakan model yang lebih baik
   - **Use Best Effort** — terima output seadanya tanpa eskalasi
   - **Cancel** — batalkan task

#### 4. Konfigurasi API Connection

Buka **Settings** (`/settings`) untuk:

1. Ubah **API Server URL** (default: `http://localhost:3001`)
2. Masukkan **API Key** (format: `bureau_live_...`)
3. Klik **"Test Connection"** untuk verifikasi
4. Klik **"Save Settings"** — tersimpan di localStorage

---

### Arsitektur Dashboard

```
apps/dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout dengan Sidebar
│   │   ├── page.tsx            # Homepage — TaskList
│   │   ├── globals.css         # Tailwind base styles
│   │   ├── settings/
│   │   │   └── page.tsx        # Settings form (API URL + Key)
│   │   └── tasks/
│   │       ├── new/
│   │       │   └── page.tsx    # Form submit task baru
│   │       └── [id]/
│   │           └── page.tsx    # Task detail + SSE stream
│   │
│   ├── components/             # UI components
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── TaskList.tsx        # Tabel semua task (SWR polling)
│   │   ├── TaskForm.tsx        # Form submit task
│   │   ├── StageProgress.tsx   # Progress bar 7 stage
│   │   ├── StageBadge.tsx      # Badge status/stage
│   │   ├── DivisionCards.tsx   # Grid 8 kartu agent division
│   │   ├── DecisionPanel.tsx   # Panel eskalasi dengan countdown
│   │   └── EventLog.tsx        # Log SSE event realtime
│   │
│   ├── hooks/
│   │   ├── useTaskStream.ts    # Hook SSE realtime stream
│   │   └── useSettings.ts      # Hook baca/tulis settings localStorage
│   │
│   └── lib/
│       └── bureau-client.ts    # Factory BureauClient dari @bureau/sdk
│
├── .env.local.example          # Template environment variables
├── next.config.ts              # Next.js config (transpile @bureau/sdk)
├── tailwind.config.ts          # Tema warna brand (biru)
├── tsconfig.json               # TypeScript config (path alias @/)
└── package.json
```

### Komponen Utama Dashboard

#### `useTaskStream` Hook

Hook utama untuk SSE realtime. Mengelola koneksi `BureauClient.streamTask()` dan memperbarui state React:

```typescript
// Contoh penggunaan
const stream = useTaskStream(taskId, isActive);

// stream.currentStage   — stage saat ini
// stream.activeDivision — agent division yang sedang bekerja
// stream.divisionMessages — pesan terakhir per division
// stream.pendingDecision  — data eskalasi (jika AwaitingUserDecision)
// stream.finalOutput     — output akhir task
// stream.events          — semua SSE event raw
// stream.done            — true jika task selesai/gagal
// stream.error           — pesan error (jika gagal)
```

#### `bureau-client.ts`

Factory function yang membaca settings (env var atau localStorage) lalu membuat instance `BureauClient`:

```typescript
import { createBureauClient } from "@/lib/bureau-client";

const client = createBureauClient();
// Menggunakan NEXT_PUBLIC_BUREAU_API_URL + NEXT_PUBLIC_BUREAU_API_KEY
// atau nilai dari localStorage jika user sudah set via Settings page
```

#### `TaskList` Component

Polling otomatis task list setiap 5 detik via SWR:

```typescript
const { data: tasks } = useSWR("tasks", fetcher, { refreshInterval: 5000 });
```

#### `DecisionPanel` Component

Panel eskalasi dengan countdown timer realtime:

```typescript
// Menampilkan countdown sampai decision timeout
// Action: "add_budget" | "best_effort" | "cancel"
<DecisionPanel
  taskId={taskId}
  decision={stream.pendingDecision}
  onSubmit={handleDecision}
/>
```

### Menambahkan Fitur ke Dashboard

#### Menambah Halaman Baru

```bash
# Buat file di app router
touch apps/dashboard/src/app/analytics/page.tsx
```

```typescript
// apps/dashboard/src/app/analytics/page.tsx
export default function AnalyticsPage() {
  return <div>Analytics</div>;
}
```

Tambahkan ke Sidebar (`src/components/Sidebar.tsx`):

```typescript
const NAV = [
  { href: "/", label: "Dashboard", icon: "⊞" },
  { href: "/tasks/new", label: "New Task", icon: "＋" },
  { href: "/analytics", label: "Analytics", icon: "📊" }, // tambahkan ini
  { href: "/settings", label: "Settings", icon: "⚙" },
];
```

#### Menambah Komponen Baru

```bash
touch apps/dashboard/src/components/CostChart.tsx
```

```typescript
"use client"; // tambahkan jika perlu browser API / hooks
import { createBureauClient } from "@/lib/bureau-client";

export function CostChart() {
  // gunakan createBureauClient() untuk fetch data
  return <div>...</div>;
}
```

#### Menggunakan SDK Method Baru

```typescript
import { createBureauClient } from "@/lib/bureau-client";

const client = createBureauClient();

// Semua method dari @bureau/sdk tersedia:
const tasks = await client.listTasks({ limit: 100 });
const task = await client.getTask(taskId);
await client.cancelTask(taskId);
await client.submitDecision(taskId, { action: "approve", reason: "..." });
```

#### Path Alias

Dashboard menggunakan alias `@/` yang mengarah ke `src/`:

```typescript
import { Sidebar } from "@/components/Sidebar";
import { useTaskStream } from "@/hooks/useTaskStream";
import { createBureauClient } from "@/lib/bureau-client";
```

### Troubleshooting Dashboard

**Dashboard tidak bisa connect ke API**

```
Failed to load tasks — check Settings → API connection
```

Solusi:

1. Pastikan API server berjalan: `curl http://localhost:3001/health/ready`
2. Buka `/settings` di dashboard
3. Verifikasi API URL dan API Key benar
4. Klik "Test Connection"

**CORS error di browser console**

Tambahkan `http://localhost:3000` ke allowed origins di API server (`pillars/api-server`).

**TypeScript error: `Cannot find module '@bureau/sdk'`**

```bash
# Rebuild SDK terlebih dahulu
pnpm --filter "@bureau/sdk" build

# Kemudian restart dashboard dev server
pnpm --filter "@bureau/dashboard" dev
```

**SSE stream tidak update**

- Pastikan task ID benar (cek URL)
- Buka DevTools → Network → filter `text/event-stream` untuk melihat SSE events
- Pastikan task masih `running` (bukan `completed`/`failed`)

**Hot reload tidak bekerja di Windows**

Tambahkan ke `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ["@bureau/sdk"],
  webpack: (config) => {
    config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    return config;
  },
};
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
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                               │
│  Dashboard (Next.js)  │  MCP (Claude Code)  │  SDK / REST API       │
└──────────┬────────────┴──────────┬──────────┴──────────┬────────────┘
           │ HTTP + SSE            │ stdio              │ HTTP
           ▼                       ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Fastify API Server (:3001)                            │
│  Auth · Rate Limit · Tenant Isolation · OpenTelemetry OTLP          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Outbox → BullMQ jobs
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                               │
│      XState 5 state machine · AwaitingUserDecision                  │
└──────┬─────────┬─────────┬─────────┬─────────┬─────────────────────┘
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
- **SSE untuk realtime** — Dashboard menggunakan Server-Sent Events (bukan WebSocket) untuk kemudahan deployment

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
│   └── dashboard/          # Next.js 15 Web Dashboard (port 3000)
│       ├── src/app/        # App Router pages
│       ├── src/components/ # UI components
│       ├── src/hooks/      # useTaskStream, useSettings
│       └── src/lib/        # bureau-client factory
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
    ├── superpowers/        # Implementation plans & design specs
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

# Build semua package (termasuk dashboard)
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

# Jalankan hanya dashboard dev server
pnpm --filter "@bureau/dashboard" dev

# Build hanya dashboard
pnpm --filter "@bureau/dashboard" build

# TypeCheck hanya dashboard
pnpm --filter "@bureau/dashboard" typecheck

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
