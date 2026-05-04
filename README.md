# Bureau — Multi-Agent AI Platform

[![CI](https://github.com/bureau-id/bureau/actions/workflows/ci.yml/badge.svg)](https://github.com/bureau-id/bureau/actions/workflows/ci.yml)
[![Security Scan](https://github.com/bureau-id/bureau/actions/workflows/security.yml/badge.svg)](https://github.com/bureau-id/bureau/actions/workflows/security.yml)
[![npm @bureau/sdk](https://img.shields.io/npm/v/@bureau/sdk?label=%40bureau%2Fsdk)](https://www.npmjs.com/package/@bureau/sdk)
[![npm @bureau/mcp-server](https://img.shields.io/npm/v/@bureau/mcp-server?label=%40bureau%2Fmcp-server)](https://www.npmjs.com/package/@bureau/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

Bureau simulates a corporate structure with autonomous AI agents — CEO, HR, Finance, Compliance, Production, QA, and Marketing divisions — to coordinate complex multi-step tasks via a single API call or Claude Code plugin.

---

## Three Pillars

| Pillar | What it is | Use case |
|--------|-----------|----------|
| **MCP Plugin** | `npx @bureau/mcp-server` stdio plugin | Claude Code / Gemini CLI users wanting one-click AI task delegation |
| **SaaS API** | Hosted Fastify REST API at `api.bureau.id` | Teams wanting managed infrastructure, billing, and SLAs |
| **Self-hosted** | Docker Compose stack, open source | Enterprises needing full data sovereignty |

---

## Quick Start

### MCP Plugin (Claude Code)

Add Bureau to Claude Code in one command:

```bash
claude mcp add bureau -- npx @bureau/mcp-server
```

Then in Claude Code:

```
/bureau submit "Research competitors and produce a 5-page strategic report"
```

### TypeScript SDK

```bash
npm install @bureau/sdk
```

```typescript
import { BureauClient } from '@bureau/sdk';

const bureau = new BureauClient({ apiKey: process.env.BUREAU_API_KEY });

const task = await bureau.tasks.submit({
  prompt: 'Analyze Q2 financials and flag anomalies above Rp 10M',
  division: 'finance',
  budget: { amount: '50000', currency: 'IDR' },
});

// Stream progress
for await (const event of bureau.tasks.stream(task.id)) {
  console.log(event.type, event.data);
}
```

### Self-hosted (Docker Compose)

```bash
git clone https://github.com/bureau-id/bureau.git
cd bureau
cp .env.example .env          # fill in ANTHROPIC_API_KEY, MONGODB_URI, REDIS_URL
docker compose up -d
```

API ready at `http://localhost:3000`. Grafana dashboard at `http://localhost:3001`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│   Claude Code (MCP)   │   SDK / REST API   │   Self-hosted UI   │
└───────────┬───────────┴────────┬───────────┴─────────┬─────────┘
            │                   │                       │
            ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Fastify API Server                           │
│   Auth · Rate Limit · Tenant Isolation · OpenTelemetry          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ BullMQ jobs
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                          │
│   XState 5 state machine · AwaitingUserDecision · Outbox        │
└──────┬──────────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
   CEO Agent  HR Agent  Finance   Compliance   QA Agent
   (routes)  (hiring)  (budget)  (policy)    (review)
       │          │          │          │          │
       └──────────┴──────────┴──────────┴──────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              MongoDB       Redis       Upstash
            (state/outbox) (BullMQ)  (vector cache)
```

### Key Design Decisions

- **`Result<T, E>` everywhere** — no `throw` in business logic; all errors are typed values
- **BullMQ only** — single queue technology (ADR-001); no RabbitMQ/SQS sprawl
- **Financial TTL = 0** — finance-category LLM responses never cached (ADR-003)
- **Atomic budget reservation** — `findOneAndUpdate + $gte`, no read-modify-write races
- **Distroless Docker** — `gcr.io/distroless/nodejs20-debian12:nonroot`, no shell, uid=65532
- **Outbox pattern** — MongoDB write + BullMQ enqueue are atomic; no lost jobs
- **`@bureau/core` is framework-free** — zero Fastify/BullMQ imports in core domain logic

Full architecture decisions in [`docs/adr/`](docs/adr/).

---

## Repository Structure

```
bureau/
├── packages/
│   ├── shared-kernel/      # Result<T,E>, ULID, Money, error hierarchy
│   ├── contracts/          # Zod schemas for all domain objects
│   ├── core/               # Domain logic — zero framework imports
│   ├── telemetry/          # OpenTelemetry setup, metrics
│   └── llm-providers/      # Vercel AI SDK adapters, semantic cache
├── pillars/
│   ├── api-server/         # Fastify REST API
│   ├── workers/            # BullMQ worker processes
│   ├── mcp-server/         # MCP stdio plugin (@bureau/mcp-server)
│   └── sdk/                # TypeScript SDK (@bureau/sdk)
├── agents/                 # CEO, HR, Finance, Compliance, QA, Marketing agents
├── tests/
│   ├── e2e/                # End-to-end scenarios
│   ├── load/               # k6 load tests
│   ├── security/           # Security pattern tests
│   └── chaos/              # Chaos engineering scenarios
├── deploy/
│   ├── helm/bureau/        # Kubernetes Helm chart
│   ├── argocd/             # GitOps applications
│   ├── grafana/            # Dashboard provisioning
│   └── scripts/            # Atlas backup, deployment scripts
└── docs/
    ├── adr/                # Architecture Decision Records
    ├── runbook.md          # On-call operational runbook
    ├── slo-review.md       # SLO definitions and thresholds
    └── pricing-tiers.md    # Pricing tier documentation
```

---

## Divisions

| Division | Responsibility | Key metric |
|----------|---------------|------------|
| **CEO** | Task routing, escalation decisions | Escalation rate < 5% |
| **HR** | Agent lifecycle, capability registry | Agent availability > 99% |
| **Finance** | Budget reservation, spend tracking | Atomic reservation success rate |
| **Compliance** | Policy enforcement, audit log | Zero policy bypass |
| **Production** | Task execution, retry logic | p95 latency < 2s |
| **QA** | Output validation, quality gates | Pass rate > 95% |
| **Marketing** | Async report generation, content | Completion rate > 98% |

---

## Observability

Bureau ships with Prometheus metrics and a Grafana dashboard out of the box:

- **Fast path ratio** — % tasks resolved without human escalation (SLO: ≥ 80%)
- **AwaitingUserDecision resolution rate** — % escalations resolved < 24h (SLO: ≥ 70%)
- **LLM cost burn rate** — cost per provider per division
- **Queue depth** — per-division BullMQ queue saturation
- **Semantic cache hit rate** — Upstash Vector cache effectiveness
- **p50/p95/p99 latency** — per endpoint

Import [`deploy/grafana/dashboards/bureau-main.json`](deploy/grafana/dashboards/bureau-main.json) into any Grafana instance.

---

## SLOs

| SLO | Target | Burn rate alert |
|-----|--------|-----------------|
| API error rate | < 1% | 5x over 1h |
| POST /tasks p99 latency | < 2s | > 3s for 5m |
| AwaitingUserDecision resolution | ≥ 70% within 24h | < 60% triggers PagerDuty |
| Fast path adoption | ≥ 80% of tasks | < 70% triggers review |
| Spending anomaly | 0 unreviewed | Any anomaly → immediate alert |

Error budget: **43.8 minutes/month** downtime at 99.9% target.

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local MongoDB + Redis)

### Setup

```bash
git clone https://github.com/bureau-id/bureau.git
cd bureau
pnpm install
cp .env.example .env
docker compose up -d mongodb redis
pnpm build
pnpm test
```

### Common commands

```bash
pnpm build          # Build all packages (Turborepo)
pnpm test           # Run all tests
pnpm typecheck      # TypeScript check across monorepo
pnpm lint           # ESLint
pnpm --filter @bureau/core test   # Test a single package
```

### Running locally

```bash
# Terminal 1 — API server
pnpm --filter @bureau/api-server dev

# Terminal 2 — Workers
pnpm --filter @bureau/workers dev
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines including:

- Branch strategy and commit convention (Conventional Commits)
- Critical non-negotiable rules (Result pattern, financial TTL, atomic budget)
- PR checklist
- Security reporting process

---

## Security

Report vulnerabilities via email: **security@bureau.id**

Do not open public GitHub issues for security vulnerabilities.

We follow responsible disclosure with a 90-day fix window.

---

## Pricing

| Tier | Price | Tasks/mo | Divisions |
|------|-------|----------|-----------|
| **Starter** | Rp 49.000 | 500 | CEO + 2 |
| **Growth** | Rp 149.000 | 2.000 | All divisions |
| **Scale** | Rp 349.000 | 10.000 | All + priority SLA |
| **Self-hosted** | Free | Unlimited | All |

Full pricing details in [`docs/pricing-tiers.md`](docs/pricing-tiers.md).

---

## License

[MIT](LICENSE) — Copyright 2026 Bureau Platform Team
