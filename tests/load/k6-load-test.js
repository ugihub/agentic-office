/**
 * k6 Load Test — Bureau API
 *
 * Target SLOs:
 *   - POST /tasks: p99 < 500ms (excluding LLM processing)
 *   - Throughput: 5 tasks/sec sustained at 50 concurrent VUs
 *   - Error rate: < 1% (excluding 429 rate limit responses)
 *
 * Usage:
 *   k6 run tests/load/k6-load-test.js
 *   k6 run --env BASE_URL=http://localhost:3001 --env API_KEY=bureau_live_xxx tests/load/k6-load-test.js
 *
 * For CI:
 *   k6 run --out json=results/k6-load-results.json tests/load/k6-load-test.js
 */
import http from 'k6/http'
import { sleep, check, group } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v1'
const API_KEY = __ENV.API_KEY || 'bureau_test_key'

// Custom metrics
const taskSubmitDuration = new Trend('task_submit_duration_ms', true)
const taskStatusDuration = new Trend('task_status_duration_ms', true)
const errorRate = new Rate('error_rate')
const rateLimitRate = new Rate('rate_limit_rate')
const tasksSubmitted = new Counter('tasks_submitted_total')
const tasksCompleted = new Counter('tasks_completed_total')

// ─── Test Scenarios ───────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Ramp-up test: gradually increase to 50 VUs
    rampUp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },   // Ramp to 10 VUs in 30s
        { duration: '1m', target: 50 },    // Ramp to 50 VUs over 1 minute
        { duration: '3m', target: 50 },    // Hold at 50 VUs for 3 minutes
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
    // Spike test: sudden burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 0 },
        { duration: '10s', target: 100 },  // Sudden spike to 100 VUs
        { duration: '1m', target: 100 },   // Hold spike
        { duration: '10s', target: 0 },
      ],
      startTime: '5m', // Start after rampUp scenario
    },
  },
  thresholds: {
    // P99 POST /tasks must be < 500ms (API processing only, not LLM)
    task_submit_duration_ms: [
      { threshold: 'p(99)<500', abortOnFail: false },
      { threshold: 'p(95)<300', abortOnFail: false },
    ],
    // Status check must be < 200ms
    task_status_duration_ms: [
      { threshold: 'p(99)<200', abortOnFail: false },
    ],
    // Error rate < 1% (excluding 429 rate limits)
    error_rate: [{ threshold: 'rate<0.01', abortOnFail: false }],
    // HTTP errors (4xx/5xx) overall < 5%
    'http_req_failed': [{ threshold: 'rate<0.05', abortOnFail: false }],
  },
}

// ─── Shared headers ───────────────────────────────────────────────────────────

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
}

// ─── Test payloads ────────────────────────────────────────────────────────────

const FAST_PATH_PROMPTS = [
  'What is the capital of France?',
  'Translate "hello" to Spanish.',
  'Explain photosynthesis in one sentence.',
  'What is 15% of 200?',
  'List 3 primary colors.',
]

const STANDARD_PATH_PROMPTS = [
  'Write a professional summary of renewable energy trends in Southeast Asia.',
  'Analyze the key factors driving digital transformation in banking.',
  'Compare microservices vs monolithic architecture for a SaaS startup.',
]

function randomPrompt(fast = false) {
  const list = fast ? FAST_PATH_PROMPTS : STANDARD_PATH_PROMPTS
  return list[Math.floor(Math.random() * list.length)]
}

function randomIdempotencyKey() {
  return `k6_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ─── Main test function ───────────────────────────────────────────────────────

export default function () {
  const isFastPath = Math.random() < 0.4 // 40% fast path, 60% standard

  group('POST /tasks', () => {
    const payload = JSON.stringify({
      prompt: randomPrompt(isFastPath),
      constraints: {
        maxCostUsd: '0.10',
        maxLatencyMs: 30000,
        preferredModelTier: isFastPath ? 'economy' : 'standard',
      },
      outputFormat: 'markdown',
    })

    const res = http.post(`${BASE_URL}/tasks`, payload, {
      headers: {
        ...headers,
        'Idempotency-Key': randomIdempotencyKey(),
      },
      timeout: '10s',
    })

    taskSubmitDuration.add(res.timings.duration)
    tasksSubmitted.add(1)

    const isRateLimit = res.status === 429
    rateLimitRate.add(isRateLimit)

    const success = check(res, {
      'POST /tasks: status 201 or 200': (r) => r.status === 201 || r.status === 200,
      'POST /tasks: has taskId': (r) => {
        try {
          const body = JSON.parse(r.body)
          return typeof body.taskId === 'string' && body.taskId.startsWith('task_')
        } catch {
          return false
        }
      },
      'POST /tasks: response time < 500ms': (r) => r.timings.duration < 500,
    })

    if (!success && !isRateLimit) {
      errorRate.add(1)
    } else {
      errorRate.add(0)
    }

    // Optionally poll status
    if (success && Math.random() < 0.3) {
      let body
      try {
        body = JSON.parse(res.body)
      } catch {
        return
      }

      if (body.taskId) {
        group('GET /tasks/:taskId/status', () => {
          const statusRes = http.get(`${BASE_URL}/tasks/${body.taskId}/status`, {
            headers,
            timeout: '5s',
          })
          taskStatusDuration.add(statusRes.timings.duration)
          check(statusRes, {
            'GET /status: status 200': (r) => r.status === 200,
            'GET /status: has currentStage': (r) => {
              try {
                const b = JSON.parse(r.body)
                return typeof b.currentStage === 'string'
              } catch {
                return false
              }
            },
          })
        })
      }
    }
  })

  sleep(0.2) // 200ms between iterations per VU
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setup() {
  // Verify API is reachable before starting load test
  const healthRes = http.get(`${BASE_URL.replace('/api/v1', '')}/health/ready`)
  if (healthRes.status !== 200) {
    console.error(`API not ready: ${healthRes.status}. Is the server running?`)
  }
  return { startedAt: new Date().toISOString() }
}

export function teardown(data) {
  console.log(`Load test started at: ${data.startedAt}`)
  console.log(`Load test completed at: ${new Date().toISOString()}`)
}
