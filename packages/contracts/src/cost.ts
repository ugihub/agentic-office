/**
 * Cost Analytics and Outbox schemas.
 * cost_analytics: financial record, NOT conversation log.
 * outbox: transactional outbox for BullMQ reliability.
 */
import { z } from "zod";
import {
  SchemaVersionSchema,
  ISODateSchema,
  DecimalStringSchema,
  DivisionSchema,
} from "./common.js";

/** Cost Analytics event — v1 (write path from day 1) */
export const CostEventV1Schema = z
  .object({
    eventId: z.string().min(1),
    tenantId: z.string().min(1),
    userId: z.string().nullable(), // null after GDPR anonymization
    taskId: z.string().min(1),
    division: DivisionSchema,
    agentId: z.string().min(1),

    model: z.string().min(1),
    provider: z.string().min(1),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative().default(0),
    costUsd: DecimalStringSchema,

    retryAttempt: z.number().int().nonnegative().default(0),
    isEscalated: z.boolean().default(false),
    escalationTier: z
      .enum(["tier1", "tier2", "tier3"])
      .nullable()
      .default(null),

    durationMs: z.number().int().nonnegative(),
    timestamp: ISODateSchema,

    anonymizedAt: ISODateSchema.nullable().default(null),
    schemaVersion: SchemaVersionSchema,
  })
  .strip();

export type CostEventV1 = z.infer<typeof CostEventV1Schema>;

/** Outbox entry — v1 */
export const OutboxEntryV1Schema = z
  .object({
    outboxId: z.string().min(1),
    occurredAt: ISODateSchema,
    processedAt: ISODateSchema.nullable().default(null),
    status: z.enum(["Pending", "Completed", "Failed"]).default("Pending"),
    attempts: z.number().int().nonnegative().default(0),
    nextAttemptAt: ISODateSchema,

    targetQueue: z.string().min(1),
    jobName: z.string().min(1),
    jobData: z.record(z.string(), z.unknown()),
    headers: z.record(z.string(), z.string()),
  })
  .strip();

export type OutboxEntryV1 = z.infer<typeof OutboxEntryV1Schema>;

/** API Key — v1 */
export const ApiKeyV1Schema = z
  .object({
    keyId: z.string().min(1),
    keyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    keyPrefix: z.string().min(1),
    ownerId: z.string().min(1),
    tenantId: z.string().min(1),
    name: z.string().min(1).max(100),
    status: z.enum(["active", "revoked"]),
    permissions: z.array(
      z.enum(["task:write", "task:read", "keys:write", "keys:read"]),
    ),
    rateLimit: z
      .object({
        requestsPerMinute: z.number().int().positive(),
        requestsPerDay: z.number().int().positive(),
      })
      .strip(),
    usage: z
      .object({
        totalRequests: z.number().int().nonnegative(),
        totalCostUsd: DecimalStringSchema,
      })
      .strip(),
    createdAt: ISODateSchema,
    lastUsedAt: ISODateSchema.nullable().default(null),
    expiresAt: ISODateSchema.nullable().default(null),
    schemaVersion: SchemaVersionSchema,
  })
  .strip();

export type ApiKeyV1 = z.infer<typeof ApiKeyV1Schema>;
