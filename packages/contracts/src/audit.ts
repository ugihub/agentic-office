/**
 * Audit Trail and Agent Execution schemas.
 * Maps to audit_trail and agent_executions MongoDB collections.
 */
import { z } from "zod";
import {
  SchemaVersionSchema,
  ISODateSchema,
  DecimalStringSchema,
  DivisionSchema,
  ExecutionPathSchema,
} from "./common.js";

/** Message type for audit trail */
export const MessageTypeSchema = z.enum([
  "Command",
  "Event",
  "Query",
  "Response",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/** Audit Trail entry — v1 */
export const AuditTrailV1Schema = z
  .object({
    messageId: z.string().min(1),
    taskId: z.string().min(1),
    correlationId: z.string().min(1),
    causationId: z.string().nullable().default(null),
    timestamp: ISODateSchema,

    messageType: MessageTypeSchema,
    messageName: z.string().min(1),
    schemaVersion: SchemaVersionSchema,

    fromDivision: DivisionSchema,
    toDivision: DivisionSchema,
    fromAgent: z.string().min(1),
    toAgent: z.string().min(1),

    payloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    payloadSizeBytes: z.number().int().nonnegative(),

    transport: z.literal("BullMQ"),
    queueName: z.string().min(1),
    jobId: z.string().min(1),
    status: z.enum(["Pending", "Processing", "Completed", "Failed"]),
    attempts: z.number().int().positive(),
    latencyMs: z.number().int().nonnegative().nullable().default(null),

    traceId: z.string().nullable().default(null),
    spanId: z.string().nullable().default(null),

    updatedAt: ISODateSchema,
  })
  .strip();

export type AuditTrailV1 = z.infer<typeof AuditTrailV1Schema>;

/** Worker execution detail */
const WorkerExecutionSchema = z
  .object({
    workerId: z.string().min(1),
    jobId: z.string().min(1),
    subTaskRef: z.string().nullable().default(null),
    attemptNumber: z.number().int().nonnegative(),
    attemptReason: z.enum([
      "initial",
      "stall_requeue",
      "qa_escalation",
      "user_retry",
    ]),
    llmInvoked: z.boolean(),
    status: z.enum(["Pending", "Running", "Completed", "Failed", "Stalled"]),
    startedAt: ISODateSchema,
    endedAt: ISODateSchema.nullable().default(null),
    durationMs: z.number().int().nonnegative().nullable().default(null),
    llmInvocation: z
      .object({
        provider: z.string(),
        model: z.string(),
        tokensIn: z.number().int().nonnegative(),
        tokensOut: z.number().int().nonnegative(),
        costUsd: DecimalStringSchema,
        cachedTokens: z.number().int().nonnegative().default(0),
      })
      .strip()
      .nullable()
      .default(null),
    errorMessage: z.string().nullable().default(null),
  })
  .strip();

/** Agent Execution — v1 */
export const AgentExecutionV1Schema = z
  .object({
    executionId: z.string().min(1),
    taskId: z.string().min(1),
    division: DivisionSchema,
    headAgentId: z.string().min(1),
    decompositionStrategy: z.enum([
      "MapReduce",
      "Pipeline",
      "Scatter",
      "Single",
    ]),
    executionPath: ExecutionPathSchema,

    startedAt: ISODateSchema,
    endedAt: ISODateSchema.nullable().default(null),
    totalDurationMs: z.number().int().nonnegative().nullable().default(null),
    parallelDegree: z.number().int().positive(),

    workers: z.array(WorkerExecutionSchema),

    aggregationResult: z
      .object({
        tokenCount: z.number().int().nonnegative(),
        method: z.string(),
      })
      .strip()
      .nullable()
      .default(null),
    failureCount: z.number().int().nonnegative().default(0),

    schemaVersion: SchemaVersionSchema,
    updatedAt: ISODateSchema,
  })
  .strip();

export type AgentExecutionV1 = z.infer<typeof AgentExecutionV1Schema>;
export type WorkerExecution = z.infer<typeof WorkerExecutionSchema>;
