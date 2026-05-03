/**
 * Task Envelope schema — primary domain object for Bureau tasks.
 * Maps to the task_envelopes MongoDB collection.
 */
import { z } from 'zod'
import {
  SchemaVersionSchema,
  ISODateSchema,
  DecimalStringSchema,
  PositiveDecimalSchema,
  ExecutionPathSchema,
  TaskStageSchema,
  OutputQualitySchema,
  DivisionSchema,
} from './common.js'

/** Escalation chain entry — pre-approved by Finance SSC */
const EscalationEntrySchema = z
  .object({
    attempt: z.number().int().min(1).max(10),
    model: z.string().min(1),
    maxCostUsd: DecimalStringSchema,
  })
  .strip()

/** Budget section */
const TaskBudgetSchema = z
  .object({
    maxCostUsd: DecimalStringSchema,
    reservedUsd: DecimalStringSchema,
    consumed: z
      .object({
        tokensIn: z.number().int().nonnegative(),
        tokensOut: z.number().int().nonnegative(),
        costUsd: DecimalStringSchema,
      })
      .strip(),
    reservations: z.array(
      z
        .object({
          taskId: z.string(),
          amount: DecimalStringSchema,
          reservedAt: ISODateSchema,
        })
        .strip(),
    ),
  })
  .strip()

/** Routing section */
const TaskRoutingSchema = z
  .object({
    selectedModel: z.string().min(1),
    escalationChain: z.array(EscalationEntrySchema),
    complexityScore: z.number().min(0).max(10),
    pathType: ExecutionPathSchema,
    rationale: z.string(),
    decidedBy: z.string(),
    decidedAt: ISODateSchema,
  })
  .strip()

/** Original request section */
const OriginalRequestSchema = z
  .object({
    prompt: z.string().min(1).max(50000),
    constraints: z
      .object({
        maxCostUsd: DecimalStringSchema,
        maxLatencyMs: z.number().int().positive(),
        preferredModelTier: z.enum(['economy', 'standard', 'premium']),
      })
      .strip(),
    outputFormat: z.enum(['markdown', 'json', 'text', 'html']),
    metadata: z.record(z.unknown()).default({}),
  })
  .strip()

/** AwaitingUserDecision pending decision */
const PendingDecisionSchema = z
  .object({
    reason: z.literal('budget_insufficient_for_escalation'),
    attemptNumber: z.number().int().positive(),
    bestEffortOutput: z
      .object({
        available: z.boolean(),
        qualityEstimate: z.number().min(0).max(1),
      })
      .strip(),
    escalationOption: z
      .object({
        targetModel: z.string(),
        additionalCostUsd: PositiveDecimalSchema,
        available: z.boolean(),
      })
      .strip(),
    expiresAt: ISODateSchema,
    defaultAction: z.enum(['best_effort', 'add_budget', 'cancel']),
    notifiedAt: ISODateSchema.nullable(),
  })
  .strip()
  .nullable()

/** State transition log entry */
const StateTransitionSchema = z
  .object({
    from: TaskStageSchema,
    to: TaskStageSchema,
    at: ISODateSchema,
    byAgent: z.string(),
    correlationId: z.string(),
  })
  .strip()

/** Full Task Envelope — v1 */
export const TaskEnvelopeV1Schema = z
  .object({
    taskId: z.string().min(1),
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    submittedAt: ISODateSchema,
    completedAt: ISODateSchema.nullable().default(null),
    currentStage: TaskStageSchema,
    stageVersion: z.number().int().nonnegative(),

    executionPath: ExecutionPathSchema,

    originalRequest: OriginalRequestSchema,
    routing: TaskRoutingSchema.nullable().default(null),
    budget: TaskBudgetSchema,

    pendingDecision: PendingDecisionSchema.default(null),

    intermediateOutputs: z
      .object({
        research: z
          .object({
            summary: z.string(),
            sources: z.array(z.string()),
            confidence: z.number().min(0).max(1),
          })
          .strip()
          .nullable()
          .default(null),
        production: z
          .object({
            draft: z.string(),
            version: z.number().int().positive(),
            attemptNumber: z.number().int().positive(),
          })
          .strip()
          .nullable()
          .default(null),
        qa: z.unknown().nullable().default(null),
      })
      .strip()
      .default({ research: null, production: null, qa: null }),

    finalOutput: z.string().nullable().default(null),
    outputQuality: OutputQualitySchema.default(null),

    stateTransitions: z.array(StateTransitionSchema).default([]),
    retryCount: z
      .object({
        production: z.number().int().nonnegative(),
        qa: z.number().int().nonnegative(),
      })
      .strip()
      .default({ production: 0, qa: 0 }),
    cancellationRequested: z.boolean().default(false),

    schemaVersion: SchemaVersionSchema,
    updatedAt: ISODateSchema,
  })
  .strip()

export type TaskEnvelopeV1 = z.infer<typeof TaskEnvelopeV1Schema>
export type PendingDecision = z.infer<typeof PendingDecisionSchema>
export type EscalationEntry = z.infer<typeof EscalationEntrySchema>

/** POST /tasks request body */
export const CreateTaskRequestSchema = z
  .object({
    prompt: z.string().min(1).max(50000),
    constraints: z
      .object({
        maxCostUsd: PositiveDecimalSchema.optional(),
        maxLatencyMs: z.number().int().positive().optional(),
        preferredModelTier: z.enum(['economy', 'standard', 'premium']).optional(),
      })
      .strip()
      .optional(),
    outputFormat: z.enum(['markdown', 'json', 'text', 'html']).default('markdown'),
    metadata: z.record(z.unknown()).optional(),
  })
  .strip()

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>

/** POST /tasks/:taskId/decision request body */
export const TaskDecisionRequestSchema = z
  .object({
    action: z.enum(['best_effort', 'add_budget', 'cancel']),
  })
  .strip()

export type TaskDecisionRequest = z.infer<typeof TaskDecisionRequestSchema>

/** POST /tasks/:taskId/feedback request body */
export const TaskFeedbackRequestSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
  })
  .strip()

export type TaskFeedbackRequest = z.infer<typeof TaskFeedbackRequestSchema>

/** GET /tasks/:taskId/status response */
export const TaskStatusResponseSchema = z
  .object({
    taskId: z.string(),
    currentStage: TaskStageSchema,
    executionPath: ExecutionPathSchema,
    stageVersion: z.number().int(),
    submittedAt: ISODateSchema,
    completedAt: ISODateSchema.nullable(),
    outputQuality: OutputQualitySchema,
    pendingDecision: PendingDecisionSchema,
    retryCount: z.object({
      production: z.number().int(),
      qa: z.number().int(),
    }),
  })
  .strip()

export type TaskStatusResponse = z.infer<typeof TaskStatusResponseSchema>
