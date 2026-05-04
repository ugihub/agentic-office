/**
 * k6 Load Test — Fast Path vs Full Path Latency Comparison
 *
 * SLOs:
 *   - Fast path p95 end-to-end: < 3 seconds
 *   - Full path p99 end-to-end: < 60 seconds
 *   - POST /tasks p99 API overhead: < 500ms (both paths)
 *
 * This test runs both paths in parallel and compares their latency distributions.
 *
 * Usage:
 *   k6 run tests/load/k6-fast-path.js
 *   k6 run --out json=results/fast-vs-full.json tests/load/k6-fast-path.js
 */
import http from 'k6/http'
import { sleep, check, group } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v1'
const API_KEY = __ENV.API_KEY || 'bureau_test_key'

// ─── Custom metrics (separate per path) ──────────────────────────────────────

const fastPathSubmitDuration = new Trend('fast_path_submit_duration_ms', true)
const fullPathSubmitDuration = new Trend('full_path_submit_duration_ms', true)
const fastPathE2EDuration = new Trend('fast_path_e2e_duration_ms', true)
const fullPathE2EDuration = new Trend('full_path_e2e_duration_ms', true)
const fastPathErrorRate = new Rate('fast_path_error_rate')
const fullPathErrorRate = new Rate('full_path_error_rate')

// ─── Test options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // 50/50 split: half VUs on fast path, half on full path
    fastPath: {
      executor: 'constant-vus',
      vus: 15,
      duration: '3m',
      exec: 'fastPathTest',
    },
    fullPath: {
      executor: 'constant-vus',
      vus: 15,
      duration: '3m',
      exec: 'fullPathTest',
    },
  },
  thresholds: {
    // Fast path POST: p99 < 500ms API overhead
    'fast_path_submit_duration_ms': [
      { threshold: 'p(99)<500' },
      { threshold: 'p(95)<300' },
    ],
    // Full path POST: p99 < 500ms API overhead (LLM time not counted here)
    'full_path_submit_duration_ms': [
      { threshold: 'p(99)<500' },
    ],
    // Fast path E2E: p95 < 3s (with mock LLM in test env)
    'fast_path_e2e_duration_ms': [
      { threshold: 'p(95)<3000', abortOnFail: false },
    ],
    // Error rates
    'fast_path_error_rate': [{ threshold: 'rate<0.02' }],
    'full_path_error_rate': [{ threshold: 'rate<0.02' }],
  },
}

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
}

// ─── Fast Path Test ───────────────────────────────────────────────────────────

export function fastPathTest() {
  group('Fast Path', () => {
    const submitStart = Date.now()
    const res = http.post(
      `${BASE_URL}/tasks`,
      JSON.stringify({
        prompt: 'What is the boiling point of water in Celsius?',
        constraints: { maxCostUsd: '0.02', preferredModelTier: 'economy' },
        outputFormat: 'text',
      }),
      {
        headers: { ...headers, 'Idempotency-Key': `k6_fast_${Date.now()}_${__VU}_${__ITER}` },
        timeout: '5s',
      }
    )

    fastPathSubmitDuration.add(res.timings.duration)

    const ok = check(res, {
      'Fast path: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'Fast path: submit < 500ms': (r) => r.timings.duration < 500,
    })

    fastPathErrorRate.add(!ok)

    // Poll until completed (fast path should be quick)
    if (ok) {
      let body
      try { body = JSON.parse(res.body) } catch { return }

      if (body.taskId) {
        const pollStart = Date.now()
        let completed = false
        let attempts = 0

        while (!completed && attempts < 10) {
          sleep(0.3) // Poll every 300ms
          const statusRes = http.get(`${BASE_URL}/tasks/${body.taskId}/status`, {
            headers, timeout: '3s',
          })

          if (statusRes.status === 200) {
            try {
              const status = JSON.parse(statusRes.body)
              if (['Completed', 'Failed', 'Cancelled'].includes(status.currentStage)) {
                completed = true
                fastPathE2EDuration.add(Date.now() - pollStart)
              }
            } catch { /* ignore */ }
          }
          attempts++
        }
      }
    }

    sleep(0.5)
  })
}

// ─── Full Path Test ───────────────────────────────────────────────────────────

export function fullPathTest() {
  group('Full Path', () => {
    const res = http.post(
      `${BASE_URL}/tasks`,
      JSON.stringify({
        prompt: 'Analisis mendalam tentang tren AI dalam industri manufaktur Indonesia selama 5 tahun terakhir.',
        constraints: { maxCostUsd: '0.50', preferredModelTier: 'standard' },
        outputFormat: 'markdown',
      }),
      {
        headers: { ...headers, 'Idempotency-Key': `k6_full_${Date.now()}_${__VU}_${__ITER}` },
        timeout: '5s',
      }
    )

    fullPathSubmitDuration.add(res.timings.duration)

    const ok = check(res, {
      'Full path: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'Full path: submit < 500ms': (r) => r.timings.duration < 500,
    })

    fullPathErrorRate.add(!ok)

    if (ok) {
      let body
      try { body = JSON.parse(res.body) } catch { return }

      if (body.taskId) {
        const e2eStart = Date.now()
        let completed = false
        let attempts = 0

        while (!completed && attempts < 30) { // Full path can take up to 60s
          sleep(2) // Poll every 2s for full path
          const statusRes = http.get(`${BASE_URL}/tasks/${body.taskId}/status`, {
            headers, timeout: '5s',
          })

          if (statusRes.status === 200) {
            try {
              const status = JSON.parse(statusRes.body)
              if (['Completed', 'Failed', 'Cancelled'].includes(status.currentStage)) {
                completed = true
                fullPathE2EDuration.add(Date.now() - e2eStart)
              }
            } catch { /* ignore */ }
          }
          attempts++
        }
      }
    }

    sleep(1)
  })
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const fastP95 = data.metrics.fast_path_submit_duration_ms?.values?.['p(95)'] ?? 'N/A'
  const fullP99 = data.metrics.full_path_submit_duration_ms?.values?.['p(99)'] ?? 'N/A'

  return {
    'results/fast-vs-full-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== Bureau Fast Path vs Full Path ===
Fast Path Submit p95: ${fastP95}ms (target: <300ms)
Full Path Submit p99: ${fullP99}ms (target: <500ms)
=====================================
`,
  }
}
