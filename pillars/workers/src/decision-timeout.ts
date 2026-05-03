/**
 * Decision Timeout Worker.
 *
 * Scans for AwaitingUserDecision tasks whose pendingDecision.expiresAt has passed.
 * Auto-executes the defaultAction (typically 'best_effort') and transitions to next stage.
 *
 * Runs every 60 seconds. Designed for single-instance. In multi-instance deployments,
 * use MongoDB findOneAndUpdate atomic claim to avoid double-processing.
 *
 * Decision timeout default: 24h (from plan spec).
 * Default action: best_effort → Formatting stage.
 */
import mongoose from 'mongoose'
import { TaskEnvelopeModel } from '@bureau/models'
import { createLogger } from '@bureau/telemetry'

const log = createLogger({ division: 'Executive' })

const SCAN_INTERVAL_MS = 60_000 // 1 minute
const BATCH_LIMIT = 100

type DefaultAction = 'best_effort' | 'cancel'

/**
 * Map defaultAction → next stage.
 * Mirrors the decision route logic in tasks.ts.
 */
function resolveNextStage(action: DefaultAction): string {
  if (action === 'cancel') return 'Cancelled'
  return 'Formatting' // best_effort
}

async function processExpiredDecisions(): Promise<void> {
  const now = new Date()

  // Find expired AwaitingUserDecision tasks (batch)
  const expired = await TaskEnvelopeModel.find({
    currentStage: 'AwaitingUserDecision',
    'pendingDecision.expiresAt': { $lte: now },
  })
    .select('taskId pendingDecision')
    .limit(BATCH_LIMIT)
    .lean()
    .exec()

  if (expired.length === 0) return

  log.info({ count: expired.length }, 'Decision timeout: auto-executing default actions')

  await Promise.all(
    expired.map(async (task) => {
      // Atomic: claim the task (prevent race with concurrent scan instances)
      const action: DefaultAction =
        (task.pendingDecision?.defaultAction as DefaultAction | undefined) ?? 'best_effort'
      const newStage = resolveNextStage(action)

      const updated = await TaskEnvelopeModel.findOneAndUpdate(
        {
          taskId: task.taskId,
          currentStage: 'AwaitingUserDecision', // re-check — only update if still in this stage
          'pendingDecision.expiresAt': { $lte: now },
        },
        {
          $set: {
            currentStage: newStage,
            pendingDecision: null,
            ...(action === 'best_effort' ? { outputQuality: 'best_effort' } : {}),
          },
          $inc: { stageVersion: 1 },
          $push: {
            stateTransitions: {
              from: 'AwaitingUserDecision',
              to: newStage,
              at: now,
              byAgent: 'decision-timeout-worker',
              correlationId: task.taskId,
            },
          },
        },
        { new: true },
      ).exec()

      if (updated !== null) {
        log.info({ taskId: task.taskId, action, newStage }, 'Decision auto-executed on timeout')
      }
      // If null: another instance claimed it first — safe to ignore
    }),
  )
}

let _running = false
let _timer: ReturnType<typeof setTimeout> | null = null

/** Start the decision timeout watcher. Idempotent. */
export function startDecisionTimeoutWorker(): void {
  if (_running) return
  _running = true
  log.info({}, 'Decision timeout worker started')

  const tick = async () => {
    if (!_running) return
    try {
      if (mongoose.connection.readyState === 1) {
        await processExpiredDecisions()
      }
    } catch (e) {
      log.error({ err: e instanceof Error ? e.message : String(e) }, 'Decision timeout tick failed')
    }
    if (_running) {
      _timer = setTimeout(tick, SCAN_INTERVAL_MS)
    }
  }

  // Stagger first run by 10s to let DB connect
  _timer = setTimeout(tick, 10_000)
}

/** Stop the worker gracefully. */
export function stopDecisionTimeoutWorker(): void {
  _running = false
  if (_timer !== null) {
    clearTimeout(_timer)
    _timer = null
  }
  log.info({}, 'Decision timeout worker stopped')
}
