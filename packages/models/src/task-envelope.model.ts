/**
 * TaskEnvelope Mongoose model — primary domain document.
 * Maps to task_envelopes collection.
 *
 * CRITICAL: optimistic concurrency via stageVersion field.
 * Finance atomic reservation uses findOneAndUpdate + $gte (not here, in budget model).
 */
import { Schema, Types, model, type Document } from 'mongoose'
import type { TaskStage, ExecutionPath } from '@bureau/contracts'

export interface TaskEnvelopeDocument extends Document {
  taskId: string
  tenantId: string
  userId: string
  submittedAt: Date
  completedAt: Date | null
  currentStage: TaskStage
  stageVersion: number
  executionPath: ExecutionPath
  originalRequest: {
    prompt: string
    constraints: {
      maxCostUsd: Types.Decimal128
      maxLatencyMs: number
      preferredModelTier: 'economy' | 'standard' | 'premium'
    }
    outputFormat: 'markdown' | 'json' | 'text' | 'html'
    metadata: Record<string, unknown>
  }
  routing: {
    selectedModel: string
    escalationChain: Array<{
      attempt: number
      model: string
      maxCostUsd: Types.Decimal128
    }>
    complexityScore: number
    pathType: ExecutionPath
    rationale: string
    decidedBy: string
    decidedAt: Date
  } | null
  budget: {
    maxCostUsd: Types.Decimal128
    reservedUsd: Types.Decimal128
    consumed: {
      tokensIn: number
      tokensOut: number
      costUsd: Types.Decimal128
    }
    reservations: Array<{
      taskId: string
      amount: Types.Decimal128
      reservedAt: Date
    }>
  }
  pendingDecision: {
    reason: 'budget_insufficient_for_escalation'
    attemptNumber: number
    bestEffortOutput: { available: boolean; qualityEstimate: number }
    escalationOption: { targetModel: string; additionalCostUsd: Types.Decimal128; available: boolean }
    expiresAt: Date
    defaultAction: 'best_effort' | 'add_budget' | 'cancel'
    notifiedAt: Date | null
  } | null
  intermediateOutputs: {
    research: { summary: string; sources: string[]; confidence: number } | null
    production: { draft: string; version: number; attemptNumber: number } | null
    qa: unknown | null
  }
  finalOutput: string | null
  outputQuality: 'best_effort' | 'standard' | null
  stateTransitions: Array<{
    from: TaskStage
    to: TaskStage
    at: Date
    byAgent: string
    correlationId: string
  }>
  retryCount: { production: number; qa: number }
  cancellationRequested: boolean
  idempotencyKey: string | null
  schemaVersion: 'v1'
  updatedAt: Date
}

const escalationEntrySchema = new Schema(
  {
    attempt: { type: Number, required: true },
    model: { type: String, required: true },
    maxCostUsd: { type: Schema.Types.Decimal128, required: true },
  },
  { _id: false },
)

const taskEnvelopeSchema = new Schema<TaskEnvelopeDocument>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
    currentStage: {
      type: String,
      required: true,
      enum: [
        'Submitted', 'Preparing', 'Researching', 'Producing',
        'Reviewing', 'Formatting', 'AwaitingUserDecision',
        'Completed', 'Failed', 'Cancelled',
      ],
      default: 'Submitted',
    },
    stageVersion: { type: Number, required: true, default: 0 },
    executionPath: { type: String, required: true, enum: ['fast', 'standard', 'full'] },
    originalRequest: {
      prompt: { type: String, required: true },
      constraints: {
        maxCostUsd: { type: Schema.Types.Decimal128, required: true },
        maxLatencyMs: { type: Number, required: true, default: 30000 },
        preferredModelTier: {
          type: String,
          enum: ['economy', 'standard', 'premium'],
          default: 'standard',
        },
      },
      outputFormat: {
        type: String,
        enum: ['markdown', 'json', 'text', 'html'],
        default: 'markdown',
      },
      metadata: { type: Schema.Types.Mixed, default: {} },
    },
    routing: {
      type: {
        selectedModel: { type: String, required: true },
        escalationChain: [escalationEntrySchema],
        complexityScore: { type: Number, required: true },
        pathType: { type: String, required: true },
        rationale: { type: String, required: true },
        decidedBy: { type: String, required: true },
        decidedAt: { type: Date, required: true },
      },
      default: null,
    },
    budget: {
      maxCostUsd: { type: Schema.Types.Decimal128, required: true },
      reservedUsd: { type: Schema.Types.Decimal128, default: new Types.Decimal128('0') },
      consumed: {
        tokensIn: { type: Number, default: 0 },
        tokensOut: { type: Number, default: 0 },
        costUsd: { type: Schema.Types.Decimal128, default: new Types.Decimal128('0') },
      },
      reservations: [
        {
          taskId: String,
          amount: Schema.Types.Decimal128,
          reservedAt: Date,
          _id: false,
        },
      ],
    },
    pendingDecision: { type: Schema.Types.Mixed, default: null },
    intermediateOutputs: {
      research: { type: Schema.Types.Mixed, default: null },
      production: { type: Schema.Types.Mixed, default: null },
      qa: { type: Schema.Types.Mixed, default: null },
    },
    finalOutput: { type: String, default: null },
    outputQuality: { type: String, enum: ['best_effort', 'standard', null], default: null },
    stateTransitions: [
      {
        from: String,
        to: String,
        at: Date,
        byAgent: String,
        correlationId: String,
        _id: false,
      },
    ],
    retryCount: {
      production: { type: Number, default: 0 },
      qa: { type: Number, default: 0 },
    },
    cancellationRequested: { type: Boolean, default: false },
    idempotencyKey: { type: String, default: null, sparse: true, index: true },
    schemaVersion: { type: String, required: true, default: 'v1' },
  },
  {
    strict: true,
    timestamps: { updatedAt: true, createdAt: false },
    collection: 'task_envelopes',
  },
)

// Compound indexes
taskEnvelopeSchema.index({ tenantId: 1, submittedAt: -1 })
taskEnvelopeSchema.index({ currentStage: 1 })
taskEnvelopeSchema.index({ 'pendingDecision.expiresAt': 1 }, { sparse: true })
taskEnvelopeSchema.index({ idempotencyKey: 1, tenantId: 1 }, { unique: true, sparse: true })

export const TaskEnvelopeModel = model<TaskEnvelopeDocument>('TaskEnvelope', taskEnvelopeSchema)
