/**
 * @bureau/telemetry
 *
 * Structured logging + distributed tracing.
 * Cross-cutting concern — included from day 1, never retrofitted.
 */

export {
  createLogger,
  rootLogger,
  type LogContext,
  type BureauLogger,
} from "./logger.js";

export {
  initTelemetry,
  getTracer,
  extractTraceContext,
  injectTraceContext,
  withSpan,
  type TelemetryOptions,
} from "./otel.js";

export {
  recordTaskSubmitted,
  recordTaskCompleted,
  recordPathClassification,
  recordEscalation,
  incrementAwaitingDecision,
  decrementAwaitingDecision,
  recordLlmCost,
  recordQueueDepth,
  recordDivisionLatency,
  recordHttpRequest,
  recordSpendingAnomaly,
  recordCacheHit,
  recordComplianceViolation,
} from "./metrics.js";
