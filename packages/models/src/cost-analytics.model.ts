/**
 * CostAnalytics model — financial record per LLM invocation.
 *
 * CRITICAL: Write path MUST be active from day 1.
 * This is a financial record — not a conversation log.
 * Do NOT store prompt text here. Use taskId → task_envelopes to lookup.
 *
 * TTL: 365 days (1 year retention for financial audit).
 * GDPR: userId nulled on anonymization request, data kept for financial integrity.
 */
import { Schema, model, type Document, type Types } from 'mongoose'
import type { Division } from '@bureau/contracts'

export interface CostEventDocument extends Omit<Document, 'model'> {
  eventId: string
  tenantId: string
  userId: string | null       // null after GDPR anonymization
  taskId: string
  division: Division
  agentId: string

  model: string
  provider: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  costUsd: Types.Decimal128

  retryAttempt: number
  isEscalated: boolean
  escalationTier: 'tier1' | 'tier2' | 'tier3' | null

  durationMs: number
  timestamp: Date

  anonymizedAt: Date | null
  schemaVersion: 'v1'
}

const costEventSchema = new Schema<CostEventDocument>(
  {
    eventId: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    userId: { type: String, default: null },
    taskId: { type: String, required: true },
    division: {
      type: String,
      required: true,
      enum: [
        'Executive', 'HRSSc', 'FinanceSSC', 'ComplianceSSC', 'ITSSC',
        'ProjectManager', 'Research', 'Production', 'QA', 'Marketing',
      ],
    },
    agentId: { type: String, required: true },
    model: { type: String, required: true },
    provider: { type: String, required: true },
    tokensIn: { type: Number, required: true, min: 0 },
    tokensOut: { type: Number, required: true, min: 0 },
    cachedTokens: { type: Number, default: 0 },
    costUsd: { type: Schema.Types.Decimal128, required: true },
    retryAttempt: { type: Number, default: 0, min: 0 },
    isEscalated: { type: Boolean, default: false },
    escalationTier: {
      type: String,
      enum: ['tier1', 'tier2', 'tier3', null],
      default: null,
    },
    durationMs: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    anonymizedAt: { type: Date, default: null },
    schemaVersion: { type: String, required: true, default: 'v1' },
  },
  {
    strict: true,
    collection: 'cost_analytics',
  },
)

// TTL: auto-delete after 365 days
costEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 })
// Query indexes
costEventSchema.index({ tenantId: 1, timestamp: -1 })
costEventSchema.index({ taskId: 1 })
costEventSchema.index({ userId: 1 })

export const CostEventModel = model<CostEventDocument>('CostEvent', costEventSchema)
