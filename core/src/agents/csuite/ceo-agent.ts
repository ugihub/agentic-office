/**
 * CEO Agent — entry point for all task execution.
 *
 * Responsibilities:
 * 1. Classify execution path (fast/standard/full)
 * 2. Dispatch SSC agents in parallel (HR + Finance + Compliance + IT)
 * 3. Persist task envelope state transitions
 * 4. Drive state machine transitions
 * 5. Hand off to ProjectManager for core execution
 *
 * Pattern: TOGAF Vision → Execution, per plan section 2.
 */
import {
  type Result,
  ok,
  err,
  newId,
  EntityPrefix,
} from "@bureau/shared-kernel";
import type {
  IHeadAgent,
  AgentContext,
  HeadAgentOutput,
} from "@bureau/agents-core";
import { createLogger } from "@bureau/telemetry";
import {
  classifyPath,
  classifyCacheCategory,
} from "../../path-classifier/classifier.js";
import type { CreateTaskRequest } from "@bureau/contracts";

export interface CeoAgentDeps {
  /** Persist state transition to MongoDB */
  persistTransition: (
    taskId: string,
    from: string,
    to: string,
    correlationId: string,
  ) => Promise<void>;
  /** Run HR, Finance, Compliance, IT SSC in parallel */
  runSscAgents: (
    ctx: AgentContext,
    prompt: string,
    maxCostUsd: string,
  ) => Promise<Result<SscResults, Error>>;
}

export interface SscResults {
  selectedModel: string;
  escalationChain: Array<{
    attempt: number;
    model: string;
    maxCostUsd: string;
  }>;
  complexityScore: number;
  budgetReserved: boolean;
  complianceApproved: boolean;
}

export interface CeoTaskInput {
  request: CreateTaskRequest;
  taskId: string;
  tenantId: string;
  userId: string;
  idempotencyKey?: string | undefined;
}

export class CeoAgent implements IHeadAgent {
  readonly division = "Executive" as const;
  readonly agentId: string;

  constructor(private readonly deps: CeoAgentDeps) {
    this.agentId = newId(EntityPrefix.AGENT);
  }

  async execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>> {
    const log = createLogger({
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      division: this.division,
      agentId: this.agentId,
    });

    log.info(
      { executionPath: ctx.executionPath },
      "CEO Agent starting task orchestration",
    );

    // Step 1: Check cancellation
    if (ctx.signal.aborted) {
      return err(new Error("Task cancelled before CEO processing"));
    }

    // Step 2: Persist Submitted → Preparing transition
    try {
      await this.deps.persistTransition(
        ctx.taskId,
        "Submitted",
        "Preparing",
        ctx.correlationId,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error({ err: msg }, "Failed to persist state transition");
      return err(new Error(`State persistence failed: ${msg}`));
    }

    // Step 3: Run SSC agents in parallel (HR + Finance + Compliance + IT)
    log.info("Dispatching SSC agents in parallel");
    const sscStart = Date.now();

    // Extract prompt from extended context (set by task-processor before calling execute)
    const extCtx = ctx as AgentContext & {
      prompt?: string;
      maxCostUsd?: string;
    };
    const prompt = extCtx.prompt ?? "";
    const maxCostUsd = extCtx.maxCostUsd ?? "0.50";

    const sscResult = await this.deps.runSscAgents(ctx, prompt, maxCostUsd);

    if (!sscResult.ok) {
      log.error({ err: sscResult.error.message }, "SSC agents failed");
      return err(sscResult.error);
    }

    const sscDurationMs = Date.now() - sscStart;
    log.info(
      {
        selectedModel: sscResult.value.selectedModel,
        complexityScore: sscResult.value.complexityScore,
        sscDurationMs,
      },
      "SSC agents completed",
    );

    // Step 4: Persist Preparing → next state
    const nextState =
      ctx.executionPath === "fast" ? "Producing" : "Researching";
    try {
      await this.deps.persistTransition(
        ctx.taskId,
        "Preparing",
        nextState,
        ctx.correlationId,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(new Error(`State persistence failed: ${msg}`));
    }

    return ok({
      division: this.division,
      result: {
        selectedModel: sscResult.value.selectedModel,
        escalationChain: sscResult.value.escalationChain,
        complexityScore: sscResult.value.complexityScore,
        nextState,
      },
      tokensConsumed: 0, // CEO itself doesn't call LLM
      durationMs: Date.now() - sscStart,
      workerCount: 4, // HR + Finance + Compliance + IT
    });
  }
}

/**
 * Factory function: create a CEO task from a request.
 * Returns taskId and classified execution path.
 */
export function createCeoTaskInput(
  request: CreateTaskRequest,
  tenantId: string,
  userId: string,
  idempotencyKey?: string,
): CeoTaskInput {
  const taskId = newId(EntityPrefix.TASK);
  return { request, taskId, tenantId, userId, idempotencyKey };
}

/** Classify a task — thin wrapper that also captures cache category for caller */
export function classifyTask(prompt: string): {
  path: import("@bureau/contracts").ExecutionPath;
  cacheCategory: import("../../path-classifier/classifier.js").CacheCategory;
  tokenCount: number;
} {
  const { path, signals } = classifyPath({ prompt });
  const cacheCategory = classifyCacheCategory(prompt);
  return { path, cacheCategory, tokenCount: signals.tokenCount };
}
