/**
 * @bureau/shared-kernel
 *
 * Core primitives used by ALL Bureau packages.
 * This package MUST have zero framework dependencies.
 * First thing written. Last thing changed.
 */

// Result<T, E> pattern — the most important export
export {
  type Result,
  ok,
  err,
  tryAsync,
  trySync,
  mapOk,
  mapErr,
  andThen,
  unwrapOrThrow,
  collectResults,
} from './result.js'

// ULID — ID generation
export {
  newUlid,
  newId,
  newTypedId,
  isValidId,
  extractTimestamp,
  generateUlid,
  EntityPrefix,
  type BureauId,
  type EntityPrefix as EntityPrefixType,
} from './ulid.js'

// Money — decimal-safe monetary values
export {
  Money,
  parseMoney,
  type Currency,
  type Decimal,
} from './money.js'

// Error hierarchy
export {
  BureauError,
  InsufficientBudgetError,
  BudgetExhaustedError,
  TaskNotFoundError,
  TaskAlreadyExistsError,
  InvalidTaskStateError,
  TaskCancelledError,
  AgentTimeoutError,
  AgentCapacityError,
  MaxRetriesExceededError,
  LlmProviderError,
  LlmRateLimitError,
  TokenLimitExceededError,
  UnauthorizedError,
  ForbiddenError,
  ApiKeyNotFoundError,
  ValidationError,
  SchemaVersionError,
  DatabaseConnectionError,
  CacheError,
  OutboxPublishError,
  ComplianceViolationError,
  isBureauError,
} from './errors.js'
