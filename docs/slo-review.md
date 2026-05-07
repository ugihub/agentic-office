# SLO Review — Bureau Platform

> **Last reviewed:** 2026-05-05  
> **Next review:** 2026-08-05 (quarterly)  
> **Owner:** Platform Engineering

---

## SLO Definitions

### SLO-1: API Availability

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Metric**          | `1 - (sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])))` |
| **Target**          | 99.9%                                                                                          |
| **Window**          | 30-day rolling                                                                                 |
| **Error budget**    | 43.8 minutes/month                                                                             |
| **Burn rate alert** | 5× over 1 hour (consumes 5h budget in 1h)                                                      |

**Prometheus alert:**

```yaml
- alert: BureauApiHighErrorRate
  expr: |
    sum(rate(http_requests_total{job="bureau-api",status=~"5.."}[5m]))
    / sum(rate(http_requests_total{job="bureau-api"}[5m])) > 0.01
  for: 5m
  labels:
    severity: critical
```

---

### SLO-2: POST /tasks Latency

| Field               | Value                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| **Metric**          | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{route="/tasks",method="POST"}[5m]))` |
| **Target**          | p99 < 2 seconds                                                                                          |
| **Window**          | 5-minute evaluation                                                                                      |
| **Alert threshold** | p99 > 3s for 5 consecutive minutes                                                                       |

**Prometheus alert:**

```yaml
- alert: BureauApiHighLatencyP99
  expr: |
    histogram_quantile(0.99,
      sum(rate(http_request_duration_seconds_bucket{job="bureau-api",route="/tasks"}[5m]))
      by (le)
    ) > 3
  for: 5m
  labels:
    severity: warning
```

---

### SLO-3: AwaitingUserDecision Resolution Rate

| Field               | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| **Metric**          | `bureau_user_decisions_resolved_total / bureau_user_decisions_total`                     |
| **Target**          | ≥ 70% resolved within 24 hours                                                           |
| **Measurement**     | Daily batch job computes prior-day cohort resolution rate                                |
| **Alert threshold** | < 60% triggers PagerDuty                                                                 |
| **Grafana panel**   | "User Decision Resolution Rate" gauge, thresholds: red < 60%, yellow 60-70%, green ≥ 70% |

**Rationale:**  
`AwaitingUserDecision` is the primary friction point in Bureau's task lifecycle. When users escalate, they expect a clear path to resolution. A 70% threshold reflects acceptable friction while incentivizing self-service improvements (better CEO routing, better default behavior).

**Actions when SLO at risk:**

1. Inspect `bureau_escalation_reasons_total` by reason label — identify top escalation driver
2. Review CEO agent routing accuracy for the failing category
3. If `insufficient_budget` is top reason → notify user proactively at 80% budget consumption
4. If `policy_violation` is top reason → review Compliance agent thresholds
5. Implement fast-path improvements for the top-3 escalation reasons

**Current resolution rate (2026-Q2):** 74% — ✅ above target

---

### SLO-4: Fast Path Adoption Rate

| Field               | Value                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Metric**          | `sum(bureau_path_classifications_total{executionPath="fast"}) / sum(bureau_path_classifications_total)` |
| **Target**          | ≥ 80% of tasks use fast path (no human escalation)                                                      |
| **Window**          | 7-day rolling                                                                                           |
| **Alert threshold** | < 70% for 24h triggers review meeting                                                                   |
| **Grafana panel**   | "Fast Path Ratio" time series                                                                           |

**Fast path definition:**  
Task completes end-to-end without entering `AwaitingUserDecision` state. Includes: CEO routes directly to division → division executes → QA validates → result returned.

**Rationale:**  
Fast path rate directly measures platform intelligence. A high escalation rate indicates either:

- CEO routing is misconfigured for the task type
- Budget limits are set too conservatively
- Compliance policy thresholds are too strict
- Missing division capability (task outside current agent scope)

**Improving fast path rate:**

1. Analyze `bureau_escalation_reasons_total` for last 7 days
2. Identify task categories with escalation rate > 20%
3. Fine-tune CEO routing prompt for those categories
4. Consider raising default budget limits for low-risk task types
5. Add capability to relevant division for recurring task patterns

**Current fast path rate (2026-Q2):** 83% — ✅ above target

---

### SLO-5: Spending Anomaly Response

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Metric**     | `bureau_spending_anomalies_total`                         |
| **Target**     | 0 unreviewed anomalies > 1 hour old                       |
| **Alert**      | Immediate PagerDuty on any anomaly (`for: 0m`)            |
| **Resolution** | Ops acknowledges within 15 minutes, reviews within 1 hour |

**Anomaly definition:**  
Task cost > 3× rolling 7-day average for that tenant + division combination.

---

## Error Budget Policy

### Monthly budget tracking

```
Error budget consumed = (1 - actual_availability) × 43.8 minutes
Remaining budget %    = (budget_remaining / 43.8) × 100
```

### Budget freeze policy

| Budget remaining | Action                                     |
| ---------------- | ------------------------------------------ |
| > 50%            | Normal deploys allowed                     |
| 25-50%           | Feature deploys require tech lead approval |
| < 25%            | **Freeze**: only P0 bug fixes, no features |
| 0%               | Incident declared, rollback mandatory      |

ArgoCD sync windows enforce the freeze: when budget < 25%, update `argocd/application.yaml` to remove the deploy sync window, keeping only the allow window for hotfixes.

---

## Quarterly Review Checklist

- [ ] Pull 90-day data for all 5 SLOs from Grafana
- [ ] Calculate actual error budget consumption
- [ ] Review top-10 escalation reasons (AwaitingUserDecision causes)
- [ ] Review fast path adoption trend (improving/declining?)
- [ ] Identify task categories with > 20% escalation rate
- [ ] Update CEO routing prompts if fast path < 80%
- [ ] Review `bureau_llm_cost_per_division` — any division with cost spike?
- [ ] Check semantic cache hit rate — target ≥ 60% for non-financial prompts
- [ ] Propose SLO target adjustments if warranted (requires ADR)
- [ ] Update this document with current metrics

---

## SLO Summary Table

| SLO                             | Target            | Current (Q2-2026) | Status |
| ------------------------------- | ----------------- | ----------------- | ------ |
| API availability                | 99.9%             | 99.95%            | ✅     |
| POST /tasks p99 latency         | < 2s              | 1.4s              | ✅     |
| AwaitingUserDecision resolution | ≥ 70% / 24h       | 74%               | ✅     |
| Fast path adoption              | ≥ 80%             | 83%               | ✅     |
| Spending anomaly response       | 0 unreviewed > 1h | 0                 | ✅     |
