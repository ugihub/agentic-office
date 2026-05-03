/**
 * Bureau Workers — entry point.
 *
 * Starts all background workers:
 * - Outbox publisher: MongoDB → BullMQ guaranteed delivery
 * - Decision timeout: auto-execute expired AwaitingUserDecision tasks
 *
 * Workers share a single MongoDB connection.
 * SIGTERM → graceful shutdown (finish current batch, then exit).
 */
import mongoose from 'mongoose'
import { createLogger } from '@bureau/telemetry'
import { startOutboxPublisher, stopOutboxPublisher } from './outbox-publisher.js'
import { startDecisionTimeoutWorker, stopDecisionTimeoutWorker } from './decision-timeout.js'

const log = createLogger({ division: 'Executive' })

const MONGO_URI = process.env['MONGO_URI'] ?? 'mongodb://localhost:27017/bureau'

async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
    minPoolSize: 1,
  })
  log.info({ uri: MONGO_URI.replace(/\/\/.*@/, '//***@') }, 'Workers: MongoDB connected')
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Workers: shutdown signal received')
  stopOutboxPublisher()
  stopDecisionTimeoutWorker()
  await mongoose.disconnect()
  log.info({}, 'Workers: clean shutdown complete')
  process.exit(0)
}

async function main(): Promise<void> {
  try {
    await connectMongo()

    startOutboxPublisher()
    startDecisionTimeoutWorker()

    log.info({}, 'Bureau workers running')

    process.on('SIGTERM', () => { void shutdown('SIGTERM') })
    process.on('SIGINT', () => { void shutdown('SIGINT') })
  } catch (err) {
    log.error({ err }, 'Workers failed to start')
    process.exit(1)
  }
}

void main()
