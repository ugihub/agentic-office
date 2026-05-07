/**
 * Production Agent — LLM content generation with escalation chain.
 *
 * Pattern: Pool + Semaphore, ChunkWorker per section.
 * Escalation: Attempt 1 uses escalationChain[0], Attempt 2 uses [1], etc.
 *
 * CRITICAL: Records llmInvoked=false before LLM call, true after.
 * This ensures cost_analytics is accurate even if the call fails mid-way.
 *
 * attemptReason:
 * - 'initial'        — first attempt
 * - 'qa_escalation'  — QA rejected, escalating to next model tier
 * - 'stall_requeue'  — BullMQ stalled detection requeued this job
 * - 'user_retry'     — user explicitly requested retry
 */
import pLimit from "p-limit";
import {
  type Result,
  ok,
  err,
  newId,
  EntityPrefix,
} from "@bureau/shared-kernel";
import { MaxRetriesExceededError } from "@bureau/shared-kernel";
import type {
  IHeadAgent,
  IWorkerAgent,
  AgentContext,
  HeadAgentOutput,
  WorkerOutput,
} from "@bureau/agents-core";
import { createLogger } from "@bureau/telemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttemptReason =
  | "initial"
  | "qa_escalation"
  | "stall_requeue"
  | "user_retry";

export interface EscalationEntry {
  attempt: number;
  model: string;
  maxCostUsd: string;
}

export interface ChunkInput {
  chunkId: string;
  content: string;
  instructions: string;
  model: string;
  attemptNumber: number;
  attemptReason: AttemptReason;
}

export interface ChunkOutput {
  chunkId: string;
  generatedContent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  costUsd: string;
  attemptReason: AttemptReason;
  llmInvoked: boolean;
}

export interface ProductionInput {
  prompt: string;
  researchSummary?: string | undefined;
  escalationChain: EscalationEntry[];
  attemptNumber: number;
  attemptReason: AttemptReason;
  outputFormat: "markdown" | "json" | "text" | "html";
}

// ─── ChunkWorker ──────────────────────────────────────────────────────────────

export class ChunkWorker implements IWorkerAgent {
  readonly workerId: string;
  readonly division = "Production" as const;

  constructor(
    private readonly llmCallFn: (params: {
      model: string;
      prompt: string;
      maxTokens?: number | undefined;
    }) => Promise<{
      content: string;
      tokensIn: number;
      tokensOut: number;
      cachedTokens: number;
      costUsd: string;
    }>,
    private readonly recordCostFn?:
      | ((record: ChunkOutput) => Promise<void>)
      | undefined,
  ) {
    this.workerId = newId(EntityPrefix.WORKER);
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now();
    const chunkInput = input as unknown as ChunkInput;

    if (ctx.signal.aborted) {
      return err(new Error(`ChunkWorker ${chunkInput.chunkId} cancelled`));
    }

    // CRITICAL: Mark llmInvoked=false BEFORE the call
    // This ensures cost tracking even if call throws
    let llmInvoked = false;

    try {
      // Pre-call: record intent (llmInvoked=false)
      const preRecord: ChunkOutput = {
        chunkId: chunkInput.chunkId,
        generatedContent: "",
        model: chunkInput.model,
        tokensIn: 0,
        tokensOut: 0,
        cachedTokens: 0,
        costUsd: "0",
        attemptReason: chunkInput.attemptReason,
        llmInvoked: false,
      };
      await this.recordCostFn?.(preRecord);

      // The actual LLM call
      llmInvoked = true;
      const llmResult = await this.llmCallFn({
        model: chunkInput.model,
        prompt: `${chunkInput.instructions}\n\n${chunkInput.content}`,
      });

      const chunkOutput: ChunkOutput = {
        chunkId: chunkInput.chunkId,
        generatedContent: llmResult.content,
        model: chunkInput.model,
        tokensIn: llmResult.tokensIn,
        tokensOut: llmResult.tokensOut,
        cachedTokens: llmResult.cachedTokens,
        costUsd: llmResult.costUsd,
        attemptReason: chunkInput.attemptReason,
        llmInvoked: true,
      };

      // Post-call: record actual cost
      await this.recordCostFn?.(chunkOutput);

      return ok({
        workerId: this.workerId,
        result: chunkOutput as unknown as Record<string, unknown>,
        llmInvoked: true,
        tokensIn: llmResult.tokensIn,
        tokensOut: llmResult.tokensOut,
        cachedTokens: llmResult.cachedTokens,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      // If LLM was invoked but threw, still record the attempt
      if (llmInvoked && this.recordCostFn) {
        await this.recordCostFn({
          chunkId: chunkInput.chunkId,
          generatedContent: "",
          model: chunkInput.model,
          tokensIn: 0,
          tokensOut: 0,
          cachedTokens: 0,
          costUsd: "0",
          attemptReason: chunkInput.attemptReason,
          llmInvoked: true,
        }).catch(() => {
          // Cost recording failure must never propagate
        });
      }

      return err(error);
    }
  }
}

// ─── ProductionAgent ──────────────────────────────────────────────────────────

export interface ProductionAgentDeps {
  chunkWorkerFactory: (model: string) => ChunkWorker;
  /** Max parallel chunks (default: 3) */
  maxConcurrency?: number | undefined;
  /** Called when escalation is needed */
  onEscalationNeeded?:
    | ((taskId: string, attemptNumber: number) => Promise<void>)
    | undefined;
}

export class ProductionAgent implements IHeadAgent {
  readonly division = "Production" as const;
  readonly agentId: string;

  constructor(private readonly deps: ProductionAgentDeps) {
    this.agentId = newId(EntityPrefix.AGENT);
  }

  async execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>> {
    const log = createLogger({
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      division: this.division,
      agentId: this.agentId,
    });

    if (ctx.signal.aborted) {
      return err(new Error("Production cancelled before start"));
    }

    // Extract production input from context
    const productionInput = (
      ctx as AgentContext & { productionInput?: ProductionInput }
    ).productionInput;

    if (!productionInput) {
      return err(new Error("ProductionInput not found in AgentContext"));
    }

    const { escalationChain, attemptNumber, attemptReason } = productionInput;

    // Select model for this attempt
    const escalationEntry = escalationChain[attemptNumber - 1];
    if (!escalationEntry) {
      return err(
        new MaxRetriesExceededError(
          ctx.taskId,
          "Production",
          escalationChain.length,
        ),
      );
    }

    const { model } = escalationEntry;

    log.info(
      {
        model,
        attemptNumber,
        attemptReason,
        executionPath: ctx.executionPath,
      },
      "Production starting",
    );

    const start = Date.now();

    // Split prompt into chunks for parallel processing
    const chunks = chunkPrompt(
      productionInput.prompt,
      productionInput.researchSummary,
    );
    const limit = pLimit(this.deps.maxConcurrency ?? 3);

    const chunkWorker = this.deps.chunkWorkerFactory(model);

    const chunkResults = await Promise.all(
      chunks.map((chunk, index) =>
        limit(() => {
          if (ctx.signal.aborted) {
            return Promise.resolve(
              err(
                new Error(`Production cancelled during chunk ${index}`),
              ) as Result<WorkerOutput, Error>,
            );
          }

          return chunkWorker.execute(ctx, {
            chunkId: `chunk_${index + 1}`,
            content: chunk,
            instructions: buildProductionInstructions(productionInput),
            model,
            attemptNumber,
            attemptReason,
          } satisfies ChunkInput);
        }),
      ),
    );

    // Check for failures
    const failures = chunkResults.filter((r) => !r.ok);
    if (failures.length > 0) {
      const firstError = failures[0]!;
      if (!firstError.ok) {
        log.error(
          {
            failureCount: failures.length,
            chunkCount: chunks.length,
            err: firstError.error.message,
          },
          "Production chunk failures",
        );
        return err(firstError.error);
      }
    }

    // Aggregate chunk outputs
    const successfulChunks = chunkResults
      .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      .map((r) => r.value.result as unknown as ChunkOutput);

    const aggregatedContent = successfulChunks
      .map((c) => c.generatedContent)
      .join("\n\n");

    const totalTokensIn = successfulChunks.reduce(
      (sum, c) => sum + c.tokensIn,
      0,
    );
    const totalTokensOut = successfulChunks.reduce(
      (sum, c) => sum + c.tokensOut,
      0,
    );

    const durationMs = Date.now() - start;

    log.info(
      {
        chunkCount: successfulChunks.length,
        totalTokensIn,
        totalTokensOut,
        durationMs,
        model,
      },
      "Production completed",
    );

    return ok({
      division: this.division,
      result: {
        draft: aggregatedContent,
        version: attemptNumber,
        attemptNumber,
        attemptReason,
        model,
        chunkCount: successfulChunks.length,
      },
      tokensConsumed: totalTokensIn + totalTokensOut,
      durationMs,
      workerCount: chunks.length,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Split long prompts into chunks for parallel processing */
function chunkPrompt(
  prompt: string,
  researchSummary?: string | undefined,
): string[] {
  const fullPrompt = researchSummary
    ? `Research context:\n${researchSummary}\n\nTask:\n${prompt}`
    : prompt;

  // For prompts under 2000 chars, single chunk
  if (fullPrompt.length < 2000) {
    return [fullPrompt];
  }

  // Split into ~2000 char chunks at paragraph boundaries
  const paragraphs = fullPrompt.split("\n\n");
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > 2000 && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [fullPrompt];
}

function buildProductionInstructions(input: ProductionInput): string {
  const formatInstructions: Record<ProductionInput["outputFormat"], string> = {
    markdown: "Output your response in well-structured Markdown format.",
    json: "Output your response as valid JSON only, no other text.",
    text: "Output plain text only, no markup or formatting.",
    html: "Output well-formed HTML only.",
  };

  return [
    "You are a professional content producer. Generate high-quality output for the following task.",
    formatInstructions[input.outputFormat],
    "Be comprehensive, accurate, and directly address the request.",
  ].join("\n");
}
