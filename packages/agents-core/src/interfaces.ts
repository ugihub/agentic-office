/**
 * Agent interfaces — contracts every agent must implement.
 *
 * Two agent types:
 * - IHeadAgent: orchestrates workers in a division, spawnable per task
 * - IWorkerAgent: executes a single unit of work, poolable
 *
 * Framework-agnostic: no NestJS, no Next.js imports.
 */
import type { Result } from '@bureau/shared-kernel'
import type { Division, ExecutionPath } from '@bureau/contracts'

/** Context passed to every agent execution */
export interface AgentContext {
  taskId: string
  tenantId: string
  userId: string
  correlationId: string
  executionPath: ExecutionPath
  signal: AbortSignal    // For graceful cancellation
}

/** Output from a head agent's orchestration */
export interface HeadAgentOutput {
  division: Division
  result: Record<string, unknown>
  tokensConsumed: number
  durationMs: number
  workerCount: number
}

/** Output from a single worker execution */
export interface WorkerOutput {
  workerId: string
  result: Record<string, unknown>
  llmInvoked: boolean
  tokensIn?: number
  tokensOut?: number
  cachedTokens?: number
  durationMs: number
}

/**
 * IHeadAgent — orchestrates workers within a division.
 * Spawned per-task (ephemeral) for core agents.
 * Persistent pool for SSC agents.
 */
export interface IHeadAgent {
  readonly division: Division
  readonly agentId: string

  /**
   * Execute the agent's task.
   * Must return Result<T, E> — never throw in implementation.
   * Must check ctx.signal.aborted before expensive operations.
   */
  execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>>
}

/**
 * IWorkerAgent — executes a single unit of work.
 * Multiple workers can run in parallel within a division.
 */
export interface IWorkerAgent {
  readonly workerId: string
  readonly division: Division

  execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>>
}

/** Decomposition strategy determines how head agent uses workers */
export type DecompositionStrategy = 'MapReduce' | 'Pipeline' | 'Scatter' | 'Single'
