/**
 * Task Processor — BullMQ worker for the full agent pipeline.
 *
 * Listens on bureau.ceo queue.
 * Processes: CEO → SSC (HR+Finance+Compliance) → [Research] → Production(LLM) → QA → Marketing → Complete
 *
 * This is the "assembly layer" that wires all separately-built agents together.
 * Before this file, all components existed but nothing dispatched them end-to-end.
 *
 * CRITICAL rules enforced here:
 * - All state transitions write to MongoDB (not Redis)
 * - Budget reservation atomic via Finance SSC
 * - Every LLM invocation recorded via recordLlmInvocation
 * - Idempotency: if task not in Submitted stage, skip (already processing)
 * - Cancellation propagated via AbortController
 */
import { createWorker } from "@bureau/infra-messaging";
import { QUEUE_NAMES } from "@bureau/contracts";
import { TaskEnvelopeModel, BudgetModel } from "@bureau/models";
import { createLogger } from "@bureau/telemetry";
import { newId, EntityPrefix } from "@bureau/shared-kernel";
import {
  recordLlmInvocation,
  getTaskCostSummary,
} from "@bureau/cost-analytics";
// SSC agents (pure functions)
import {
  selectModelForTask,
  reserveBudgetAtomic,
  releaseBudget,
  preApproveEscalationChain,
  runComplianceValidation,
} from "@bureau/core";
// Core agents
import {
  ProductionAgent,
  ChunkWorker,
  type EscalationEntry,
  type ProductionInput,
} from "@bureau/core";
import {
  QaAgent,
  SchemaValidatorWorker,
  CompletenessCheckerWorker,
  RelevanceCheckerWorker,
  type QaOutput,
  type QaInput,
} from "@bureau/core";
import {
  MarketingAgent,
  FormatterWorker,
  CitationWorker,
  DeliveryWorker,
  type MarketingInput,
  type DeliveredOutput,
} from "@bureau/core";
import { classifyPath, estimateTokens } from "@bureau/core";
// LLM providers
import {
  ProviderRegistry,
  ClaudeProvider,
  GeminiProvider,
} from "@bureau/llm-providers";
import type { AgentContext } from "@bureau/agents-core";

const log = createLogger({ division: "Executive" });

// ─── Job payload type ─────────────────────────────────────────────────────────

interface SubmitJob extends Record<string, unknown> {
  taskId: string;
  tenantId: string;
  userId: string;
  correlationId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function transitionStage(
  taskId: string,
  tenantId: string,
  from: string,
  to: string,
  byAgent: string,
  correlationId: string,
): Promise<void> {
  await TaskEnvelopeModel.updateOne(
    { taskId, tenantId },
    {
      $set: { currentStage: to },
      $inc: { stageVersion: 1 },
      $push: {
        stateTransitions: {
          from,
          to,
          at: new Date(),
          byAgent,
          correlationId,
        },
      },
    },
  ).exec();
}

async function markFailed(
  taskId: string,
  tenantId: string,
  correlationId: string,
  reason: string,
): Promise<void> {
  await TaskEnvelopeModel.updateOne(
    { taskId, tenantId },
    {
      $set: {
        currentStage: "Failed",
        "intermediateOutputs.qa": { failureReason: reason },
      },
      $inc: { stageVersion: 1 },
      $push: {
        stateTransitions: {
          from: "unknown",
          to: "Failed",
          at: new Date(),
          byAgent: "task-processor",
          correlationId,
        },
      },
    },
  ).exec();
}

// ─── Processor ────────────────────────────────────────────────────────────────

async function releaseUnusedBudgetAfterCostSummary(params: {
  taskId: string;
  tenantId: string;
  reservedCostUsd: string;
  log: ReturnType<typeof createLogger>;
}): Promise<void> {
  const costSummary = await getTaskCostSummary(params.taskId);
  const actualCostUsd = costSummary.ok
    ? costSummary.value.totalCostUsd
    : params.reservedCostUsd;

  if (costSummary.ok) {
    await TaskEnvelopeModel.updateOne(
      { taskId: params.taskId, tenantId: params.tenantId },
      {
        $set: {
          "budget.consumed.tokensIn": costSummary.value.totalTokensIn,
          "budget.consumed.tokensOut": costSummary.value.totalTokensOut,
          "budget.consumed.costUsd": costSummary.value.totalCostUsd,
        },
      },
    ).exec();
  } else {
    params.log.error(
      { err: costSummary.error.message },
      "Cost summary unavailable; keeping full reservation consumed",
    );
  }

  const releaseResult = await releaseBudget(
    { budgetModel: BudgetModel },
    params.taskId,
    params.tenantId,
    actualCostUsd,
    params.reservedCostUsd,
  );

  if (!releaseResult.ok) {
    params.log.error(
      { err: releaseResult.error.message },
      "Failed to release unused budget",
    );
  }
}

async function completeFormattingOnly(params: {
  taskId: string;
  tenantId: string;
  userId: string;
  correlationId: string;
  executionPath: "fast" | "standard" | "full";
  prompt: string;
  draft: string;
  outputFormat: "markdown" | "json" | "text" | "html";
  outputQuality: "standard" | "best_effort";
  reservedCostUsd: string;
  signal: AbortSignal;
  log: ReturnType<typeof createLogger>;
}): Promise<void> {
  const marketingInput: MarketingInput = {
    draft: params.draft,
    originalPrompt: params.prompt,
    outputFormat: params.outputFormat,
    researchSources: undefined,
    outputQuality: params.outputQuality,
  };

  const marketingCtx: AgentContext & { marketingInput: MarketingInput } = {
    taskId: params.taskId,
    tenantId: params.tenantId,
    userId: params.userId,
    correlationId: params.correlationId,
    executionPath: params.executionPath,
    signal: params.signal,
    marketingInput,
  };

  const marketingAgent = new MarketingAgent({
    formatterWorker: new FormatterWorker(),
    citationWorker: new CitationWorker(),
    deliveryWorker: new DeliveryWorker(),
  });

  const marketingResult = await marketingAgent.execute(marketingCtx);
  if (!marketingResult.ok) {
    await markFailed(
      params.taskId,
      params.tenantId,
      params.correlationId,
      `Marketing failed: ${marketingResult.error.message}`,
    );
    return;
  }

  const delivered = marketingResult.value.result as unknown as DeliveredOutput;

  await TaskEnvelopeModel.updateOne(
    { taskId: params.taskId, tenantId: params.tenantId },
    {
      $set: {
        currentStage: "Completed",
        finalOutput: delivered.finalContent,
        outputQuality: params.outputQuality,
        completedAt: new Date(),
      },
      $inc: { stageVersion: 1 },
      $push: {
        stateTransitions: {
          from: "Formatting",
          to: "Completed",
          at: new Date(),
          byAgent: "marketing-agent",
          correlationId: params.correlationId,
        },
      },
    },
  ).exec();

  await releaseUnusedBudgetAfterCostSummary({
    taskId: params.taskId,
    tenantId: params.tenantId,
    reservedCostUsd: params.reservedCostUsd,
    log: params.log,
  });
}

async function processTask(job: {
  data: SubmitJob;
  attemptsMade: number;
}): Promise<void> {
  const { taskId, tenantId, userId, correlationId } = job.data;

  const jobLog = createLogger({ taskId, correlationId, division: "Executive" });
  jobLog.info({ attemptsMade: job.attemptsMade }, "Task processor: starting");

  // ── 1. Load task ─────────────────────────────────────────────────────────────
  const task = await TaskEnvelopeModel.findOne({ taskId, tenantId })
    .lean()
    .exec();
  if (!task) {
    jobLog.error({}, "Task not found in MongoDB — skipping");
    return;
  }

  // ── 2. Cancellation check ─────────────────────────────────────────────────────
  if (task.cancellationRequested || task.currentStage === "Cancelled") {
    jobLog.info({}, "Task already cancelled — skipping");
    return;
  }

  // ── 3. Idempotency: skip if already beyond Submitted ─────────────────────────
  if (task.currentStage === "Formatting") {
    const draft = (
      task.intermediateOutputs.production as { draft?: string } | null
    )?.draft;
    if (draft === undefined || draft.trim().length === 0) {
      await markFailed(
        taskId,
        tenantId,
        correlationId,
        "Cannot complete best-effort task without production draft",
      );
      return;
    }

    const ac = new AbortController();
    await completeFormattingOnly({
      taskId,
      tenantId,
      userId,
      correlationId,
      executionPath: task.executionPath,
      prompt: task.originalRequest.prompt,
      draft,
      outputFormat: task.originalRequest.outputFormat,
      outputQuality: task.outputQuality ?? "best_effort",
      reservedCostUsd: task.budget.reservedUsd.toString(),
      signal: ac.signal,
      log: jobLog,
    });
    return;
  }

  if (task.currentStage !== "Submitted") {
    jobLog.warn(
      { currentStage: task.currentStage },
      "Task already processing — idempotent skip",
    );
    return;
  }

  // ── 4. Setup context + AbortController ───────────────────────────────────────
  const ac = new AbortController();
  const prompt = task.originalRequest.prompt;
  const outputFormat = task.originalRequest.outputFormat;
  const maxCostUsd = task.originalRequest.constraints.maxCostUsd.toString();
  const executionPath = task.executionPath;

  const ctx: AgentContext & { prompt: string; maxCostUsd: string } = {
    taskId,
    tenantId,
    userId,
    correlationId,
    executionPath,
    signal: ac.signal,
    prompt,
    maxCostUsd,
  };

  // ── 5. Transition: Submitted → Preparing ─────────────────────────────────────
  await transitionStage(
    taskId,
    tenantId,
    "Submitted",
    "Preparing",
    "task-processor",
    correlationId,
  );
  jobLog.info({}, "Stage: Preparing");

  // ── 6. HR SSC: model selection + escalation chain ────────────────────────────
  const tokens = estimateTokens(prompt);
  const pathSignals = classifyPath({ prompt }).signals;

  const hrResult = selectModelForTask(
    prompt,
    {
      hasCode: pathSignals.hasCode,
      hasResearch: pathSignals.hasResearch,
      tokenCount: tokens,
    },
    executionPath,
    task.originalRequest.constraints.preferredModelTier,
  );

  if (!hrResult.ok) {
    await markFailed(
      taskId,
      tenantId,
      correlationId,
      `HR SSC failed: ${hrResult.error.message}`,
    );
    return;
  }

  const { selectedModel, complexity, escalationChain } = hrResult.value;
  jobLog.info(
    {
      selectedModel,
      complexityScore: complexity.score,
      escalationSteps: escalationChain.entries.length,
    },
    "HR SSC: model selected",
  );

  // ── 7. Finance SSC: pre-approve + reserve budget ─────────────────────────────
  const complianceResult = await runComplianceValidation({
    prompt,
    executionPath,
    outputFormat,
  });

  if (!complianceResult.ok) {
    jobLog.warn(
      { err: complianceResult.error.message },
      "Compliance SSC blocked task before LLM invocation",
    );
    await markFailed(
      taskId,
      tenantId,
      correlationId,
      `Compliance blocked task: ${complianceResult.error.message}`,
    );
    return;
  }

  jobLog.info(
    { validatorsRun: complianceResult.value.validatorsRun },
    "Compliance SSC: task approved",
  );

  const financeDeps = { budgetModel: BudgetModel };

  // Convert escalation chain entries for Finance SSC
  const financeChain: Array<{
    attempt: number;
    model: string;
    maxCostUsd: string;
  }> = escalationChain.entries.map((e) => ({
    attempt: e.attempt,
    model: e.model,
    maxCostUsd: e.maxCostUsd,
  }));

  const preApproval = await preApproveEscalationChain(
    financeDeps,
    tenantId,
    financeChain,
  );
  if (!preApproval.ok) {
    await markFailed(
      taskId,
      tenantId,
      correlationId,
      `Finance pre-approval failed: ${preApproval.error.message}`,
    );
    return;
  }

  if (!preApproval.value.approved) {
    jobLog.warn(
      { maxAffordableAttempt: preApproval.value.maxAffordableAttempt },
      "Finance SSC: budget insufficient for full chain",
    );
    // Still try with affordable attempts
  }

  const reserveResult = await reserveBudgetAtomic(financeDeps, {
    taskId,
    tenantId,
    totalEstimatedCostUsd: escalationChain.totalMaxCostUsd,
    escalationChain: financeChain,
  });

  if (!reserveResult.ok) {
    jobLog.warn(
      { err: reserveResult.error.message },
      "Finance SSC: budget insufficient — entering AwaitingUserDecision",
    );
    await TaskEnvelopeModel.updateOne(
      { taskId, tenantId },
      {
        $set: {
          currentStage: "AwaitingUserDecision",
          pendingDecision: {
            reason: "budget_insufficient_for_escalation",
            attemptNumber: 1,
            bestEffortOutput: { available: false, qualityEstimate: 0 },
            escalationOption: {
              targetModel: selectedModel,
              additionalCostUsd: escalationChain.totalMaxCostUsd,
              available: false,
            },
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            defaultAction: "best_effort",
            notifiedAt: null,
          },
        },
        $inc: { stageVersion: 1 },
        $push: {
          stateTransitions: {
            from: "Preparing",
            to: "AwaitingUserDecision",
            at: new Date(),
            byAgent: "finance-ssc",
            correlationId,
          },
        },
      },
    ).exec();
    return;
  }

  // ── 8. Update routing in MongoDB ─────────────────────────────────────────────
  await TaskEnvelopeModel.updateOne(
    { taskId, tenantId },
    {
      $set: {
        routing: {
          selectedModel,
          escalationChain: financeChain.map((e) => ({
            attempt: e.attempt,
            model: e.model,
            maxCostUsd: e.maxCostUsd,
          })),
          complexityScore: complexity.score,
          pathType: executionPath,
          rationale: complexity.rationale,
          decidedBy: "hr-ssc",
          decidedAt: new Date(),
        },
        "budget.reservedUsd": escalationChain.totalMaxCostUsd,
      },
    },
  ).exec();

  // ── 9. Research phase (full path) — simplified placeholder ───────────────────
  let researchSummary: string | undefined;

  if (executionPath === "full") {
    await transitionStage(
      taskId,
      tenantId,
      "Preparing",
      "Researching",
      "task-processor",
      correlationId,
    );
    jobLog.info({}, "Stage: Researching (simplified placeholder)");

    // MVP: store a minimal research note; full implementation would call WebSearchWorker
    researchSummary = `Research context for: ${prompt.slice(0, 200)}`;
    await TaskEnvelopeModel.updateOne(
      { taskId, tenantId },
      {
        $set: {
          "intermediateOutputs.research": {
            summary: researchSummary,
            sources: [],
            confidence: 0.5,
          },
        },
      },
    ).exec();
  }

  // ── 10. Production loop with escalation ──────────────────────────────────────
  const escalationEntries: EscalationEntry[] = financeChain;

  await transitionStage(
    taskId,
    tenantId,
    executionPath === "full" ? "Researching" : "Preparing",
    "Producing",
    "task-processor",
    correlationId,
  );
  jobLog.info({}, "Stage: Producing");

  let productionDraft = "";
  let finalAttemptNumber = 1;
  let qaOutput: QaOutput | null = null;
  let qaPassedAt = -1;

  // Setup LLM registry (per-job, avoid sharing mutable state across parallel jobs)
  const registry = new ProviderRegistry();
  registry.register(new ClaudeProvider());
  registry.register(new GeminiProvider());

  const productionAgentId = newId(EntityPrefix.AGENT);

  for (
    let attempt = 1;
    attempt <= Math.min(escalationEntries.length, 3);
    attempt++
  ) {
    const attemptReason = attempt === 1 ? "initial" : "qa_escalation";
    const escalationEntry = escalationEntries[attempt - 1];

    if (!escalationEntry) break;

    const model = escalationEntry.model;

    jobLog.info(
      { attempt, model, attemptReason },
      "Production attempt starting",
    );

    // Create ChunkWorker with LLM call + cost recording
    const chunkWorker = new ChunkWorker(async ({ model: m, prompt: p }) => {
      const start = Date.now();
      const result = await registry.generate(m, {
        prompt: p,
        signal: ac.signal,
      });

      if (!result.ok) {
        throw result.error;
      }

      const durationMs = Date.now() - start;

      // Record cost analytics — CRITICAL: must not throw
      void recordLlmInvocation({
        tenantId,
        userId,
        taskId,
        division: "Production",
        agentId: productionAgentId,
        provider: result.value.modelUsed.includes("claude")
          ? "anthropic"
          : "google",
        model: result.value.modelUsed,
        tokensIn: result.value.tokensIn,
        tokensOut: result.value.tokensOut,
        cachedTokens: result.value.cachedTokens,
        costUsd: result.value.costUsd,
        retryAttempt: attempt - 1,
        isEscalated: attempt > 1,
        escalationTier:
          attempt === 1 ? "tier1" : attempt === 2 ? "tier2" : "tier3",
        durationMs,
      });

      return {
        content: result.value.text,
        tokensIn: result.value.tokensIn,
        tokensOut: result.value.tokensOut,
        cachedTokens: result.value.cachedTokens,
        costUsd: result.value.costUsd,
      };
    });

    const productionInput: ProductionInput = {
      prompt,
      researchSummary,
      escalationChain: escalationEntries,
      attemptNumber: attempt,
      attemptReason: attempt === 1 ? "initial" : "qa_escalation",
      outputFormat,
    };

    const productionCtx = { ...ctx, productionInput };
    const productionAgent = new ProductionAgent({
      chunkWorkerFactory: () => chunkWorker,
      maxConcurrency: 3,
    });

    const productionResult = await productionAgent.execute(productionCtx);

    if (!productionResult.ok) {
      jobLog.error(
        { attempt, err: productionResult.error.message },
        "Production attempt failed",
      );
      if (attempt >= Math.min(escalationEntries.length, 3)) {
        await markFailed(
          taskId,
          tenantId,
          correlationId,
          `Production failed after ${attempt} attempts: ${productionResult.error.message}`,
        );
        return;
      }
      continue;
    }

    const draft =
      (productionResult.value.result as { draft?: string }).draft ?? "";
    productionDraft = draft;
    finalAttemptNumber = attempt;

    // Save draft to intermediateOutputs
    await TaskEnvelopeModel.updateOne(
      { taskId, tenantId },
      {
        $set: {
          "intermediateOutputs.production": {
            draft,
            version: attempt,
            attemptNumber: attempt,
          },
        },
        $inc: { "retryCount.production": attempt > 1 ? 1 : 0 },
      },
    ).exec();

    jobLog.info(
      { attempt, draftLength: draft.length },
      "Production attempt succeeded",
    );

    // ── QA Gate ──────────────────────────────────────────────────────────────
    await transitionStage(
      taskId,
      tenantId,
      "Producing",
      "Reviewing",
      "task-processor",
      correlationId,
    );
    jobLog.info({ attempt }, "Stage: Reviewing (QA)");

    const qaAgent = new QaAgent({
      schemaValidator: new SchemaValidatorWorker(),
      completenessChecker: new CompletenessCheckerWorker(),
      relevanceChecker: new RelevanceCheckerWorker(),
    });

    const qaInput: QaInput = {
      draft,
      originalPrompt: prompt,
      outputFormat,
      attemptNumber: attempt,
      maxRetries: Math.min(escalationEntries.length, 3),
    };

    const qaCtx = { ...ctx, qaInput };
    const qaResult = await qaAgent.execute(qaCtx);

    if (!qaResult.ok) {
      // MaxRetriesExceededError from QA = we've exhausted retries
      jobLog.warn(
        { attempt, err: qaResult.error.message },
        "QA max retries exceeded",
      );
      await markFailed(taskId, tenantId, correlationId, qaResult.error.message);
      return;
    }

    const qa = qaResult.value.result as unknown as QaOutput;
    qaOutput = qa;

    jobLog.info(
      {
        attempt,
        passed: qa.passed,
        score: qa.overallScore,
        escalation: qa.escalationRecommended,
      },
      "QA gate result",
    );

    if (qa.passed) {
      qaPassedAt = attempt;
      break;
    }

    // QA failed — decide whether to escalate
    if (attempt < Math.min(escalationEntries.length, 3)) {
      jobLog.info(
        { attempt, nextAttempt: attempt + 1 },
        "QA failed — escalating to next model tier",
      );
      await transitionStage(
        taskId,
        tenantId,
        "Reviewing",
        "Producing",
        "task-processor",
        correlationId,
      );
      await TaskEnvelopeModel.updateOne(
        { taskId, tenantId },
        { $inc: { "retryCount.qa": 1 } },
      ).exec();
      continue;
    }

    // All escalation attempts exhausted — AwaitingUserDecision with best_effort
    const bestEffortDraft = draft;
    jobLog.warn(
      {},
      "QA failed all escalation attempts — entering AwaitingUserDecision",
    );

    await TaskEnvelopeModel.updateOne(
      { taskId, tenantId },
      {
        $set: {
          currentStage: "AwaitingUserDecision",
          pendingDecision: {
            reason: "budget_insufficient_for_escalation",
            attemptNumber: attempt,
            bestEffortOutput: {
              available: true,
              qualityEstimate: qa.overallScore,
            },
            escalationOption: {
              targetModel: "N/A",
              additionalCostUsd: "0",
              available: false,
            },
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            defaultAction: "best_effort",
            notifiedAt: null,
          },
          "intermediateOutputs.production": {
            draft: bestEffortDraft,
            version: attempt,
            attemptNumber: attempt,
          },
        },
        $inc: { stageVersion: 1 },
        $push: {
          stateTransitions: {
            from: "Reviewing",
            to: "AwaitingUserDecision",
            at: new Date(),
            byAgent: "qa-agent",
            correlationId,
          },
        },
      },
    ).exec();
    return;
  }

  if (qaPassedAt === -1 && qaOutput === null) {
    await markFailed(
      taskId,
      tenantId,
      correlationId,
      "Production loop completed without QA result",
    );
    return;
  }

  // ── 11. Marketing pipeline ────────────────────────────────────────────────────
  await transitionStage(
    taskId,
    tenantId,
    "Reviewing",
    "Formatting",
    "task-processor",
    correlationId,
  );
  jobLog.info({}, "Stage: Formatting (Marketing)");

  const outputQuality: "standard" | "best_effort" =
    qaPassedAt > 1 ? "best_effort" : "standard";

  const marketingInput: MarketingInput = {
    draft: productionDraft,
    originalPrompt: prompt,
    outputFormat,
    researchSources: undefined,
    outputQuality,
  };

  const marketingCtx = { ...ctx, marketingInput };
  const marketingAgent = new MarketingAgent({
    formatterWorker: new FormatterWorker(),
    citationWorker: new CitationWorker(),
    deliveryWorker: new DeliveryWorker(),
  });

  const marketingResult = await marketingAgent.execute(marketingCtx);

  if (!marketingResult.ok) {
    jobLog.error(
      { err: marketingResult.error.message },
      "Marketing pipeline failed",
    );
    await markFailed(
      taskId,
      tenantId,
      correlationId,
      `Marketing failed: ${marketingResult.error.message}`,
    );
    return;
  }

  const delivered = marketingResult.value.result as unknown as DeliveredOutput;

  // ── 12. Complete ─────────────────────────────────────────────────────────────
  await TaskEnvelopeModel.updateOne(
    { taskId, tenantId },
    {
      $set: {
        currentStage: "Completed",
        finalOutput: delivered.finalContent,
        outputQuality,
        completedAt: new Date(),
      },
      $inc: { stageVersion: 1 },
      $push: {
        stateTransitions: {
          from: "Formatting",
          to: "Completed",
          at: new Date(),
          byAgent: "marketing-agent",
          correlationId,
        },
      },
    },
  ).exec();

  jobLog.info(
    {
      outputQuality,
      finalAttemptNumber,
      contentLength: delivered.finalContent.length,
      wordCount: delivered.wordCount,
    },
    "Task completed successfully",
  );

  // ── 13. Release unused budget ─────────────────────────────────────────────────
  await releaseUnusedBudgetAfterCostSummary({
    taskId,
    tenantId,
    reservedCostUsd: escalationChain.totalMaxCostUsd,
    log: jobLog,
  });
}

// ─── Worker registration ─────────────────────────────────────────────────────

let _worker: ReturnType<typeof createWorker<SubmitJob, void>> | null = null;

/** Start the task processor BullMQ worker. Idempotent. */
export function startTaskProcessor(): void {
  if (_worker) return;

  _worker = createWorker<SubmitJob>(QUEUE_NAMES.CEO, (job) =>
    processTask({ data: job.data, attemptsMade: job.attemptsMade }),
  );

  log.info({}, "Task processor started (bureau.ceo queue)");
}

/** Stop the task processor worker gracefully. */
export async function stopTaskProcessor(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    log.info({}, "Task processor stopped");
  }
}
