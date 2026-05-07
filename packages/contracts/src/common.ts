/**
 * Common schema primitives used across all Bureau contracts.
 *
 * Conventions:
 * - All schemas use .strip() by default (unknown fields dropped, not error)
 * - All schemas include schemaVersion: 'v1' (string, not number)
 * - All schemas include updatedAt
 * - Use z.discriminatedUnion('schemaVersion', [...]) for multi-version schemas
 */
import { z } from "zod";

/** Schema version — always string, never number */
export const SchemaVersionSchema = z.literal("v1");
export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;

/** ISO 8601 datetime string */
export const ISODateSchema = z.string().datetime();

/** ULID-prefixed ID pattern: <prefix>_<26chars> */
export const PrefixedIdSchema = (prefix: string): z.ZodString =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}_[0-9A-Z]{26}$`),
      `Must be a valid ${prefix}_<ULID> ID`,
    );

/** Decimal string (for monetary amounts) */
export const DecimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a non-negative decimal string");

/** Positive decimal string */
export const PositiveDecimalSchema = z
  .string()
  .regex(/^(?!0(\.0+)?$)\d+(\.\d+)?$/, "Must be a positive decimal string");

/** Execution path classifier */
export const ExecutionPathSchema = z.enum(["fast", "standard", "full"]);
export type ExecutionPath = z.infer<typeof ExecutionPathSchema>;

/** Task stage state machine states */
export const TaskStageSchema = z.enum([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "AwaitingUserDecision",
  "Completed",
  "Failed",
  "Cancelled",
]);
export type TaskStage = z.infer<typeof TaskStageSchema>;

/** Division names */
export const DivisionSchema = z.enum([
  "Executive",
  "HRSSc",
  "FinanceSSC",
  "ComplianceSSC",
  "ITSSC",
  "ProjectManager",
  "Research",
  "Production",
  "QA",
  "Marketing",
]);
export type Division = z.infer<typeof DivisionSchema>;

/** LLM providers */
export const LlmProviderSchema = z.enum([
  "anthropic",
  "google",
  "openai",
  "deepseek",
  "mistral",
  "qwen",
  "kimi",
]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/** Output quality label */
export const OutputQualitySchema = z
  .enum(["best_effort", "standard"])
  .nullable();
export type OutputQuality = z.infer<typeof OutputQualitySchema>;

/** Model tier */
export const ModelTierSchema = z.enum(["economy", "standard", "premium"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** Base schema fields present on all documents */
export const BaseDocumentSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    updatedAt: ISODateSchema,
  })
  .strip();
