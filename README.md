# Bureau — Multi-Agent AI Platform

[![CI](https://github.com/ugihub/agentic-office/actions/workflows/ci.yml/badge.svg)](https://github.com/ugihub/agentic-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)

**Bureau** adalah platform multi-agent AI yang mengotomatisasi tugas kompleks menggunakan struktur organisasi korporat — CEO, HR, Finance, Compliance, Production, QA, dan Marketing — semuanya bekerja secara terkoordinasi dari satu permintaan.

> Untuk dokumentasi teknis lengkap (arsitektur, skema, dev guide): [DOKUMENTASI.md](DOKUMENTASI.md)

---

## Daftar Isi

- [Cara Menggunakan](#cara-menggunakan)
- [Prasyarat](#prasyarat)
- [Quick Start](#quick-start)
- [Dashboard Web](#dashboard-web)
- [TypeScript SDK](#typescript-sdk)
- [MCP Plugin (Claude Code)](#mcp-plugin-claude-code)
- [REST API](#rest-api)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Cara Menggunakan

Bureau tersedia dalam **4 cara**:

| Cara               | Cocok untuk                        | Butuh setup       |
| ------------------ | ---------------------------------- | ----------------- |
| **Dashboard Web**  | Monitor & submit task via browser  | Docker + API key  |
| **TypeScript SDK** | Integrasi ke kode aplikasi sendiri | API key           |
| **MCP Plugin**     | Delegasi tugas dari Claude Code    | Node.js + API key |
| **REST API**       | Integrasi dari bahasa apapun       | API key           |

---

## Prasyarat

| Dependency       | Versi | Install                                           |
| ---------------- | ----- | ------------------------------------------------- |
| Node.js          | ≥ 20  | [nodejs.org](https://nodejs.org)                  |
| pnpm             | ≥ 9   | `npm install -g pnpm@9`                           |
| Docker + Compose | ≥ 24  | [docker.com](https://docs.docker.com/get-docker/) |

**API key LLM (minimal satu):**

| Provider         | Env var             | Daftar                                                 |
| ---------------- | ------------------- | ------------------------------------------------------ |
| Anthropic Claude | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI           | `OPENAI_API_KEY`    | [platform.openai.com](https://platform.openai.com)     |
| Google Gemini    | `GEMINI_API_KEY`    | [aistudio.google.com](https://aistudio.google.com)     |
| Mistral          | `MISTRAL_API_KEY`   | [console.mistral.ai](https://console.mistral.ai)       |
| DeepSeek         | `DEEPSEEK_API_KEY`  | [platform.deepseek.com](https://platform.deepseek.com) |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/ugihub/agentic-office.git
cd agentic-office
pnpm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` — minimal yang wajib diisi:

```env
# Database & Queue (gunakan Docker di bawah)
MONGO_URI=mongodb://bureau:bureau_secret@localhost:27017/bureau?authSource=admin
REDIS_URL=redis://localhost:6379

# Auth — generate dulu dengan perintah di bawah
JWT_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
API_KEY_ENCRYPTION_KEY=  # generate: openssl rand -hex 32

# LLM — isi minimal satu
ANTHROPIC_API_KEY=sk-ant-xxxx
```

### 3. Generate JWT Keys

```bash
mkdir -p secrets
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/jwt-private.pem
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
# Convert ke PKCS#8 (wajib untuk library jose):
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in secrets/jwt-private.pem -out secrets/jwt-private-pkcs8.pem

# Generate encryption key:
openssl rand -hex 32
```

Salin isi file PEM ke `.env` sebagai nilai `JWT_PRIVATE_KEY_PEM` dan `JWT_PUBLIC_KEY_PEM` (gunakan `\n` untuk newline).

### 4. Jalankan Infrastruktur

```bash
docker compose up -d redis mongo
# Opsional: observability stack
docker compose up -d jaeger prometheus grafana
```

### 5. Build & Jalankan

```bash
pnpm build

# Terminal 1 — API Server
pnpm --filter "@bureau/api-server" dev

# Terminal 2 — Background Workers
pnpm --filter "@bureau/workers" dev

# Terminal 3 — Dashboard (opsional)
pnpm --filter "@bureau/dashboard" dev
```

### 6. Buat API Key Pertama

```bash
curl -X POST http://localhost:3001/auth/keys \
  -H "Authorization: Bearer $(cat secrets/jwt-dev.txt)" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-key","permissions":["task:read","task:write"]}'
```

Simpan key yang dikembalikan — **tidak akan muncul lagi**.

### 7. Submit Task Pertama

```bash
curl -X POST http://localhost:3001/tasks \
  -H "X-Api-Key: bureau_live_xxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt":"Buat ringkasan strategi pemasaran untuk produk SaaS B2B"}'
```

Respons:

```json
{
  "taskId": "task_01HXYZ...",
  "currentStage": "Submitted",
  "executionPath": "standard"
}
```

Cek status:

```bash
curl http://localhost:3001/tasks/task_01HXYZ... \
  -H "X-Api-Key: bureau_live_xxxx"
```

---

## Dashboard Web

URL: `http://localhost:3000` (jalankan dengan `pnpm --filter "@bureau/dashboard" dev`)

### Fitur

| Halaman        | Fungsi                                                         |
| -------------- | -------------------------------------------------------------- |
| **/**          | Daftar semua task dengan filter status, biaya, dan waktu       |
| **/tasks/new** | Form submit task baru (prompt, budget, model tier)             |
| **/tasks/:id** | Detail task realtime — stage progress, log agent, output akhir |
| **/settings**  | Konfigurasi API URL + API key (disimpan di localStorage)       |

### Alur Penggunaan

**Submit task:**

1. Klik **▶ New Task** di sidebar
2. Isi prompt dan (opsional) budget maksimum
3. Klik **Submit Task to Agents**
4. Dashboard redirect otomatis ke halaman detail

**Monitor realtime:**

- **Stage Progress** — bar progress 7 stage (Submitted → Completed)
- **Agent Divisions** — kartu 8 divisi, kartu aktif berdenyut + scan line
- **System Log** — terminal log dengan warna per divisi (CEO=biru, Finance=kuning, dst.)
- **◈ ◈ ◈ BUREAU AGENTS PROCESSING** — indikator saat agent bekerja

**Saat eskalasi (AwaitingUserDecision):**

Panel amber muncul otomatis dengan countdown timer. Pilih:

- **Approve & Escalate** — tambah budget, gunakan model lebih baik
- **Use Best Effort** — terima output seadanya
- **Cancel** — batalkan task

**Konfigurasi koneksi:**

1. Buka **/settings → Connection**
2. Masukkan API Server URL dan API Key
3. Klik **Test Connection** → **Save Settings**

### Settings Lanjutan

Tab **API Keys** — buat, lihat, dan cabut API key langsung dari dashboard.

Tab **Provider Keys** — simpan API key LLM pihak ketiga (Anthropic, Google, OpenAI, dll.) secara terenkripsi di server.

---

## TypeScript SDK

### Install

```bash
npm install @bureau/sdk
# atau
pnpm add @bureau/sdk
```

### Submit Task & Tunggu Selesai

```typescript
import { BureauClient } from "@bureau/sdk";

const client = new BureauClient({
  apiKey: process.env.BUREAU_API_KEY!,
  baseUrl: "http://localhost:3001",
});

const task = await client.submitTask({
  prompt:
    "Analisa kompetitor di segmen fintech Indonesia, buat laporan ringkas",
  constraints: {
    maxCostUsd: "0.50",
    preferredModelTier: "standard",
  },
  idempotencyKey: crypto.randomUUID(),
});

console.log("Task ID:", task.taskId);
```

### Stream Progress Realtime

```typescript
for await (const event of client.streamTask(task.taskId)) {
  switch (event.event) {
    case "task.stage.changed":
      console.log(`Stage: ${event.from} → ${event.to}`);
      break;
    case "division.progress":
      console.log(`[${event.division}] ${event.progress * 100}%`);
      break;
    case "decision_required":
      console.log("Eskalasi:", event.pendingDecision.reason);
      await client.submitDecision(task.taskId, "best_effort");
      break;
    case "task.completed":
      console.log("Output:", event.outputQuality);
      break;
    case "task.failed":
      console.error("Gagal:", event.reason);
      break;
  }
}
```

### Method Tersedia

```typescript
// Task management
client.submitTask(payload)
client.getTask(taskId)
client.listTasks({ limit, stage, executionPath })
client.cancelTask(taskId)
client.submitDecision(taskId, action)  // "best_effort" | "add_budget" | "cancel"
client.streamTask(taskId)              // AsyncIterable<BureauSSEEvent>

// API key management (butuh permission keys:read / keys:write)
client.createApiKey({ name, permissions, expiresInDays? })
client.listApiKeys()
client.revokeApiKey(keyId)

// Provider key management (butuh permission provider-keys:write)
client.storeProviderKey(provider, plaintextKey)
client.removeProviderKey(provider)
```

---

## MCP Plugin (Claude Code)

Plugin ini memungkinkan Claude Code mendelegasikan tugas langsung ke Bureau.

### Install

```bash
claude mcp add bureau -- npx @bureau/mcp-server
```

Set environment:

```bash
claude mcp edit bureau
# Tambahkan:
# BUREAU_API_URL: http://localhost:3001
# BUREAU_API_KEY: bureau_live_xxxx
```

Atau manual di `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "bureau": {
      "command": "node",
      "args": ["/path/to/agentic-office/pillars/mcp-server/dist/bin.js"],
      "env": {
        "BUREAU_API_URL": "http://localhost:3001",
        "BUREAU_API_KEY": "bureau_live_xxxx"
      }
    }
  }
}
```

### Tools yang Tersedia

| Tool                   | Fungsi                                     |
| ---------------------- | ------------------------------------------ |
| `bureau_submit_task`   | Submit task baru ke Bureau                 |
| `bureau_task_status`   | Cek status dan progress task               |
| `bureau_cancel_task`   | Batalkan task yang berjalan                |
| `bureau_task_decision` | Kirim keputusan untuk AwaitingUserDecision |

### Contoh di Claude Code

```
Delegasikan ke bureau: buat analisis SWOT kompetitor untuk produk kami
vs Tokopedia dan Shopee. Output dalam format markdown. Budget maksimum $0.50.
```

Claude Code akan submit task, monitor progres, dan notifikasi jika ada eskalasi yang memerlukan keputusan Anda.

---

## REST API

Base URL: `http://localhost:3001` (dev) | `https://api.bureau.id` (produksi)

Auth header semua request: `X-Api-Key: bureau_live_xxxx`

### Endpoint Utama

| Method   | Path                  | Fungsi                   | Permission   |
| -------- | --------------------- | ------------------------ | ------------ |
| `POST`   | `/tasks`              | Submit task baru         | `task:write` |
| `GET`    | `/tasks`              | List semua task          | `task:read`  |
| `GET`    | `/tasks/:id`          | Detail task              | `task:read`  |
| `GET`    | `/tasks/:id/stream`   | SSE realtime stream      | `task:read`  |
| `POST`   | `/tasks/:id/cancel`   | Batalkan task            | `task:write` |
| `POST`   | `/tasks/:id/decision` | Kirim keputusan eskalasi | `task:write` |
| `POST`   | `/auth/keys`          | Buat API key             | `keys:write` |
| `GET`    | `/auth/keys`          | List API key             | `keys:read`  |
| `DELETE` | `/auth/keys/:id`      | Hapus API key            | `keys:write` |
| `GET`    | `/health/live`        | Liveness probe           | —            |
| `GET`    | `/health/ready`       | Readiness probe          | —            |

### Submit Task

```http
POST /tasks
X-Api-Key: bureau_live_xxxx
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "prompt": "Buat proposal partnership dengan 3 vendor cloud terbesar",
  "constraints": {
    "maxCostUsd": "0.50",
    "preferredModelTier": "standard"
  }
}
```

Response `201`:

```json
{
  "taskId": "task_01HXYZ...",
  "currentStage": "Submitted",
  "executionPath": "standard",
  "submittedAt": "2026-05-08T00:00:00.000Z"
}
```

### Get Task

```http
GET /tasks/task_01HXYZ...
X-Api-Key: bureau_live_xxxx
```

Response saat `AwaitingUserDecision` menyertakan:

```json
{
  "currentStage": "AwaitingUserDecision",
  "pendingDecision": {
    "reason": "budget_insufficient_for_escalation",
    "bestEffortOutput": { "available": true, "qualityEstimate": 0.8 },
    "escalationOption": {
      "targetModel": "claude-opus-4-7",
      "additionalCostUsd": "0.32"
    },
    "expiresAt": "2026-05-09T00:00:00.000Z",
    "defaultAction": "best_effort"
  }
}
```

### Submit Decision

```http
POST /tasks/task_01HXYZ.../decision
X-Api-Key: bureau_live_xxxx
Content-Type: application/json

{ "action": "best_effort" }
```

Action: `"best_effort"` | `"add_budget"` | `"cancel"`

### SSE Stream

```http
GET /tasks/task_01HXYZ.../stream
X-Api-Key: bureau_live_xxxx
Accept: text/event-stream
```

Events:

```
event: task.stage.changed
data: {"from":"Producing","to":"Reviewing","at":"..."}

event: division.progress
data: {"division":"Production","progress":0.6}

event: decision_required
data: {"pendingDecision":{...}}

event: task.completed
data: {"outputQuality":"standard","costUsd":"0.032"}

event: task.failed
data: {"reason":"qa_max_retry","attempts":3}
```

---

## Troubleshooting

**API server tidak mau start — `JWT keys not configured`**

File PEM harus format PKCS#8 (`-----BEGIN PRIVATE KEY-----`). Konversi dari PKCS#1:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in secrets/jwt-private.pem -out secrets/jwt-private-pkcs8.pem
```

Salin isi file baru ke `JWT_PRIVATE_KEY_PEM` di `.env` (gunakan `\n` untuk newline).

**Workers error — `Command find requires authentication`**

`MONGO_URI` tidak terbaca. Pastikan script `dev` menggunakan `--env-file=../../.env`:

```json
"dev": "node --env-file=../../.env --watch dist/index.js"
```

**BullMQ warning — `WRONGTYPE` atau `allkeys-lru`**

BullMQ membutuhkan Redis dengan policy `noeviction`. Edit `docker-compose.yml`:

```yaml
command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy noeviction
```

Restart Redis: `docker compose stop redis && docker compose up redis -d`

**Dashboard tidak bisa connect ke API**

1. Cek API berjalan: `curl http://localhost:3001/health/ready`
2. Buka `/settings` di dashboard
3. Verifikasi URL dan API Key
4. Klik **Test Connection**

**TypeScript error: `Cannot find module '@bureau/sdk'`**

```bash
pnpm --filter "@bureau/sdk" build
pnpm --filter "@bureau/dashboard" dev  # restart setelah build
```

**Hot reload tidak bekerja di Windows**

Tambahkan ke `apps/dashboard/next.config.ts`:

```typescript
webpack: (config) => {
  config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
  return config;
},
```

---

## Observability

Setelah menjalankan `docker compose up -d jaeger prometheus grafana`:

| UI               | URL                      | Login                  |
| ---------------- | ------------------------ | ---------------------- |
| Dashboard Web    | `http://localhost:3000`  | —                      |
| API Server       | `http://localhost:3001`  | via API key            |
| Jaeger (Tracing) | `http://localhost:16686` | —                      |
| Prometheus       | `http://localhost:9090`  | —                      |
| Grafana          | `http://localhost:3002`  | admin / bureau_grafana |

---

## Contributing

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan kontribusi.

Untuk dokumentasi teknis lengkap — arsitektur, skema database, konvensi kode, cara menambah agent baru — baca [DOKUMENTASI.md](DOKUMENTASI.md).

---

## Lisensi

[MIT](LICENSE) — Copyright 2026 Bureau Team
