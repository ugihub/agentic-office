/**
 * Bureau Workers — entry point.
 *
 * Starts all background workers:
 * - Outbox publisher: MongoDB → BullMQ guaranteed delivery
 * - Decision timeout: auto-execute expired AwaitingUserDecision tasks
 *
 * Workers share a single MongoDB connection.
 * SIGTERM → graceful shutdown via installGracefulShutdown:
 *   1. Abort all in-flight work via root AbortController
 *   2. Stop outbox + decision timeout pollers
 *   3. Close MongoDB connection
 *   4. Exit 0
 */
import mongoose from 'mongoose'
import { createLogger } from '@bureau/telemetry'
import {
  installGracefulShutdown,
  registerCleanupHandler,
} from '@bureau/agents-core'
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

async function main(): Promise<void> {
  try {
    await connectMongo()

    startOutboxPublisher()
    startDecisionTimeoutWorker()

    // Register cleanup handlers (run in order on SIGTERM/SIGINT)
    registerCleanupHandler('outbox-publisher', async () => {
      stopOutboxPublisher()
    })
    registerCleanupHandler('decision-timeout', async () => {
      stopDecisionTimeoutWorker()
    })
    registerCleanupHandler('mongodb', async () => {
      await mongoose.disconnect()
      log.info({}, 'Workers: MongoDB disconnected')
    })

    // Install graceful shutdown — handles SIGTERM, SIGINT, uncaughtException
    installGracefulShutdown({
      drainTimeoutMs: parseInt(process.env['SHUTDOWN_DRAIN_MS'] ?? '30000', 10),
      log: (msg, meta) => log.info(meta ?? {}, msg),
    })

    log.info({}, 'Bureau workers running')
  } catch (startupErr) {
    log.error({ err: startupErr }, 'Workers failed to start')
    process.exit(1)
  }
}

void main()
