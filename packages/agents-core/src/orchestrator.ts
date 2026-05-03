/**
 * ParallelOrchestrator — runs workers in parallel with concurrency control.
 *
 * Uses p-limit for semaphore-based concurrency control.
 * Collects all results — does not fail fast unless AbortSignal triggered.
 */
import pLimit from 'p-limit'
import { type Result, ok, err, collectResults } from '@bureau/shared-kernel'
import { AgentCapacityError } from '@bureau/shared-kernel'
import type { IWorkerAgent, AgentContext, WorkerOutput } from './interfaces.js'

export interface OrchestratorOptions {
  /** Max concurrent workers (default: from env or 3) */
  maxConcurrency?: number
  /** Whether to fail fast on first worker error */
  failFast?: boolean
}

export interface OrchestratorResult {
  outputs: WorkerOutput[]
  failed: Array<{ workerId: string; error: Error }>
  totalDurationMs: number
  totalTokensConsumed: number
}

/**
 * Run multiple workers in parallel with concurrency control.
 *
 * @param workers - Workers to run
 * @param ctx - Agent context (includes AbortSignal)
 * @param inputs - Input per worker (same index as workers array)
 * @param options - Orchestration options
 */
export async function runParallel(
  workers: IWorkerAgent[],
  ctx: AgentContext,
  inputs: Array<Record<string, unknown>>,
  options: OrchestratorOptions = {},
): Promise<Result<OrchestratorResult, AgentCapacityError>> {
  const maxConcurrency =
    options.maxConcurrency ??
    parseInt(process.env['MAX_LLM_CONCURRENCY'] ?? '3', 10)

  if (workers.length === 0) {
    return ok({
      outputs: [],
      failed: [],
      totalDurationMs: 0,
      totalTokensConsumed: 0,
    })
  }

  if (workers.length !== inputs.length) {
    return err(
      new AgentCapacityError('orchestrator', maxConcurrency),
    )
  }

  const limit = pLimit(maxConcurrency)
  const startTime = Date.now()

  const tasks = workers.map((worker, idx) =>
    limit(async (): Promise<{ ok: true; value: WorkerOutput } | { ok: false; workerId: string; error: Error }> => {
      // Check cancellation before each task
      if (ctx.signal.aborted) {
        return {
          ok: false,
          workerId: worker.workerId,
          error: new Error('Aborted via AbortSignal'),
        }
      }

      const input = inputs[idx] ?? {}
      const result = await worker.execute(ctx, input)

      if (result.ok) {
        return { ok: true, value: result.value }
      }

      return {
        ok: false,
        workerId: worker.workerId,
        error: result.error,
      }
    }),
  )

  const settled = await Promise.all(tasks)

  const outputs: WorkerOutput[] = []
  const failed: Array<{ workerId: string; error: Error }> = []

  for (const result of settled) {
    if (result.ok) {
      outputs.push(result.value)
    } else {
      failed.push({ workerId: result.workerId, error: result.error })
      if (options.failFast === true) break
    }
  }

  const totalDurationMs = Date.now() - startTime
  const totalTokensConsumed = outputs.reduce(
    (sum, o) => sum + (o.tokensIn ?? 0) + (o.tokensOut ?? 0),
    0,
  )

  return ok({ outputs, failed, totalDurationMs, totalTokensConsumed })
}

/**
 * Pipeline orchestrator — runs workers sequentially, passing output to next.
 */
export async function runPipeline(
  workers: IWorkerAgent[],
  ctx: AgentContext,
  initialInput: Record<string, unknown>,
): Promise<Result<WorkerOutput[], Error>> {
  const outputs: WorkerOutput[] = []
  let currentInput = initialInput

  for (const worker of workers) {
    if (ctx.signal.aborted) {
      return err(new Error('Pipeline aborted via AbortSignal'))
    }

    const result = await worker.execute(ctx, currentInput)
    if (!result.ok) {
      return err(result.error)
    }

    outputs.push(result.value)
    currentInput = result.value.result
  }

  return ok(outputs)
}
