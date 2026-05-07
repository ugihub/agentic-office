# Pricing Tiers — Bureau Platform

> **Last reviewed:** 2026-05-05  
> **Owner:** Product

---

## Tiers Overview

|                       | **Starter**  | **Growth**    | **Scale**            | **Self-hosted** |
| --------------------- | ------------ | ------------- | -------------------- | --------------- |
| **Price**             | Rp 49.000/mo | Rp 149.000/mo | Rp 349.000/mo        | Free            |
| **Tasks/month**       | 500          | 2.000         | 10.000               | Unlimited       |
| **Overage**           | Rp 150/task  | Rp 100/task   | Rp 75/task           | —               |
| **Divisions**         | CEO + 2      | All 7         | All 7                | All 7           |
| **MCP Plugin**        | ✅           | ✅            | ✅                   | ✅              |
| **REST API**          | ✅           | ✅            | ✅                   | ✅              |
| **SDK access**        | ✅           | ✅            | ✅                   | ✅              |
| **Semantic cache**    | ✅           | ✅            | ✅                   | ✅              |
| **Fast path**         | ✅           | ✅            | ✅                   | ✅              |
| **Support**           | Community    | Email         | Priority email + SLA | Self            |
| **SLA**               | None         | 99.5%         | 99.9%                | None            |
| **Data retention**    | 7 days       | 30 days       | 90 days              | Configurable    |
| **Audit log**         | ❌           | ✅            | ✅                   | ✅              |
| **Custom divisions**  | ❌           | ❌            | ✅                   | ✅              |
| **SSO (SAML/OIDC)**   | ❌           | ❌            | ✅                   | ✅              |
| **Dedicated workers** | ❌           | ❌            | ✅                   | —               |
| **Webhook events**    | ❌           | ✅            | ✅                   | ✅              |
| **Budget alerts**     | ❌           | ✅            | ✅                   | ✅              |

---

## Tier Details

### Starter — Rp 49.000/month

Target: **individual developers and freelancers** testing Bureau or using it for personal projects.

**Included divisions:** CEO (routing) + choose 2 of: HR, Finance, Compliance, Production, QA, Marketing.

**Limits:**

- 500 tasks/month (hard cap, not rolling)
- Max 1 concurrent task
- Max prompt length: 4.000 tokens
- LLM budget per task: Rp 500 (configurable up to Rp 2.000)
- No team members (single user)

**Notes:**

- Starter division selection is fixed at sign-up. Change requires upgrade or contacting support.
- No SLA — best-effort availability.
- Tasks older than 7 days are purged from history.

---

### Growth — Rp 149.000/month

Target: **small teams and agencies** running Bureau in production for client work.

**Included divisions:** All 7 (CEO, HR, Finance, Compliance, Production, QA, Marketing).

**Limits:**

- 2.000 tasks/month
- Max 5 concurrent tasks
- Max prompt length: 16.000 tokens
- LLM budget per task: Rp 5.000 (configurable up to Rp 25.000)
- Up to 5 team members
- Webhook delivery for task lifecycle events

**SLA:** 99.5% monthly uptime (3h 39m allowance). Credit issued for breaches.

**Support:** Email support, 48h response time (business days).

---

### Scale — Rp 349.000/month

Target: **product companies and enterprises** with high task volume and compliance requirements.

**Included divisions:** All 7 + ability to add custom division agents.

**Limits:**

- 10.000 tasks/month
- Max 20 concurrent tasks
- Max prompt length: 32.000 tokens
- LLM budget per task: Rp 50.000 (configurable up to Rp 500.000)
- Unlimited team members
- SSO via SAML 2.0 or OIDC

**SLA:** 99.9% monthly uptime (43.8 min allowance). Credit: 10% for breach, 25% for > 4h downtime.

**Support:** Priority email, 8h response time (business days), dedicated Slack channel for incidents.

**Dedicated workers:** Task processing on dedicated BullMQ worker nodes — no noisy-neighbor risk.

**Custom divisions:** Bring your own agent prompt + tool set. Bureau handles orchestration, state machine, budget, and audit.

---

### Self-hosted — Free

Target: **enterprises with data sovereignty requirements** or developers wanting full control.

**How to deploy:**

```bash
git clone https://github.com/bureau-id/bureau.git
cd bureau
cp .env.example .env
docker compose up -d
```

**Responsibilities:**

- Provision and manage MongoDB, Redis, and LLM API keys
- Monitor with included Prometheus + Grafana stack (or your own)
- Apply security updates (Dependabot PRs in your fork)
- Handle backups (Atlas backup scripts included in `deploy/scripts/`)

**What's included:**

- Full source code (MIT license)
- Docker Compose stack (API server + workers + MongoDB + Redis + Grafana)
- Helm chart for Kubernetes (`deploy/helm/bureau/`)
- ArgoCD application manifests (`deploy/argocd/`)
- Operational runbook (`docs/runbook.md`)

**What's not included:**

- Hosted LLM API calls (you pay your own Anthropic/OpenAI bills)
- Support (community Discord only)
- Upstash Vector (configure your own or disable semantic cache)

---

## Billing

### Overage

Overage is charged per-task after monthly allocation exhausted:

| Tier    | Overage rate |
| ------- | ------------ |
| Starter | Rp 150/task  |
| Growth  | Rp 100/task  |
| Scale   | Rp 75/task   |

Overage billing is **post-paid**, invoiced at the start of the following month.

To avoid surprise bills, configure a **monthly overage cap** in the dashboard. When reached, new task submissions return `402 Payment Required` until the next billing cycle or cap is raised.

### LLM Cost Pass-through

Bureau passes through actual LLM API costs (Anthropic, OpenAI, Google) at 1.2× to cover infrastructure overhead. These costs come out of the **per-task LLM budget** you configure, not the monthly subscription.

Example:

```
Task submitted with budget: Rp 5.000
Actual Anthropic cost: Rp 3.200
Bureau pass-through (1.2×): Rp 3.840
Remaining budget returned: Rp 1.160
```

If a task would exceed its LLM budget, the Finance agent halts execution and enters `AwaitingUserDecision` with reason `insufficient_budget`.

### Payment Methods

- **Credit/debit card** (Visa, Mastercard, JCB) via Stripe
- **Bank transfer** (BCA, Mandiri, BRI) via Midtrans — available on Growth and Scale
- **Invoice net-30** — available on Scale only, minimum Rp 1.000.000/month

---

## Upgrade / Downgrade

- Upgrades are **immediate** — new limits apply instantly
- Downgrades take effect at the **next billing cycle**
- Downgrading from Scale to Growth: custom divisions are deactivated (tasks in progress complete first)
- Downgrading from Growth/Scale to Starter: only 2 divisions remain active; others are suspended (not deleted)

---

## Fair Use Policy

Bureau reserves the right to throttle or suspend accounts that:

- Exceed 10× their task allocation in a single day
- Submit prompts designed to circumvent Compliance agent policy
- Use Bureau to generate content that violates our Terms of Service

Throttling applies a 429 response with `Retry-After` header before any suspension.
