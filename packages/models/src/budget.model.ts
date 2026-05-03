/**
 * Budget model — per-tenant monthly budget with atomic reservation.
 *
 * CRITICAL: debit via findOneAndUpdate with $gte — atomic, prevents race condition.
 * NEVER read-modify-write in application layer.
 *
 * @see ADR-002 implementation note: atomic budget
 * @see Plan section 8: Atomic Budget Reservation
 */
import { Schema, model, type Document, type Types } from 'mongoose'

export interface BudgetDocument extends Document {
  tenantId: string
  periodYear: number    // e.g., 2026
  periodMonth: number   // 1-12
  tier: 'starter' | 'professional' | 'enterprise'

  /** Total monthly allocation in USD */
  totalUsd: Types.Decimal128
  /** Currently available (= total - consumed) */
  remaining: Types.Decimal128
  /** Total consumed this period */
  consumedUsd: Types.Decimal128

  /** Active reservations — released when task completes/fails */
  reservations: Array<{
    taskId: string
    amount: Types.Decimal128
    reservedAt: Date
  }>

  /** Warning sent at 80% threshold */
  warningEmailSentAt: Date | null
  /** Frozen at 100% — all tasks blocked */
  frozenAt: Date | null
  isFrozen: boolean

  createdAt: Date
  updatedAt: Date
  schemaVersion: 'v1'
}

const budgetSchema = new Schema<BudgetDocument>(
  {
    tenantId: { type: String, required: true },
    periodYear: { type: Number, required: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    tier: { type: String, required: true, enum: ['starter', 'professional', 'enterprise'] },
    totalUsd: { type: Schema.Types.Decimal128, required: true },
    remaining: { type: Schema.Types.Decimal128, required: true },
    consumedUsd: {
      type: Schema.Types.Decimal128,
      default: Schema.Types.Decimal128.fromString('0'),
    },
    reservations: [
      {
        taskId: { type: String, required: true },
        amount: { type: Schema.Types.Decimal128, required: true },
        reservedAt: { type: Date, required: true },
        _id: false,
      },
    ],
    warningEmailSentAt: { type: Date, default: null },
    frozenAt: { type: Date, default: null },
    isFrozen: { type: Boolean, default: false },
    schemaVersion: { type: String, required: true, default: 'v1' },
  },
  {
    strict: true,
    timestamps: true,
    collection: 'budgets',
  },
)

// Unique budget per tenant per period
budgetSchema.index({ tenantId: 1, periodYear: 1, periodMonth: 1 }, { unique: true })

export const BudgetModel = model<BudgetDocument>('Budget', budgetSchema)
