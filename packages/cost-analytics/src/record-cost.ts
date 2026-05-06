/**
 * Cost Analytics — write path.
 *
 * CRITICAL: This must be called on EVERY LLM invocation.
 * Data not captured cannot be backfilled.
 *
 * Schema has retryAttempt, isEscalated, escalationTier, userId from day 1.
 * All fields required at write time — no optional fields in hot path.
 *
 * This is a FINANCIAL RECORD. Do not store prompt text here.
 * Lookup via taskId → task_envelopes if prompt text needed for investigation.
 */
import { type Result, tryAsync, newId, EntityPrefix } from '@bureau/shared-kernel'
import { createLogger } from '@bureau/telemetry'
import { CostEventModel } from '@bureau/models'
import type { Division } from '@bureau/contracts'

export interface LlmInvocationRecord {
  tenantId: string
  userId: string | null        // null if GDPR anonymized before record creation
  taskId: string
  division: Division
  agentId: string

  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  costUsd: string             // decimal string e.g. "0.0089"

  retryAttempt: number        // 0 = first attempt
  isEscalated: boolean
  escalationTier: 'tier1' | 'tier2' | 'tier3' | null

  durationMs: number
}

const log = createLogger({ division: 'FinanceSSC' })

/**
 * Record a single LLM invocation.
 * Call this IMMEDIATELY after receiving LLM response (not before — we need actual tokens).
 *
 * Returns eventId on success. Logs error but does not throw on failure —
 * cost recording failure should not block the task result delivery.
 */
export async function recordLlmInvocation(
  record: LlmInvocationRecord,
): Promise<Result<string, Error>> {
  const eventId = newId(EntityPrefix.COST_EVENT)

  const result = await tryAsync(async () => {
    await CostEventModel.create({
      eventId,
      tenantId: record.tenantId,
      userId: record.userId,
      taskId: record.taskId,
      division: record.division,
      agentId: record.agentId,
      model: record.model,
      provider: record.provider,
      tokensIn: record.tokensIn,
      tokensOut: record.tokensOut,
      cachedTokens: record.cachedTokens,
      costUsd: record.costUsd,
      retryAttempt: record.retryAttempt,
      isEscalated: record.isEscalated,
      escalationTier: record.escalationTier,
      durationMs: record.durationMs,
      timestamp: new Date(),
      anonymizedAt: null,
      schemaVersion: 'v1',
    })
    return eventId
  })

  if (!result.ok) {
    // Log but don't fail the calling operation
    log.error(
      {
        err: result.error.message,
        taskId: record.taskId,
        model: record.model,
        costUsd: record.costUsd,
      },
      'Failed to record LLM cost event — cost data may be incomplete',
    )
  }

  return result
}

export interface CostSummary {
  totalCostUsd: string
  totalTokensIn: number
  totalTokensOut: number
  cachedTokens: number
  invocationCount: number
  escalatedCount: number
}

/**
 * Get cost summary for a task.
 * Used by Finance SSC to calculate final cost and release unused reservation.
 */
export async function getTaskCostSummary(
  taskId: string,
): Promise<Result<CostSummary, Error>> {
  return tryAsync(async () => {
    const events = await CostEventModel.find({ taskId }).lean().exec()

    const summary: CostSummary = {
      totalCostUsd: '0',
      totalTokensIn: 0,
      totalTokensOut: 0,
      cachedTokens: 0,
      invocationCount: events.length,
      escalatedCount: 0,
    }

    let totalCost = 0

    for (const event of events) {
      totalCost += parseFloat(event.costUsd.toString())
      summary.totalTokensIn += event.tokensIn
      summary.totalTokensOut += event.tokensOut
      summary.cachedTokens += event.cachedTokens
      if (event.isEscalated) summary.escalatedCount++
    }

    summary.totalCostUsd = totalCost.toFixed(8)
    return summary
  })
}

/**
 * GDPR: anonymize user data in cost_analytics.
 * Nulls userId, preserves all financial data.
 * Financial records must be kept for audit purposes.
 */
export async function anonymizeCostEvents(
  userId: string,
): Promise<Result<number, Error>> {
  return tryAsync(async () => {
    const result = await CostEventModel.updateMany(
      { userId },
      { $set: { userId: null, anonymizedAt: new Date() } },
    ).exec()
    return result.modifiedCount
  })
}
