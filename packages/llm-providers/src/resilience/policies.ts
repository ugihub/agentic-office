/**
 * Cockatiel resilience policies for LLM provider calls.
 *
 * Three layers:
 * 1. Retry — exponential backoff for transient failures (429, 503, timeout)
 * 2. Circuit Breaker — open after N consecutive failures, half-open after timeout
 * 3. Bulkhead — max concurrent LLM calls per provider
 *
 * Usage:
 * ```ts
 * const policy = createLlmPolicy('anthropic')
 * const result = await policy.execute(() => claudeProvider.generate(model, opts))
 * ```
 */
import {
  retry,
  ExponentialBackoff,
  CircuitBreakerPolicy,
  circuitBreaker,
  ConsecutiveBreaker,
  BulkheadPolicy,
  bulkhead,
  wrap,
  handleType,
  handleWhen,
  type IPolicy,
} from 'cockatiel'
import { createLogger } from '@bureau/telemetry'
import type { LlmProvider } from '../pricing.config.js'

const log = createLogger({ division: 'Production' })

// ─── Configuration ────────────────────────────────────────────────────────────

/** Errors that should trigger retry (transient failures) */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  // Rate limit, server errors, timeouts
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true
  if (msg.includes('service unavailable') || msg.includes('server error')) return true
  if (msg.includes('timeout') || msg.includes('timed out')) return true
  if (msg.includes('econnreset') || msg.includes('econnrefused')) return true
  // Check for status codes in error message
  for (const code of RETRYABLE_STATUS_CODES) {
    if (msg.includes(String(code))) return true
  }
  return false
}

// ─── Policy factories ─────────────────────────────────────────────────────────

export interface LlmPolicyOptions {
  /** Max retry attempts (default: 3) */
  maxAttempts?: number | undefined
  /** Initial delay ms for exponential backoff (default: 1000) */
  initialDelayMs?: number | undefined
  /** Circuit breaker: consecutive failures to open (default: 5) */
  breakerThreshold?: number | undefined
  /** Circuit breaker: half-open probe timeout ms (default: 30000) */
  breakerResetMs?: number | undefined
  /** Bulkhead: max concurrent calls (default: 3) */
  maxConcurrent?: number | undefined
  /** Bulkhead: max queued requests (default: 10) */
  maxQueue?: number | undefined
}

export interface WrappedPolicy {
  execute<T>(fn: () => Promise<T>): Promise<T>
}

/** Per-provider circuit breaker instances (singleton per provider) */
const _circuitBreakers = new Map<string, CircuitBreakerPolicy>()

/** Per-provider bulkhead instances (singleton per provider) */
const _bulkheads = new Map<string, BulkheadPolicy>()

/**
 * Create a combined retry + circuit-breaker + bulkhead policy for an LLM provider.
 * Policies are cached per provider (singleton pattern).
 */
export function createLlmPolicy(
  provider: LlmProvider | string,
  options: LlmPolicyOptions = {},
): WrappedPolicy {
  const {
    maxAttempts = 3,
    initialDelayMs = 1_000,
    breakerThreshold = 5,
    breakerResetMs = 30_000,
    maxConcurrent = parseInt(process.env['MAX_LLM_CONCURRENCY'] ?? '3', 10),
    maxQueue = 10,
  } = options

  // Retry policy — exponential backoff on retryable errors
  const retryPolicy = retry(
    handleWhen(isRetryableError),
    {
      maxAttempts,
      backoff: new ExponentialBackoff({
        initialDelay: initialDelayMs,
        exponent: 2,
        maxDelay: 30_000,
      }),
    },
  )

  retryPolicy.onRetry(({ attempt, error }) => {
    log.warn(
      { provider, attempt, err: (error as Error).message },
      'LLM call retrying',
    )
  })

  // Circuit breaker — opens after N consecutive failures
  let breaker = _circuitBreakers.get(provider)
  if (!breaker) {
    breaker = circuitBreaker(
      handleType(Error),
      {
        halfOpenAfter: breakerResetMs,
        breaker: new ConsecutiveBreaker(breakerThreshold),
      },
    )

    breaker.onBreak(({ error }) => {
      log.error(
        { provider, err: (error as Error).message },
        'Circuit breaker OPEN — LLM provider failing',
      )
    })

    breaker.onReset(() => {
      log.info({ provider }, 'Circuit breaker RESET — LLM provider recovered')
    })

    _circuitBreakers.set(provider, breaker)
  }

  // Bulkhead — max concurrent requests
  let bh = _bulkheads.get(provider)
  if (!bh) {
    bh = bulkhead(maxConcurrent, maxQueue)

    bh.onReject(() => {
      log.warn({ provider, maxConcurrent, maxQueue }, 'Bulkhead rejected — LLM provider at capacity')
    })

    _bulkheads.set(provider, bh)
  }

  // Compose: bulkhead(circuitBreaker(retry(fn)))
  // Order: bulkhead limits concurrency → breaker fast-fails open circuits → retry handles transient
  const composed = wrap(bh, breaker, retryPolicy)

  return {
    execute: <T>(fn: () => Promise<T>) => composed.execute(fn),
  }
}

/** Get circuit breaker state for a provider (for health checks) */
export function getCircuitBreakerState(
  provider: LlmProvider | string,
): 'closed' | 'open' | 'halfOpen' | 'unknown' {
  const breaker = _circuitBreakers.get(provider)
  if (!breaker) return 'unknown'
  // cockatiel CircuitBreakerPolicy exposes .state
  const state = (breaker as unknown as { state?: { value?: string } }).state?.value
  if (state === 'open') return 'open'
  if (state === 'halfOpen') return 'halfOpen'
  return 'closed'
}

/** Reset circuit breaker for a provider (for testing/admin) */
export function resetCircuitBreaker(provider: LlmProvider | string): void {
  _circuitBreakers.delete(provider)
  log.info({ provider }, 'Circuit breaker manually reset')
}
