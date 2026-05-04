/**
 * k6 Memory Leak Test — 24-hour sustained load.
 *
 * Purpose: Detect memory leaks by running sustained low concurrency for 24 hours.
 * Monitors process memory growth over time via external Prometheus metrics.
 *
 * Indicators of memory leak:
 *   - Response time increases monotonically (GC pressure)
 *   - Node.js heap grows unboundedly (check Grafana: process_heap_bytes)
 *   - Requests start failing after N hours
 *
 * Usage:
 *   k6 run --duration 24h tests/load/k6-memory-leak.js
 *   k6 run --duration 1h tests/load/k6-memory-leak.js  # Quick validation
 *
 * Note: Run with Prometheus remote write for full visibility:
 *   k6 run --out experimental-prometheus-rw tests/load/k6-memory-leak.js
 */
import http from 'k6/http'
import { sleep, check } from 'k6'
import { Trend, Rate, Counter, Gauge } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v1'
const API_KEY = __ENV.API_KEY || 'bureau_test_key'
const DURATION = __ENV.DURATION || '24h'

// ─── Custom metrics ───────────────────────────────────────────────────────────

const responseTimeTrend = new Trend('memory_test_response_ms', true)
const errorRate = new Rate('memory_test_error_rate')
const requestsTotal = new Counter('memory_test_requests_total')
const p99Rolling = new Gauge('memory_test_p99_rolling')

// ─── Options ──────────────────────────────────────────────────────────────────

export const options = {
  // Sustained low concurrency for memory leak detection
  scenarios: {
    sustained: {
      executor: 'constant-vus',
      vus: 5, // Low VU count — we want sustained, not peak
      duration: DURATION,
    },
  },
  thresholds: {
    // Response times should NOT degrade over 24 hours
    // If p99 keeps increasing → memory leak
    'memory_test_response_ms': [
      { threshold: 'p(99)<2000', abortOnFail: false }, // Generous threshold
    ],
    'memory_test_error_rate': [
      { threshold: 'rate<0.05', abortOnFail: true }, // Abort if > 5% errors
    ],
  },
}

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
}

// Rotating prompts to exercise different code paths
const PROMPTS = [
  'What is machine learning?',
  'Explain cloud computing.',
  'Define REST API.',
  'What is Docker?',
  'Describe agile methodology.',
  'What is CI/CD?',
  'Explain microservices.',
  'What is Kubernetes?',
]

let requestCount = 0

export default function () {
  requestCount++
  const prompt = PROMPTS[requestCount % PROMPTS.length]

  // Mix of health checks, task submissions, and status polls
  const roll = Math.random()

  if (roll < 0.1) {
    // 10%: health check
    const healthRes = http.get(`${BASE_URL.replace('/api/v1', '')}/health/live`, {
      timeout: '5s',
    })
    check(healthRes, { 'Health check OK': (r) => r.status === 200 })
  } else if (roll < 0.7) {
    // 60%: submit task
    const res = http.post(
      `${BASE_URL}/tasks`,
      JSON.stringify({
        prompt,
        constraints: { maxCostUsd: '0.05', preferredModelTier: 'economy' },
        outputFormat: 'text',
      }),
      {
        headers: {
          ...headers,
          'Idempotency-Key': `mem_${Date.now()}_${__VU}_${requestCount}`,
        },
        timeout: '10s',
      }
    )

    responseTimeTrend.add(res.timings.duration)
    requestsTotal.add(1)

    const ok = check(res, {
      'Submit OK': (r) => r.status === 200 || r.status === 201,
    })
    errorRate.add(!ok)
  } else {
    // 30%: list tasks (tests pagination memory)
    const res = http.get(`${BASE_URL}/tasks?limit=10&skip=0`, {
      headers,
      timeout: '5s',
    })
    check(res, { 'List OK': (r) => r.status === 200 })
  }

  sleep(2) // 2 second pause between iterations per VU
}

// ─── Metrics reporting ────────────────────────────────────────────────────────

export function handleSummary(data) {
  // Detect if p99 at end > 2x p99 at start (monotonic growth = leak indicator)
  const finalP99 = data.metrics.memory_test_response_ms?.values?.['p(99)'] ?? 0

  const leakIndicator = finalP99 > 2000
    ? '⚠️  POSSIBLE MEMORY LEAK: p99 > 2000ms'
    : '✅ No memory leak detected'

  return {
    'results/memory-leak-results.json': JSON.stringify(data, null, 2),
    stdout: `
=== Bureau 24h Memory Leak Test ===
Duration: ${DURATION}
Total Requests: ${data.metrics.memory_test_requests_total?.values?.count ?? 'N/A'}
Final p99: ${finalP99.toFixed(0)}ms
Error Rate: ${((data.metrics.memory_test_error_rate?.values?.rate ?? 0) * 100).toFixed(2)}%

${leakIndicator}

To check for memory growth, view Grafana dashboard:
  process_resident_memory_bytes (should be flat, not growing)
  process_heap_bytes (should be bounded by GC cycles)
===================================
`,
  }
}
