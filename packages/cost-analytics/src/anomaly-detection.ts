/**
 * Spending anomaly detection — per-tenant rolling average.
 *
 * Alert if current_hour spend > 3x avg_7_days for same tenant.
 * Per-tenant baseline — not global. High-volume tenants not false-alerted.
 *
 * NOTE: Read path (anomaly detection) can be added week 3-4 per plan.
 * Write path (recordLlmInvocation) is critical from day 1.
 */
import { type Result, tryAsync } from '@bureau/shared-kernel'
import { CostEventModel } from '@bureau/models'

export interface SpendingAnomaly {
  tenantId: string
  currentHourUsd: number
  avgDailyUsd7d: number
  ratio: number
  threshold: number
  isAnomaly: boolean
}

/**
 * Check if a tenant's spending in the last hour is anomalous.
 * Alert threshold: 3x the 7-day rolling daily average.
 *
 * Called by background job after each completed task.
 */
export async function checkSpendingAnomaly(
  tenantId: string,
  thresholdMultiplier = 3,
): Promise<Result<SpendingAnomaly, Error>> {
  return tryAsync(async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Current hour spend
    const currentHourEvents = await CostEventModel.find({
      tenantId,
      timestamp: { $gte: oneHourAgo },
    })
      .select('costUsd')
      .lean()
      .exec()

    const currentHourUsd = currentHourEvents.reduce(
      (sum: number, e) => sum + parseFloat(e.costUsd.toString()),
      0,
    )

    // 7-day average (per day)
    const sevenDayEvents = await CostEventModel.find({
      tenantId,
      timestamp: { $gte: sevenDaysAgo, $lt: oneHourAgo },
    })
      .select('costUsd')
      .lean()
      .exec()

    const sevenDayTotal = sevenDayEvents.reduce(
      (sum: number, e) => sum + parseFloat(e.costUsd.toString()),
      0,
    )

    // Convert to hourly average (7 days = 168 hours)
    const avgHourlyUsd7d = sevenDayTotal / 168

    const ratio = avgHourlyUsd7d > 0 ? currentHourUsd / avgHourlyUsd7d : 0

    return {
      tenantId,
      currentHourUsd,
      avgDailyUsd7d: avgHourlyUsd7d * 24,
      ratio,
      threshold: thresholdMultiplier,
      isAnomaly: ratio > thresholdMultiplier,
    }
  })
}
