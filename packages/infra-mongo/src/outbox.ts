/**
 * Outbox pattern — guaranteed at-least-once delivery to BullMQ.
 *
 * How it works:
 * 1. Business logic writes event to outbox collection (same MongoDB transaction as state change)
 * 2. Background poller picks up Pending entries
 * 3. Poller enqueues to BullMQ and marks as Completed
 * 4. On crash: poller restarts and re-processes unprocessed entries
 *
 * This ensures atomicity between DB write and job enqueue.
 * Without this: crash between DB write and enqueue = lost message.
 *
 * @see ADR-001: BullMQ-only (outbox required even with BullMQ)
 */
import { Schema, model, type Document } from 'mongoose'
import { type Result, ok, err, tryAsync, newId, EntityPrefix } from '@bureau/shared-kernel'
import { OutboxPublishError } from '@bureau/shared-kernel'

export interface OutboxDocument extends Document {
  outboxId: string
  occurredAt: Date
  processedAt: Date | null
  status: 'Pending' | 'Completed' | 'Failed'
  attempts: number
  nextAttemptAt: Date
  targetQueue: string
  jobName: string
  jobData: Record<string, unknown>
  headers: Record<string, string>
}

const outboxSchema = new Schema<OutboxDocument>(
  {
    outboxId: { type: String, required: true, unique: true, index: true },
    occurredAt: { type: Date, required: true },
    processedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending',
      required: true,
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true },
    targetQueue: { type: String, required: true },
    jobName: { type: String, required: true },
    jobData: { type: Schema.Types.Mixed, required: true },
    headers: { type: Map, of: String, default: {} },
  },
  {
    strict: true,
    timestamps: { updatedAt: true, createdAt: false },
    collection: 'outbox',
  },
)

// Compound index for poller query
outboxSchema.index({ status: 1, nextAttemptAt: 1 })

export const OutboxModel = model<OutboxDocument>('Outbox', outboxSchema)

export interface OutboxEntry {
  targetQueue: string
  jobName: string
  jobData: Record<string, unknown>
  correlationId: string
  traceparent?: string | undefined
}

/**
 * Create an outbox entry (call inside a MongoDB session/transaction).
 * Returns the outboxId.
 */
export async function createOutboxEntry(
  entry: OutboxEntry,
  session?: Parameters<typeof OutboxModel.prototype.save>[0],
): Promise<Result<string, OutboxPublishError>> {
  const outboxId = newId(EntityPrefix.OUTBOX)

  const result = await tryAsync(async () => {
    const doc = new OutboxModel({
      outboxId,
      occurredAt: new Date(),
      status: 'Pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      targetQueue: entry.targetQueue,
      jobName: entry.jobName,
      jobData: entry.jobData,
      headers: {
        'x-correlation-id': entry.correlationId,
        ...(entry.traceparent !== undefined ? { traceparent: entry.traceparent } : {}),
      },
    })
    await doc.save({ session } as Parameters<typeof doc.save>[0])
    return outboxId
  })

  if (!result.ok) {
    return err(new OutboxPublishError(outboxId, result.error.message, { cause: result.error }))
  }

  return ok(result.value)
}

/**
 * Poll for pending outbox entries.
 * Called by the outbox publisher background worker every 1 second.
 */
export async function getPendingOutboxEntries(
  limit = 50,
): Promise<Result<OutboxDocument[], Error>> {
  return tryAsync(async () =>
    OutboxModel.find({
      status: 'Pending',
      nextAttemptAt: { $lte: new Date() },
    })
      .limit(limit)
      .sort({ nextAttemptAt: 1 })
      .exec(),
  )
}

/**
 * Mark an outbox entry as completed.
 * Call after successfully enqueuing to BullMQ.
 */
export async function markOutboxCompleted(outboxId: string): Promise<Result<void, Error>> {
  const result = await tryAsync(async () => {
    await OutboxModel.updateOne(
      { outboxId },
      { $set: { status: 'Completed', processedAt: new Date() } },
    ).exec()
  })
  return result
}

/**
 * Mark an outbox entry as failed with backoff.
 * Exponential backoff: 2^attempts * 1000ms, capped at 5 minutes.
 */
export async function markOutboxFailed(
  outboxId: string,
  attempts: number,
): Promise<Result<void, Error>> {
  const backoffMs = Math.min(Math.pow(2, attempts) * 1000, 300000)
  const nextAttemptAt = new Date(Date.now() + backoffMs)

  return tryAsync(async () => {
    await OutboxModel.updateOne(
      { outboxId },
      {
        $set: { status: attempts >= 5 ? 'Failed' : 'Pending', nextAttemptAt },
        $inc: { attempts: 1 },
      },
    ).exec()
  })
}
