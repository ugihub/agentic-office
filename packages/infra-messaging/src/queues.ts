/**
 * BullMQ queue topology for Bureau.
 *
 * One queue per division. Dead letter queue for all.
 * All queues share the same Redis connection.
 *
 * @see ADR-001: BullMQ-only — queue list is canonical here
 */
import { Queue, type QueueOptions } from 'bullmq'
import type { QUEUE_NAMES } from '@bureau/contracts'
import { getRedisConnection } from './redis.js'

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

const DEFAULT_QUEUE_OPTIONS: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 86400,    // Keep completed jobs 24h for audit
      count: 1000,
    },
    removeOnFail: false,   // Keep failed jobs for dead letter inspection
  },
}

const _queues = new Map<string, Queue>()

/**
 * Get or create a BullMQ Queue instance.
 * Queues are singletons — safe to call multiple times with same name.
 */
export function getQueue(name: QueueName, options?: Partial<QueueOptions>): Queue {
  if (_queues.has(name)) {
    return _queues.get(name) as Queue
  }

  const queue = new Queue(name, {
    ...DEFAULT_QUEUE_OPTIONS,
    ...options,
    connection: getRedisConnection(),
  })

  _queues.set(name, queue)
  return queue
}

/**
 * Enqueue a job to a specific queue.
 * Type-safe: jobData must match the queue's expected payload type.
 */
export async function enqueueJob<T extends Record<string, unknown>>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: {
    jobId?: string
    delay?: number
    priority?: number
    correlationId?: string
  },
): Promise<string> {
  const queue = getQueue(queueName)

  const job = await queue.add(jobName, data, {
    jobId: options?.jobId,
    delay: options?.delay,
    priority: options?.priority,
  })

  return job.id ?? ''
}

/** Close all queues gracefully */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(_queues.values()).map((q) => q.close())
  await Promise.all(closePromises)
  _queues.clear()
}
