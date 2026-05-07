# Bureau — Operational Runbook

**Version:** 1.0  
**Last Updated:** 2026-05-05  
**On-Call:** platform@bureau.id

---

## Table of Contents

1. [Service Architecture Quick Reference](#1-service-architecture-quick-reference)
2. [Alert: BureauApiHighErrorRate](#2-alert-bureauapihigherrorrate)
3. [Alert: BureauApiHighLatencyP99](#3-alert-bureauapihighlatencyp99)
4. [Alert: BureauSpendingAnomalyDetected](#4-alert-bureauspendinganomaly)
5. [Alert: BureauQueueDepthHigh](#5-alert-bureauqueuedepthhigh)
6. [Alert: BureauAwaitingDecisionHigh](#6-alert-bureauawaitingdecisionhigh)
7. [Alert: BureauEscalationRateHigh](#7-alert-bureauescalationratehigh)
8. [Alert: BureauPromptInjectionSpike](#8-alert-bureaupromptiinjectionspike)
9. [Alert: BureauLlmCostBurnRateHigh](#9-alert-bureauLlmCostBurnRateHigh)
10. [Graceful Shutdown Procedure](#10-graceful-shutdown-procedure)
11. [Database Recovery Procedures](#11-database-recovery-procedures)
12. [Rollback Procedure](#12-rollback-procedure)
13. [SLO Reference](#13-slo-reference)

---

## 1. Service Architecture Quick Reference

```
Client → [Fastify API Server :3001]
              │
              ├── MongoDB Atlas (state)
              ├── Redis (BullMQ + cache)
              └── [BullMQ Workers]
                      │
                      ├── OutboxPublisher (poll 1s)
                      ├── DecisionTimeoutWorker (scan 60s)
                      └── Division Workers (SSC + Core)

Observability stack:
  OTel Collector → Jaeger (traces)
  Prometheus → Grafana (metrics + alerts)
  Pino → stdout (structured JSON logs)
```

### Key Ports

| Service            | Port       | Purpose           |
| ------------------ | ---------- | ----------------- |
| API Server         | 3001       | HTTP API          |
| API Server metrics | 9100       | Prometheus scrape |
| Workers metrics    | 9102       | Prometheus scrape |
| Prometheus         | 9090       | Metrics storage   |
| Grafana            | 3001 (ext) | Dashboards        |
| Jaeger UI          | 16686      | Trace viewer      |
| Redis              | 6379       | BullMQ + cache    |
| MongoDB            | 27017      | Primary state     |

### Health Checks

```bash
# Liveness — process running?
curl http://localhost:3001/health/live

# Readiness — MongoDB + Redis connected?
curl http://localhost:3001/health/ready
```

---

## 2. Alert: BureauApiHighErrorRate

**Severity:** CRITICAL  
**Trigger:** 5xx error rate > 1% for 2 minutes

### Likely Causes

1. MongoDB connection lost
2. BullMQ queue enqueue failure (Redis down)
3. Auth middleware crash (JWT key missing)
4. Unhandled exception in task route

### Investigation Steps

```bash
# 1. Check readiness probe
curl http://localhost:3001/health/ready

# 2. Check API server logs (last 100 lines)
docker logs bureau-api-server --tail=100 | grep '"level":50'

# 3. Check MongoDB connection
docker exec bureau-mongo mongosh --eval "db.adminCommand('ping')"

# 4. Check Redis
docker exec bureau-redis redis-cli ping

# 5. Check error rate in Grafana
# Dashboard: Bureau Main → API Latency → POST /tasks Latency
```

### Remediation

| Root Cause      | Action                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| MongoDB down    | Failover to Atlas replica — check Atlas dashboard                      |
| Redis down      | Restart Redis: `docker restart bureau-redis`                           |
| App crash loop  | Restart API server: `kubectl rollout restart deploy/bureau-api-server` |
| JWT key missing | Inject `JWT_PUBLIC_KEY` + `JWT_PRIVATE_KEY` via Doppler                |

### Escalation

If not resolved in 10 minutes → page engineering lead.

---

## 3. Alert: BureauApiHighLatencyP99

**Severity:** WARNING  
**Trigger:** POST /tasks p99 > 500ms for 5 minutes

### Likely Causes

1. MongoDB slow query (missing index, large document)
2. Redis latency spike (memory pressure)
3. BullMQ queue backlog (workers not consuming)
4. CPU throttling in container (Kubernetes limits too low)

### Investigation Steps

```bash
# 1. Check queue depth — high queue = workers falling behind
# Grafana: Bureau Main → Queue Depth per Division

# 2. MongoDB slow queries
docker exec bureau-mongo mongosh --eval "db.setProfilingLevel(1, { slowms: 100 })"
docker exec bureau-mongo mongosh --eval "db.system.profile.find().sort({ts:-1}).limit(5).pretty()"

# 3. Redis memory
docker exec bureau-redis redis-cli info memory | grep used_memory_human

# 4. Check Jaeger for slow traces
# http://localhost:16686 → Service: bureau-api-server → Operation: POST /api/v1/tasks
```

### Remediation

| Root Cause         | Action                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Queue backlog      | Scale workers: `kubectl scale deploy/bureau-workers --replicas=5`            |
| MongoDB slow query | Add index or optimize query — see `deploy/mongo-init.js` for index reference |
| Redis memory       | Increase Redis memory limit or flush expired keys                            |
| CPU throttle       | Increase CPU limit in Helm values: `resources.limits.cpu`                    |

---

## 4. Alert: BureauSpendingAnomalyDetected

**Severity:** WARNING  
**Trigger:** Tenant spending > 3x rolling 7-day average

### Likely Causes

1. Legitimate spike (product launch, demo)
2. Runaway agent loop (bug in escalation logic)
3. Compromised API key (external attacker)
4. Prompt injection bypassing Compliance SSC

### Investigation Steps

```bash
# 1. Identify tenant and time window
# Grafana: Bureau Main → Spending Anomalies per Tenant

# 2. Check cost_analytics for tenant in MongoDB
mongosh bureau --eval "
db.cost_analytics.aggregate([
  { \$match: { tenantId: 'TENANT_ID', timestamp: { \$gte: new Date(Date.now() - 3600000) } } },
  { \$group: { _id: '\$model', totalCost: { \$sum: { \$toDouble: '\$costUsd' } }, count: { \$sum: 1 } } },
  { \$sort: { totalCost: -1 } }
])
"

# 3. Check for task loops (same taskId appearing many times)
mongosh bureau --eval "
db.agent_executions.find({ tenantId: 'TENANT_ID' }).sort({ startedAt: -1 }).limit(20).pretty()
"

# 4. Check API key usage
mongosh bureau --eval "
db.api_keys.findOne({ tenantId: 'TENANT_ID' }, { usage: 1, lastUsedAt: 1 })
"
```

### Remediation

| Root Cause       | Action                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| Legitimate spike | Acknowledge and monitor — contact tenant                                            |
| Runaway loop     | Freeze tenant budget: `db.budgets.updateOne({tenantId}, {\$set: {isFrozen: true}})` |
| Compromised key  | Revoke key: `DELETE /auth/keys/:keyId`                                              |
| Bug in agent     | Hotfix + deploy → coordinate with engineering                                       |

---

## 5. Alert: BureauQueueDepthHigh

**Severity:** CRITICAL (>1000) / WARNING (>500)  
**Trigger:** BullMQ division queue depth exceeds threshold

### Likely Causes

1. Workers crashed or scaled down
2. LLM provider rate limiting (429 cascade)
3. MongoDB writes slow (workers can't complete jobs)
4. Memory leak in worker process

### Investigation Steps

```bash
# 1. Check worker pod status
kubectl get pods -l app=bureau-workers

# 2. Check worker logs for errors
kubectl logs -l app=bureau-workers --tail=100 | grep '"level":50'

# 3. Check BullMQ dead letter queue depth
# BullMQ UI or Redis:
docker exec bureau-redis redis-cli llen "bull:bureau.dead-letter:failed"

# 4. Check LLM provider circuit breaker state
# In API response logs, look for circuit_breaker_state=open
```

### Remediation

```bash
# Scale workers immediately
kubectl scale deploy/bureau-workers --replicas=10

# If dead letter queue growing, investigate failed jobs
# BullMQ auto-retries with backoff — do NOT manually re-queue without investigating root cause

# If queue > 1000 and API not yet returning 503:
# The backpressure middleware should handle this automatically
# Verify: POST /tasks should return 503 + Retry-After header
```

---

## 6. Alert: BureauAwaitingDecisionHigh

**Severity:** WARNING  
**Trigger:** >10 tasks in AwaitingUserDecision for 30 minutes

### Likely Causes

1. Email notification not delivered (Resend API key missing/invalid)
2. User notification ignored (check email open rates)
3. Background timeout worker crashed
4. Decision UI not surfacing pending decisions

### Investigation Steps

```bash
# 1. Check email service
docker logs bureau-workers --tail=100 | grep "email"

# 2. Check decision timeout worker is running
kubectl get pods -l app=bureau-workers
kubectl logs -l app=bureau-workers | grep "decision-timeout"

# 3. Query pending decisions
mongosh bureau --eval "
db.task_envelopes.find(
  { currentStage: 'AwaitingUserDecision', 'pendingDecision.expiresAt': { \$lt: new Date() } },
  { taskId: 1, 'pendingDecision.expiresAt': 1, 'pendingDecision.notifiedAt': 1 }
).limit(10).pretty()
"

# 4. Manually trigger default action for expired tasks (if timeout worker is down)
# CAREFUL: This is irreversible. Confirm with task owner first.
# mongosh bureau --eval "
# db.task_envelopes.updateMany(
#   { currentStage: 'AwaitingUserDecision', 'pendingDecision.expiresAt': { \$lt: new Date() } },
#   { \$set: { currentStage: 'Formatting', updatedAt: new Date() } }
# )
# "
```

### Remediation

| Root Cause               | Action                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| Email API key invalid    | Update `RESEND_API_KEY` in Doppler → restart workers                            |
| Timeout worker crashed   | `kubectl rollout restart deploy/bureau-workers`                                 |
| UI not showing decisions | Forward to product team — check dashboard GET /tasks?stage=AwaitingUserDecision |

---

## 7. Alert: BureauEscalationRateHigh

**Severity:** WARNING  
**Trigger:** Escalation rate > 30% for 30 minutes

### Likely Causes

1. Economy model tier underperforming (QA rejecting consistently)
2. QA thresholds too strict (false negatives)
3. Specific prompt type triggering consistent failures
4. Economy model provider degraded (quality drop without errors)

### Investigation Steps

```bash
# 1. Check which model pairs are escalating most
# Grafana: Escalation Frequency by Reason

# 2. Check QA failure reasons in agent_executions
mongosh bureau --eval "
db.agent_executions.aggregate([
  { \$match: { division: 'QA', 'workers.attemptReason': 'qa_escalation' } },
  { \$unwind: '\$workers' },
  { \$group: { _id: '\$workers.attemptReason', count: { \$sum: 1 } } }
]).pretty()
"

# 3. Sample recent QA failure messages (intermediateOutputs in task_envelopes)
mongosh bureau --eval "
db.task_envelopes.find(
  { 'retryCount.qa': { \$gte: 2 } },
  { taskId: 1, 'intermediateOutputs.qa': 1 }
).sort({ updatedAt: -1 }).limit(5).pretty()
"
```

### Remediation

| Root Cause                    | Action                                            |
| ----------------------------- | ------------------------------------------------- |
| Economy model underperforming | Rotate economy model in HR SSC MODEL_REGISTRY     |
| QA too strict                 | Review QA thresholds — coordinate with product    |
| Provider quality drop         | Switch default economy tier to different provider |

---

## 8. Alert: BureauPromptInjectionSpike

**Severity:** CRITICAL  
**Trigger:** >0.1 injection attempts/sec over 15 minutes

**SECURITY INCIDENT — Follow incident response procedure immediately.**

### Investigation Steps

```bash
# 1. Check audit trail for injection attempts (prompts redacted)
mongosh bureau --eval "
db.audit_trail.find(
  { messageName: 'ComplianceViolation', 'payload.violationType': 'prompt_injection' },
  { taskId: 1, correlationId: 1, timestamp: 1, fromAgent: 1 }
).sort({ timestamp: -1 }).limit(20).pretty()
"

# 2. Check tenantId distribution of attacks
mongosh bureau --eval "
db.task_envelopes.aggregate([
  { \$match: { updatedAt: { \$gte: new Date(Date.now() - 900000) } } },
  { \$group: { _id: '\$tenantId', count: { \$sum: 1 } } },
  { \$sort: { count: -1 } }
]).limit(10).pretty()
"

# 3. Check if attacks from single API key
mongosh bureau --eval "
db.api_keys.find(
  { 'usage.totalRequests': { \$gt: 100 } },
  { keyPrefix: 1, tenantId: 1, lastUsedAt: 1, 'usage.totalRequests': 1 }
).sort({ lastUsedAt: -1 }).limit(10).pretty()
"
```

### Remediation

```bash
# Immediate: Block offending tenant
mongosh bureau --eval "db.budgets.updateOne({tenantId: 'ATTACKER_ID'}, {\$set: {isFrozen: true}})"

# Revoke API keys
curl -X DELETE https://api.bureau.id/api/v1/auth/keys/KEY_ID \
  -H "Authorization: Bearer ADMIN_JWT"

# Escalate to security team — this is a coordinated attack
# Document in incident tracker
```

---

## 9. Alert: BureauLlmCostBurnRateHigh

**Severity:** WARNING  
**Trigger:** LLM burn rate > $100/hour for 10 minutes

### Likely Causes

1. Multiple high-volume tenants simultaneously
2. Runaway task loop escalating to premium models
3. Premium model selected for all tasks (classifier bug)

### Investigation Steps

```bash
# 1. Check burn rate breakdown by provider/model
# Grafana: Bureau Main → LLM Cost by Provider

# 2. Top spenders in last 1 hour
mongosh bureau --eval "
db.cost_analytics.aggregate([
  { \$match: { timestamp: { \$gte: new Date(Date.now() - 3600000) } } },
  { \$group: { _id: { tenantId: '\$tenantId', model: '\$model' }, total: { \$sum: { \$toDouble: '\$costUsd' } } } },
  { \$sort: { total: -1 } },
  { \$limit: 10 }
]).pretty()
"

# 3. Check escalated task ratio
mongosh bureau --eval "
db.cost_analytics.aggregate([
  { \$match: { timestamp: { \$gte: new Date(Date.now() - 3600000) } } },
  { \$group: { _id: '\$isEscalated', total: { \$sum: { \$toDouble: '\$costUsd' } } } }
]).pretty()
"
```

---

## 10. Graceful Shutdown Procedure

```bash
# 1. Stop new task submissions (optional — Kubernetes does this via readiness probe removal)
kubectl cordon <node>

# 2. Signal graceful shutdown to API server
kubectl delete pod <bureau-api-pod>
# Kubernetes sends SIGTERM → 30s drain → SIGKILL

# 3. Monitor drain in logs
kubectl logs <bureau-api-pod> -f | grep "shutdown"

# Expected log sequence:
# "SIGTERM received — stopping new requests"
# "Draining BullMQ workers..."
# "All workers drained"
# "MongoDB disconnected"
# "Redis disconnected"
# "Graceful shutdown complete — exit 0"

# 4. Verify no orphaned tasks
mongosh bureau --eval "
db.task_envelopes.find(
  { currentStage: { \$nin: ['Completed', 'Failed', 'Cancelled', 'AwaitingUserDecision'] } }
).count()
"
# Count > 0 after shutdown = tasks were interrupted and will resume on next worker start
# They will be picked up via BullMQ stall detection (stalledInterval=30s)
```

---

## 11. Database Recovery Procedures

### MongoDB Atlas — Point-in-Time Recovery

```bash
# Atlas automatically backs up with RPO=5min, RTO=30min.
# Access: Atlas Dashboard → Clusters → Bureau → Backup → Restore

# Manual backup trigger (Atlas CLI):
atlas backup snapshots create bureau-cluster --desc "pre-deploy-$(date +%Y%m%d)"

# Verify backup
atlas backup snapshots list bureau-cluster --limit 5

# Restore to specific point in time (Atlas UI recommended for safety)
# Note: Restore to new cluster first, verify data, then switch connection strings
```

### Redis — Data Recovery

Redis contains only ephemeral data (BullMQ jobs, cache, rate limits). On Redis loss:

1. **BullMQ jobs**: Lost if not in outbox. Outbox pattern ensures no permanent message loss — MongoDB outbox re-publishes on next poll cycle.
2. **Cache**: Transparent miss — requests fall through to LLM. Performance degraded temporarily.
3. **Rate limits**: Reset to zero — brief window of higher traffic possible.

```bash
# Restart Redis (ephemeral data loss is acceptable)
docker restart bureau-redis
# OR
kubectl rollout restart statefulset/bureau-redis

# BullMQ jobs will be re-enqueued from outbox automatically within 1 second
```

---

## 12. Rollback Procedure

### Kubernetes Rolling Rollback

```bash
# List deployment history
kubectl rollout history deployment/bureau-api-server
kubectl rollout history deployment/bureau-workers

# Rollback to previous version
kubectl rollout undo deployment/bureau-api-server
kubectl rollout undo deployment/bureau-workers

# Rollback to specific revision
kubectl rollout undo deployment/bureau-api-server --to-revision=3

# Monitor rollback
kubectl rollout status deployment/bureau-api-server
```

### ArgoCD Rollback

```bash
# Via ArgoCD CLI
argocd app rollback bureau --revision <REVISION>

# Via ArgoCD UI: Apps → bureau → History → Rollback
```

### Database Schema Migration Rollback

Bureau uses strict schemas with explicit `schemaVersion`. If a migration is problematic:

1. Do NOT delete documents — use `anonymizeUserData()` patterns
2. Add V2Schema to discriminated union in `@bureau/contracts`
3. Deploy code that handles both V1 and V2 simultaneously
4. Backfill migration script with verification step

---

## 13. SLO Reference

| Metric                          | Target                            | Alert              |
| ------------------------------- | --------------------------------- | ------------------ |
| POST /tasks availability        | 99.9% per month                   | < 99.0% → CRITICAL |
| POST /tasks p95 latency         | < 500ms (API overhead, excl. LLM) | > 500ms → WARNING  |
| Fast path p95 end-to-end        | < 3 seconds                       | > 5s → WARNING     |
| Full path p99 end-to-end        | < 60 seconds                      | > 120s → WARNING   |
| AwaitingUserDecision resolution | > 70% in 2 hours                  | < 50% → WARNING    |
| Data durability                 | 99.999999999% (Atlas)             | N/A                |
| RPO                             | 5 minutes                         | > 10min → CRITICAL |
| RTO                             | 30 minutes                        | > 60min → CRITICAL |

### Error Budget Calculation

```
Monthly error budget = 1 - 0.999 = 0.1% = 43.8 minutes downtime/month
Weekly budget = 43.8 / 4.3 = ~10 minutes/week

If budget < 50% remaining → freeze risky deployments
If budget < 10% remaining → freeze ALL deployments
```

---

_Runbook version 1.0 — Bureau Phase 9 Production Hardening._  
_Update this document whenever alert behavior changes._
