/**
 * Finance SSC Agent — budget reservation and release.
 *
 * CRITICAL: Atomic reservation via findOneAndUpdate + $gte.
 * NEVER read-modify-write in application layer — race condition risk.
 *
 * Race condition scenario without atomic op:
 *   Worker A reads remaining=0.50, Worker B reads remaining=0.50
 *   Both see sufficient balance, both proceed
 *   Both debit → remaining goes negative
 *   findOneAndUpdate + $gte: only ONE succeeds, other gets null → InsufficientBudgetError
 *
 * @see Plan section 8: Atomic Budget Reservation
 */
import { Types, type Model } from 'mongoose'
import { type Result, ok, err, newId, EntityPrefix } from '@bureau/shared-kernel'
import { InsufficientBudgetError } from '@bureau/shared-kernel'
import { Money } from '@bureau/shared-kernel'
import type { BudgetDocument } from '@bureau/models'

export interface EscalationEntry {
  attempt: number
  model: string
  maxCostUsd: string
}

export interface BudgetReservationRequest {
  taskId: string
  tenantId: string
  /** Total estimated cost for ALL attempts in escalation chain */
  totalEstimatedCostUsd: string
  escalationChain: EscalationEntry[]
}

export interface BudgetReservationResult {
  reserved: boolean
  remainingAfterUsd: string
  reservationId: string
}

export interface FinanceSscDeps {
  budgetModel: Model<BudgetDocument>
}

/**
 * Atomically reserve budget using findOneAndUpdate + $gte condition.
 *
 * This is the ONLY correct way to debit budget.
 * Any other approach risks race condition with concurrent workers.
 */
export async function reserveBudgetAtomic(
  deps: FinanceSscDeps,
  request: BudgetReservationRequest,
): Promise<Result<BudgetReservationResult, InsufficientBudgetError | Error>> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const estimatedCost = Money.usd(request.totalEstimatedCostUsd)
  const estimatedDecimal = estimatedCost.toDecimalString()

  // ATOMIC: condition + update in single operation
  // If remaining < estimatedCost → findOneAndUpdate returns null → insufficient
  const result = await deps.budgetModel
    .findOneAndUpdate(
      {
        tenantId: request.tenantId,
        periodYear: year,
        periodMonth: month,
        isFrozen: false,
        // $gte condition: only proceed if sufficient balance
        remaining: { $gte: Types.Decimal128.fromString(estimatedDecimal) },
      },
      {
        $inc: {
          // TypeScript doesn't know $inc works with Decimal128 — use string cast
          remaining: `-${estimatedDecimal}` as unknown as number,
          consumedUsd: estimatedDecimal as unknown as number,
        },
        $push: {
          reservations: {
            taskId: request.taskId,
            amount: estimatedDecimal,
            reservedAt: now,
          },
        },
      },
      { new: true },
    )
    .exec()

  if (result === null) {
    // Either no budget found OR remaining < estimated — both = insufficient
    const existing = await deps.budgetModel
      .findOne({ tenantId: request.tenantId, periodYear: year, periodMonth: month })
      .select('remaining isFrozen')
      .exec()

    const available = existing?.remaining !== undefined
      ? existing.remaining.toString()
      : '0'

    return err(
      new InsufficientBudgetError(
        request.tenantId,
        request.totalEstimatedCostUsd,
        available,
      ),
    )
  }

  // Check if we just crossed 80% warning threshold
  if (result.totalUsd !== undefined && result.remaining !== undefined) {
    const total = Money.usd(result.totalUsd.toString())
    const remaining = Money.usd(result.remaining.toString())
    const usagePercent = 1 - remaining.amount.div(total.amount).toNumber()

    if (usagePercent >= 0.8 && result.warningEmailSentAt === null) {
    // Flag for email — actual send in background job
    await deps.budgetModel
      .updateOne(
        { _id: result._id, warningEmailSentAt: null },
        { $set: { warningEmailSentAt: now } },
      )
      .exec()
    }
  }

  return ok({
    reserved: true,
    remainingAfterUsd: result.remaining.toString(),
    reservationId: newId(EntityPrefix.COST_EVENT),
  })
}

/**
 * Release unused budget after task completes or fails.
 * Returns unconsumed portion of reserved amount.
 */
export async function releaseBudget(
  deps: FinanceSscDeps,
  taskId: string,
  tenantId: string,
  actualCostUsd: string,
  reservedCostUsd: string,
): Promise<Result<void, Error>> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const reserved = Money.usd(reservedCostUsd)
  const actual = Money.usd(actualCostUsd)
  const refund = reserved.subtract(actual)

  if (refund.isNegative() || refund.isZero()) {
    // No refund to give — actual cost >= reserved
    return ok(undefined)
  }

  const refundStr = refund.toDecimalString()

  try {
    await deps.budgetModel
      .updateOne(
        { tenantId, periodYear: year, periodMonth: month },
        {
          $inc: {
            remaining: refundStr as unknown as number,
            consumedUsd: `-${refundStr}` as unknown as number,
          },
          $pull: {
            reservations: { taskId },
          },
        },
      )
      .exec()

    return ok(undefined)
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Pre-approve escalation chain total budget.
 * Called by Finance SSC at task start.
 * Returns false if total chain budget exceeds tenant balance.
 */
export async function preApproveEscalationChain(
  deps: FinanceSscDeps,
  tenantId: string,
  escalationChain: EscalationEntry[],
): Promise<Result<{ approved: boolean; maxAffordableAttempt: number }, Error>> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const budget = await deps.budgetModel
    .findOne({ tenantId, periodYear: year, periodMonth: month })
    .select('remaining isFrozen')
    .exec()

  if (budget === null || budget.isFrozen) {
    return ok({ approved: false, maxAffordableAttempt: 0 })
  }

  const remaining = Money.usd(budget.remaining.toString())
  let maxAffordableAttempt = 0
  let cumulative = Money.zero()

  for (const entry of escalationChain) {
    cumulative = cumulative.add(Money.usd(entry.maxCostUsd))
    if (remaining.gte(cumulative)) {
      maxAffordableAttempt = entry.attempt
    } else {
      break
    }
  }

  return ok({ approved: maxAffordableAttempt > 0, maxAffordableAttempt })
}
