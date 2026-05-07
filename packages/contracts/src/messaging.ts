/**
 * BullMQ message contracts — typed job data for each queue.
 *
 * All job payloads validated with Zod on enqueue and dequeue.
 * schemaVersion included for rolling deployments compatibility.
 */
import { z } from "zod";
import { ExecutionPathSchema } from "./common.js";

/** BullMQ queue names — canonical list */
export const QUEUE_NAMES = {
  CEO: "bureau.ceo",
  SSC_HR: "bureau.ssc.hr",
  SSC_FINANCE: "bureau.ssc.finance",
  SSC_COMPLIANCE: "bureau.ssc.compliance",
  SSC_IT: "bureau.ssc.it",
  RESEARCH: "bureau.research",
  PRODUCTION: "bureau.production",
  QA: "bureau.qa",
  MARKETING: "bureau.marketing",
  OUTBOX: "bureau.outbox",
  DEAD_LETTER: "bureau.dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Base job header present on all jobs */
const JobHeaderSchema = z
  .object({
    correlationId: z.string().min(1),
    causationId: z.string().nullable().default(null),
    traceparent: z.string().nullable().default(null),
    schemaVersion: z.literal("v1"),
  })
  .strip();

/** SelectModelCommand — CEO → HR SSC */
export const SelectModelCommandSchema = z
  .object({
    _type: z.literal("SelectModelCommand"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    tenantId: z.string().min(1),
    prompt: z.string().min(1),
    constraints: z
      .object({
        maxCostUsd: z.string(),
        preferredModelTier: z
          .enum(["economy", "standard", "premium"])
          .optional(),
      })
      .strip(),
    pathType: ExecutionPathSchema,
  })
  .strip();

export type SelectModelCommand = z.infer<typeof SelectModelCommandSchema>;

/** ModelSelectedEvent — HR SSC → CEO */
export const ModelSelectedEventSchema = z
  .object({
    _type: z.literal("ModelSelectedEvent"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    selectedModel: z.string().min(1),
    escalationChain: z.array(
      z
        .object({
          attempt: z.number().int().min(1),
          model: z.string().min(1),
          maxCostUsd: z.string(),
        })
        .strip(),
    ),
    complexityScore: z.number().min(0).max(10),
    rationale: z.string(),
  })
  .strip();

export type ModelSelectedEvent = z.infer<typeof ModelSelectedEventSchema>;

/** ReserveBudgetCommand — CEO → Finance SSC */
export const ReserveBudgetCommandSchema = z
  .object({
    _type: z.literal("ReserveBudgetCommand"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    tenantId: z.string().min(1),
    estimatedCostUsd: z.string(),
    escalationChain: z.array(
      z
        .object({
          attempt: z.number().int().min(1),
          model: z.string(),
          maxCostUsd: z.string(),
        })
        .strip(),
    ),
  })
  .strip();

export type ReserveBudgetCommand = z.infer<typeof ReserveBudgetCommandSchema>;

/** ProduceContentCommand — Project Manager → Production */
export const ProduceContentCommandSchema = z
  .object({
    _type: z.literal("ProduceContentCommand"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    tenantId: z.string().min(1),
    prompt: z.string().min(1),
    pathType: ExecutionPathSchema,
    model: z.string().min(1),
    attemptNumber: z.number().int().min(1),
    researchContext: z.string().nullable().default(null),
    outputFormat: z.enum(["markdown", "json", "text", "html"]),
  })
  .strip();

export type ProduceContentCommand = z.infer<typeof ProduceContentCommandSchema>;

/** ReviewContentCommand — Production → QA */
export const ReviewContentCommandSchema = z
  .object({
    _type: z.literal("ReviewContentCommand"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    content: z.string().min(1),
    pathType: ExecutionPathSchema,
    outputFormat: z.string(),
    attemptNumber: z.number().int().min(1),
  })
  .strip();

export type ReviewContentCommand = z.infer<typeof ReviewContentCommandSchema>;

/** SubmitTaskCommand — POST /tasks → bureau.ceo queue */
export const SubmitTaskCommandSchema = z
  .object({
    _type: z.literal("SubmitTaskCommand"),
    header: JobHeaderSchema,
    taskId: z.string().min(1),
    tenantId: z.string().min(1),
    userId: z.string().min(1),
  })
  .strip();

export type SubmitTaskCommand = z.infer<typeof SubmitTaskCommandSchema>;

/** SSE event types for client streaming */
export const SseEventTypeSchema = z.enum([
  "task.stage.changed",
  "division.progress",
  "decision_required",
  "task.completed",
  "task.failed",
  "task.cancelled",
]);

export type SseEventType = z.infer<typeof SseEventTypeSchema>;
