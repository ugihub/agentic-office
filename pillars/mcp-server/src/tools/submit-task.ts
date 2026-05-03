/**
 * MCP Tool: bureau_submit_task
 *
 * Submits a task to Bureau and returns taskId + execution status.
 * Long-running tasks stream progress via bureau_task_status.
 */
import { z } from 'zod'

export const SubmitTaskInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(10_000)
    .describe('The task prompt — what you want Bureau to do'),
  maxCostUsd: z
    .string()
    .optional()
    .default('0.50')
    .describe('Max budget in USD (default: 0.50)'),
  outputFormat: z
    .enum(['markdown', 'json', 'text'])
    .optional()
    .default('markdown')
    .describe('Output format (default: markdown)'),
  preferredModelTier: z
    .enum(['economy', 'standard', 'premium'])
    .optional()
    .describe('Model tier preference (economy=fastest/cheapest, premium=best quality)'),
})

export type SubmitTaskInput = z.infer<typeof SubmitTaskInputSchema>

export const SUBMIT_TASK_TOOL = {
  name: 'bureau_submit_task',
  description:
    'Submit a task to Bureau — a multi-agent AI system with specialized divisions. ' +
    'Bureau assigns your task to the right divisions (Research, Production, QA, Marketing) ' +
    'based on complexity. Returns taskId for status tracking.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'The task prompt — what you want Bureau to do',
        minLength: 1,
        maxLength: 10000,
      },
      maxCostUsd: {
        type: 'string',
        description: 'Max budget in USD (default: 0.50)',
        default: '0.50',
      },
      outputFormat: {
        type: 'string',
        enum: ['markdown', 'json', 'text'],
        description: 'Output format',
        default: 'markdown',
      },
      preferredModelTier: {
        type: 'string',
        enum: ['economy', 'standard', 'premium'],
        description: 'Model tier preference',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
} as const
