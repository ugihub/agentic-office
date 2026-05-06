/**
 * Bureau SDK — shared types.
 * Mirrors API contracts without depending on @bureau/contracts (keeps SDK dep-free).
 */

export type ExecutionPath = 'fast' | 'standard' | 'full'
export type TaskStage =
  | 'Submitted'
  | 'Preparing'
  | 'Researching'
  | 'Producing'
  | 'Reviewing'
  | 'Formatting'
  | 'AwaitingUserDecision'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'

export type OutputQuality = 'standard' | 'best_effort'

export interface TaskConstraints {
  maxCostUsd?: string
  maxLatencyMs?: number
  preferredModelTier?: 'economy' | 'standard' | 'premium'
}

export interface SubmitTaskOptions {
  prompt: string
  constraints?: TaskConstraints
  outputFormat?: 'markdown' | 'json' | 'text'
  /** Idempotency key — same key returns existing task */
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export interface TaskEnvelope {
  taskId: string
  tenantId: string
  currentStage: TaskStage
  executionPath: ExecutionPath
  finalOutput: string | null
  outputQuality: OutputQuality | null
  costUsd: string | null
  pendingDecision: PendingDecision | null
  createdAt: string
  updatedAt: string
}

export interface PendingDecision {
  reason: string
  attemptNumber: number
  bestEffortOutput: {
    available: boolean
    qualityEstimate: number
  } | null
  escalationOption: {
    targetModel: string
    additionalCostUsd: string
    available: boolean
  } | null
  expiresAt: string
  defaultAction: 'best_effort' | 'add_budget' | 'cancel'
}

export interface TaskStatus {
  taskId: string
  currentStage: TaskStage
  executionPath: ExecutionPath
  finalOutput: string | null
  outputQuality: OutputQuality | null
  costUsd: string | null
  pendingDecision: PendingDecision | null
  updatedAt: string
}

export interface ApiKey {
  keyId: string
  name: string
  keyPrefix: string
  permissions: string[]
  status: 'active' | 'revoked'
  createdAt: string
  lastUsedAt: string | null
}

export interface CreateApiKeyResult {
  /** Full key — show ONCE, never stored */
  plaintext: string
  keyId: string
  name: string
  keyPrefix: string
  permissions: string[]
  expiresAt?: string | null
}

export type DecisionAction = 'best_effort' | 'add_budget' | 'cancel'

export interface BureauClientOptions {
  /** Bureau API base URL. Default: https://api.bureau.id */
  baseUrl?: string
  /** API key (bureau_live_...) or JWT */
  apiKey?: string
  /** JWT token (alternative to apiKey) */
  jwt?: string
  /** Fetch timeout in ms. Default: 30000 */
  timeout?: number
}

// ─── SSE Event types ──────────────────────────────────────────────────────────

export interface StageChangedEvent {
  event: 'task.stage.changed'
  taskId: string
  from: TaskStage
  to: TaskStage
  at: string
}

export interface DivisionProgressEvent {
  event: 'division.progress'
  taskId: string
  division: string
  progress: number
}

export interface DecisionRequiredEvent {
  event: 'decision_required'
  taskId: string
  pendingDecision: PendingDecision
}

export interface TaskCompletedEvent {
  event: 'task.completed'
  taskId: string
  output: string
  outputQuality: OutputQuality
  costUsd: string
}

export interface TaskFailedEvent {
  event: 'task.failed'
  taskId: string
  reason: string
  attempts: number
}

export type BureauSSEEvent =
  | StageChangedEvent
  | DivisionProgressEvent
  | DecisionRequiredEvent
  | TaskCompletedEvent
  | TaskFailedEvent
