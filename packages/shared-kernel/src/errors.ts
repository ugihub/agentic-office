/**
 * Bureau Error Hierarchy
 *
 * All domain errors extend BureauError.
 * Convention: errors carry structured context, not just messages.
 * Never throw these in business logic — wrap in err() and return Result.
 */

/** Base class for all Bureau domain errors */
export abstract class BureauError extends Error {
  abstract readonly code: string;
  readonly timestamp: Date;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      name: this.name,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ── Budget Errors ────────────────────────────────────────────────────────────

export class InsufficientBudgetError extends BureauError {
  readonly code = "BUDGET_INSUFFICIENT";

  constructor(
    readonly tenantId: string,
    readonly required: string,
    readonly available: string,
  ) {
    super(
      `Insufficient budget for tenant ${tenantId}: required ${required}, available ${available}`,
    );
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      tenantId: this.tenantId,
      required: this.required,
      available: this.available,
    };
  }
}

export class BudgetExhaustedError extends BureauError {
  readonly code = "BUDGET_EXHAUSTED";

  constructor(
    readonly tenantId: string,
    readonly taskId: string,
  ) {
    super(`Budget exhausted for tenant ${tenantId} on task ${taskId}`);
  }
}

// ── Task Errors ──────────────────────────────────────────────────────────────

export class TaskNotFoundError extends BureauError {
  readonly code = "TASK_NOT_FOUND";

  constructor(readonly taskId: string) {
    super(`Task not found: ${taskId}`);
  }
}

export class TaskAlreadyExistsError extends BureauError {
  readonly code = "TASK_ALREADY_EXISTS";

  constructor(readonly taskId: string) {
    super(`Task already exists: ${taskId}`);
  }
}

export class InvalidTaskStateError extends BureauError {
  readonly code = "INVALID_TASK_STATE";

  constructor(
    readonly taskId: string,
    readonly currentState: string,
    readonly attemptedTransition: string,
  ) {
    super(
      `Invalid state transition for task ${taskId}: cannot go from ${currentState} via ${attemptedTransition}`,
    );
  }
}

export class TaskCancelledError extends BureauError {
  readonly code = "TASK_CANCELLED";

  constructor(readonly taskId: string) {
    super(`Task ${taskId} has been cancelled`);
  }
}

// ── Agent Errors ─────────────────────────────────────────────────────────────

export class AgentTimeoutError extends BureauError {
  readonly code = "AGENT_TIMEOUT";

  constructor(
    readonly agentId: string,
    readonly timeoutMs: number,
  ) {
    super(`Agent ${agentId} timed out after ${timeoutMs}ms`);
  }
}

export class AgentCapacityError extends BureauError {
  readonly code = "AGENT_CAPACITY_EXCEEDED";

  constructor(
    readonly division: string,
    readonly maxConcurrency: number,
  ) {
    super(`Division ${division} at max concurrency: ${maxConcurrency}`);
  }
}

export class MaxRetriesExceededError extends BureauError {
  readonly code = "MAX_RETRIES_EXCEEDED";

  constructor(
    readonly taskId: string,
    readonly division: string,
    readonly maxRetries: number,
    readonly details?: string | undefined,
  ) {
    super(
      details ??
        `Max retries (${maxRetries}) exceeded for task ${taskId} in division ${division}`,
    );
  }
}

// ── LLM Errors ───────────────────────────────────────────────────────────────

export class LlmProviderError extends BureauError {
  readonly code = "LLM_PROVIDER_ERROR";

  constructor(
    readonly provider: string,
    readonly model: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`LLM provider error [${provider}/${model}]: ${message}`, options);
  }
}

export class LlmRateLimitError extends BureauError {
  readonly code = "LLM_RATE_LIMIT";

  constructor(
    readonly provider: string,
    readonly retryAfterMs?: number,
  ) {
    super(
      `Rate limited by ${provider}${retryAfterMs !== undefined ? `, retry after ${retryAfterMs}ms` : ""}`,
    );
  }
}

export class TokenLimitExceededError extends BureauError {
  readonly code = "TOKEN_LIMIT_EXCEEDED";

  constructor(
    readonly estimatedTokens: number,
    readonly maxTokens: number,
  ) {
    super(`Estimated tokens ${estimatedTokens} exceeds max ${maxTokens}`);
  }
}

// ── Auth Errors ───────────────────────────────────────────────────────────────

export class UnauthorizedError extends BureauError {
  readonly code = "UNAUTHORIZED";

  constructor(message = "Unauthorized") {
    super(message);
  }
}

export class ForbiddenError extends BureauError {
  readonly code = "FORBIDDEN";

  constructor(
    readonly tenantId: string,
    readonly resource: string,
  ) {
    super(`Tenant ${tenantId} forbidden from accessing ${resource}`);
  }
}

export class ApiKeyNotFoundError extends BureauError {
  readonly code = "API_KEY_NOT_FOUND";

  constructor() {
    super("API key not found or revoked");
  }
}

// ── Validation Errors ─────────────────────────────────────────────────────────

export class ValidationError extends BureauError {
  readonly code = "VALIDATION_ERROR";

  constructor(
    readonly field: string,
    readonly constraint: string,
  ) {
    super(`Validation failed on field '${field}': ${constraint}`);
  }
}

export class SchemaVersionError extends BureauError {
  readonly code = "SCHEMA_VERSION_MISMATCH";

  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `Schema version mismatch: expected ${expected}, received ${received}`,
    );
  }
}

// ── Infrastructure Errors ─────────────────────────────────────────────────────

export class DatabaseConnectionError extends BureauError {
  readonly code = "DB_CONNECTION_FAILED";

  constructor(message: string, options?: ErrorOptions) {
    super(`Database connection failed: ${message}`, options);
  }
}

export class CacheError extends BureauError {
  readonly code = "CACHE_ERROR";

  constructor(message: string, options?: ErrorOptions) {
    super(`Cache error: ${message}`, options);
  }
}

export class OutboxPublishError extends BureauError {
  readonly code = "OUTBOX_PUBLISH_FAILED";

  constructor(
    readonly outboxId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Outbox ${outboxId} publish failed: ${message}`, options);
  }
}

// ── Compliance Errors ─────────────────────────────────────────────────────────

export class ComplianceViolationError extends BureauError {
  readonly code = "COMPLIANCE_VIOLATION";

  constructor(
    readonly violationType:
      | "toxicity"
      | "factuality"
      | "schema"
      | "prompt_injection",
    readonly details: string,
  ) {
    super(`Compliance violation [${violationType}]: ${details}`);
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

export function isBureauError(error: unknown): error is BureauError {
  return error instanceof BureauError;
}
