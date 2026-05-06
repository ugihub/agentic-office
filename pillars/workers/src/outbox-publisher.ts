/**
 * Outbox Publisher — background worker.
 *
 * Polls MongoDB outbox collection every 1s, enqueues Pending entries to BullMQ,
 * marks as Completed. On failure: exponential backoff, max 5 attempts → Failed.
 *
 * Guarantees at-least-once delivery. Idempotency is handled by BullMQ jobId
 * (outboxId used as jobId — duplicate enqueue is safe, BullMQ deduplicates).
 *
 * @see ADR-001: BullMQ-only, outbox required
 */
import {
  getPendingOutboxEntries,
  markOutboxCompleted,
  markOutboxFailed,
} from '@bureau/infra-mongo'
import { enqueueJob } from '@bureau/infra-messaging'
import { createLogger } from '@bureau/telemetry'
import type { QUEUE_NAMES } from '@bureau/contracts'

const log = createLogger({ division: 'Executive' })

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

const POLL_INTERVAL_MS = 1000
const BATCH_SIZE = 50

let _running = false
let _timer: ReturnType<typeof setTimeout> | null = null

/**
 * Process one batch of pending outbox entries.
 * Each entry is enqueued individually and marked completed/failed.
 * Failures do NOT stop the batch — other entries proceed.
 */
async function processBatch(): Promise<void> {
  const result = await getPendingOutboxEntries(BATCH_SIZE)

  if (!result.ok) {
    log.error({ err: result.error.message }, 'Outbox poll query failed')
    return
  }

  const entries = result.value
  if (entries.length === 0) return

  log.debug({ count: entries.length }, 'Outbox: processing batch')

  await Promise.all(
    entries.map(async (entry) => {
      try {
        const correlationId = entry.headers['x-correlation-id']
        await enqueueJob(
          entry.targetQueue as QueueName,
          entry.jobName,
          entry.jobData,
          {
            jobId: entry.outboxId, // deduplicate via BullMQ jobId
            ...(correlationId !== undefined ? { correlationId } : {}),
          },
        )

        const markResult = await markOutboxCompleted(entry.outboxId)
        if (!markResult.ok) {
          log.error(
            { outboxId: entry.outboxId, err: markResult.error.message },
            'Failed to mark outbox completed',
          )
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.warn({ outboxId: entry.outboxId, err: msg, attempts: entry.attempts }, 'Outbox enqueue failed')

        const failResult = await markOutboxFailed(entry.outboxId, entry.attempts)
        if (!failResult.ok) {
          log.error({ outboxId: entry.outboxId }, 'Failed to mark outbox failed')
        }
      }
    }),
  )
}

/** Start the outbox publisher loop. Idempotent — safe to call multiple times. */
export function startOutboxPublisher(): void {
  if (_running) return
  _running = true
  log.info({}, 'Outbox publisher started')

  const tick = async () => {
    if (!_running) return
    try {
      await processBatch()
    } catch (e) {
      log.error({ err: e instanceof Error ? e.message : String(e) }, 'Outbox publisher tick failed')
    }
    if (_running) {
      _timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
  }

  _timer = setTimeout(tick, POLL_INTERVAL_MS)
}

/** Stop the outbox publisher loop gracefully. */
export function stopOutboxPublisher(): void {
  _running = false
  if (_timer !== null) {
    clearTimeout(_timer)
    _timer = null
  }
  log.info({}, 'Outbox publisher stopped')
}
