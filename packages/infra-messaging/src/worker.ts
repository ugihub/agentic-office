/**
 * BullMQ Worker factory with Bureau-standard configuration.
 *
 * Key config from plan (WAJIB di setiap Worker):
 * - lockDuration: 60000ms (60s lock per job)
 * - stalledInterval: 30000ms (check stalled every 30s)
 * - maxStalledCount: 2 (retry max 2x before failed)
 *
 * This replaces custom heartbeat mechanism.
 * @see ADR-001: BullMQ stalled job detection
 */
import { Worker, type Processor, type WorkerOptions } from 'bullmq'
import type { QUEUE_NAMES } from '@bureau/contracts'
import { getRedisConnection } from './redis.js'

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

/** Bureau-standard worker options — applied to all workers */
export const BUREAU_WORKER_OPTIONS = {
  lockDuration: 60000,       // 60s lock per job
  stalledInterval: 30000,    // Check stalled every 30s
  maxStalledCount: 2,        // Retry max 2x before Failed state
  concurrency: parseInt(process.env['BULLMQ_CONCURRENCY'] ?? '8', 10),
  drainDelay: 5,
} as const satisfies Partial<WorkerOptions>

export interface BureauWorkerOptions {
  concurrency?: number
  /** Override lockDuration per worker if job type is known to be long */
  lockDuration?: number
}

/**
 * Create a typed BullMQ Worker with Bureau-standard configuration.
 *
 * Workers are responsible for:
 * 1. Logging attemptReason (initial | stall_requeue | qa_escalation | user_retry)
 * 2. Recording llmInvoked flag before/after LLM calls
 * 3. Checking idempotency via jobId before processing
 */
export function createWorker<T extends Record<string, unknown>, R = void>(
  queueName: QueueName,
  processor: Processor<T, R>,
  options: BureauWorkerOptions = {},
): Worker<T, R> {
  const worker = new Worker<T, R>(queueName, processor, {
    ...BUREAU_WORKER_OPTIONS,
    concurrency: options.concurrency ?? BUREAU_WORKER_OPTIONS.concurrency,
    lockDuration: options.lockDuration ?? BUREAU_WORKER_OPTIONS.lockDuration,
    connection: getRedisConnection(),
  })

  // Standard error logging
  worker.on('failed', (job, err) => {
    process.stderr.write(
      `[Worker][${queueName}] Job ${job?.id ?? 'unknown'} failed: ${err.message}\n`,
    )
  })

  worker.on('stalled', (jobId) => {
    process.stderr.write(`[Worker][${queueName}] Job ${jobId} stalled — will be requeued\n`)
  })

  return worker
}

/**
 * Determine the attempt reason for audit trail.
 * BullMQ sets attemptsMade to 0 on first attempt, 1+ on retries.
 */
export function getAttemptReason(
  attemptsMade: number,
  isQaEscalation?: boolean,
): 'initial' | 'stall_requeue' | 'qa_escalation' | 'user_retry' {
  if (attemptsMade === 0) return 'initial'
  if (isQaEscalation === true) return 'qa_escalation'
  return 'stall_requeue'
}
