/**
 * Bureau Prometheus Metrics — per-division instrumentation.
 *
 * Uses OpenTelemetry Metrics API (OTLP export to Prometheus via otel-collector,
 * or direct scrape via prom-client as fallback).
 *
 * Metric naming convention: bureau_<subsystem>_<name>_<unit>
 *
 * Dashboards:
 *   - fast_path_ratio: fast path vs full path (target >30% fast)
 *   - escalation_frequency: how often tasks escalate model tier
 *   - awaiting_decision_count: stuck tasks needing user input
 *   - cost_burn_rate: USD/hour per tenant
 *   - queue_depth: BullMQ queue length per division
 */

import { metrics } from '@opentelemetry/api'
import type { Division } from '@bureau/contracts'

// ─── Meter instance ───────────────────────────────────────────────────────────

const METER_NAME = 'bureau'
const METER_VERSION = '1.0.0'

function getMeter() {
  return metrics.getMeter(METER_NAME, METER_VERSION)
}

// ─── Task lifecycle counters ──────────────────────────────────────────────────

/** Increment when a task is submitted */
export function recordTaskSubmitted(attrs: {
  executionPath: 'fast' | 'standard' | 'full'
  tenantId: string
}): void {
  getMeter()
    .createCounter('bureau_tasks_submitted_total', {
      description: 'Total tasks submitted, labelled by execution path',
    })
    .add(1, attrs)
}

/** Increment when a task reaches a terminal state */
export function recordTaskCompleted(attrs: {
  executionPath: 'fast' | 'standard' | 'full'
  tenantId: string
  outputQuality: 'standard' | 'best_effort'
  terminalState: 'Completed' | 'Failed' | 'Cancelled'
}): void {
  getMeter()
    .createCounter('bureau_tasks_completed_total', {
      description: 'Total tasks reaching terminal state',
    })
    .add(1, attrs)
}

// ─── Fast path ratio ──────────────────────────────────────────────────────────

/**
 * Track fast vs full path ratio.
 * Grafana panel: bureau_tasks_submitted_total{executionPath="fast"} /
 *                bureau_tasks_submitted_total
 */
export function recordPathClassification(path: 'fast' | 'standard' | 'full'): void {
  getMeter()
    .createCounter('bureau_path_classifications_total', {
      description: 'Path classifier decisions — fast/standard/full',
    })
    .add(1, { executionPath: path })
}

// ─── Escalation tracking ──────────────────────────────────────────────────────

/** Record each model escalation (QA reject → higher tier) */
export function recordEscalation(attrs: {
  fromModel: string
  toModel: string
  reason: 'qa_rejection' | 'budget_insufficient'
  tenantId: string
}): void {
  getMeter()
    .createCounter('bureau_escalations_total', {
      description: 'Model tier escalations triggered by QA rejection or budget',
    })
    .add(1, attrs)
}

// ─── AwaitingUserDecision gauge ───────────────────────────────────────────────

/**
 * Gauge for tasks stuck in AwaitingUserDecision.
 * Alert if > 0 for > 2 hours (resolution rate SLO: >70% in 2h).
 */
const _awaitingGauge = { count: 0 }

export function incrementAwaitingDecision(tenantId: string): void {
  _awaitingGauge.count++
  getMeter()
    .createObservableGauge('bureau_awaiting_decision_tasks', {
      description: 'Tasks currently in AwaitingUserDecision state',
    })
    .addCallback((obs) => {
      obs.observe(_awaitingGauge.count, { tenantId })
    })
}

export function decrementAwaitingDecision(tenantId: string): void {
  _awaitingGauge.count = Math.max(0, _awaitingGauge.count - 1)
}

// ─── Cost burn rate ───────────────────────────────────────────────────────────

/** Record USD cost of each LLM invocation for burn rate calculation */
export function recordLlmCost(attrs: {
  tenantId: string
  division: Division
  model: string
  provider: string
  costUsd: number
  isEscalated: boolean
}): void {
  getMeter()
    .createCounter('bureau_llm_cost_usd_total', {
      description: 'Total USD spent on LLM calls (Grafana: rate → burn rate)',
    })
    .add(attrs.costUsd, {
      tenantId: attrs.tenantId,
      division: attrs.division,
      model: attrs.model,
      provider: attrs.provider,
      isEscalated: String(attrs.isEscalated),
    })
}

// ─── Queue depth ──────────────────────────────────────────────────────────────

/** Report BullMQ queue depth per division (called by background collector) */
export function recordQueueDepth(division: Division, depth: number): void {
  getMeter()
    .createObservableGauge('bureau_queue_depth', {
      description: 'BullMQ active + waiting job count per division queue',
    })
    .addCallback((obs) => {
      obs.observe(depth, { division })
    })
}

// ─── Division execution latency ───────────────────────────────────────────────

/** Histogram for each division's execution duration */
export function recordDivisionLatency(attrs: {
  division: Division
  executionPath: 'fast' | 'standard' | 'full'
  durationMs: number
  success: boolean
}): void {
  getMeter()
    .createHistogram('bureau_division_duration_ms', {
      description: 'Division execution duration in milliseconds',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [
          10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000,
        ],
      },
    })
    .record(attrs.durationMs, {
      division: attrs.division,
      executionPath: attrs.executionPath,
      success: String(attrs.success),
    })
}

// ─── HTTP request metrics ─────────────────────────────────────────────────────

/** Record API endpoint latency and status */
export function recordHttpRequest(attrs: {
  method: string
  route: string
  statusCode: number
  durationMs: number
}): void {
  getMeter()
    .createHistogram('bureau_http_request_duration_ms', {
      description: 'HTTP request duration per route',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
      },
    })
    .record(attrs.durationMs, {
      method: attrs.method,
      route: attrs.route,
      status_code: String(attrs.statusCode),
    })
}

// ─── Spending anomaly counter ─────────────────────────────────────────────────

/** Increment when tenant spending anomaly is detected */
export function recordSpendingAnomaly(attrs: {
  tenantId: string
  currentHourUsd: number
  rollingAvgUsd: number
  multiplier: number
}): void {
  getMeter()
    .createCounter('bureau_spending_anomalies_total', {
      description: 'Tenant spending anomaly events (> 3x rolling average)',
    })
    .add(1, {
      tenantId: attrs.tenantId,
      multiplier_bucket: attrs.multiplier >= 10 ? '10x+' : attrs.multiplier >= 5 ? '5-10x' : '3-5x',
    })
}

// ─── Prompt caching savings ───────────────────────────────────────────────────

/** Record prompt cache hits for cost savings tracking */
export function recordCacheHit(attrs: {
  cacheType: 'semantic' | 'prompt'
  model: string
  savedTokens: number
  savedUsd: number
}): void {
  getMeter()
    .createCounter('bureau_cache_hits_total', {
      description: 'Cache hits (semantic vector or prompt caching)',
    })
    .add(1, { cacheType: attrs.cacheType, model: attrs.model })

  getMeter()
    .createCounter('bureau_cache_saved_usd_total', {
      description: 'USD saved via cache hits',
    })
    .add(attrs.savedUsd, { cacheType: attrs.cacheType })
}

// ─── Compliance violations ────────────────────────────────────────────────────

/** Record compliance block events */
export function recordComplianceViolation(attrs: {
  violationType: 'toxicity' | 'factuality' | 'schema' | 'prompt_injection'
  severity: 'low' | 'medium' | 'high'
  executionPath: 'fast' | 'standard' | 'full'
}): void {
  getMeter()
    .createCounter('bureau_compliance_violations_total', {
      description: 'Compliance violations detected and blocked',
    })
    .add(1, attrs)
}
