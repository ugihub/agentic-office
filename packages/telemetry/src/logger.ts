/**
 * Structured logger using Pino.
 *
 * Convention (WAJIB — cannot be retrofitted):
 * - Every log entry MUST have: taskId, correlationId, division
 * - Field names are EXACT: taskId, correlationId, division, agentId
 * - No variations (not task_id, not correlation-id)
 *
 * Use logger.child() for all agent-specific loggers.
 */
import pino, { type Logger } from 'pino'

/** Standard log context fields — required by observability */
export interface LogContext {
  taskId?: string | undefined
  correlationId?: string | undefined
  division?: string | undefined
  agentId?: string | undefined
  tenantId?: string | undefined
  workerId?: string | undefined
}

/** Redacted field values — never logged */
const REDACTED_PATHS = [
  'prompt',
  'output',
  'finalOutput',
  '*.prompt',
  '*.output',
  'encryptedKey',
  'keyHash',
  'password',
  'apiKey',
  'token',
  '*.apiKey',
  '*.token',
]

const _base = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pino-pretty via pipe: node app.js | pino-pretty
  // In production: raw JSON for log aggregator
})

/**
 * Create a child logger with standard Bureau context.
 *
 * Usage:
 *   const log = createLogger({ taskId, correlationId, division: 'Production' })
 *   log.info({ llmModel, tokensIn }, 'LLM invocation started')
 */
export function createLogger(ctx: LogContext): Logger {
  // Filter out undefined values to avoid cluttering log entries
  const cleanCtx = Object.fromEntries(
    Object.entries(ctx).filter(([, v]) => v !== undefined),
  ) as Record<string, string>

  return _base.child(cleanCtx)
}

/** Root logger — use only for infra-level logging */
export const rootLogger = _base

/** Type alias for Pino Logger */
export type BureauLogger = Logger
