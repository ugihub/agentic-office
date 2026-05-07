/**
 * Marketing Agent — sequential pipeline.
 *
 * Steps (must run in order):
 * 1. FormatterWorker   — apply output format, structure, polish
 * 2. CitationWorker    — inject source citations from research
 * 3. DeliveryWorker    — package final output for delivery
 *
 * Pattern: Pipeline (NOT scatter-gather — order matters).
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
  IWorkerAgent,
  AgentContext,
  HeadAgentOutput,
  WorkerOutput,
} from "@bureau/agents-core";
import { createLogger } from "@bureau/telemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketingInput {
  draft: string;
  originalPrompt: string;
  outputFormat: "markdown" | "json" | "text" | "html";
  researchSources?:
    | Array<{
        content: string;
        url?: string | undefined;
        score: number;
      }>
    | undefined;
  outputQuality: "best_effort" | "standard";
}

export interface FormattedOutput {
  content: string;
  format: string;
  wordCount: number;
  charCount: number;
}

export interface CitedOutput {
  content: string;
  citations: Array<{ index: number; url: string; text: string }>;
  hasCitations: boolean;
}

export interface DeliveredOutput {
  finalContent: string;
  outputFormat: string;
  outputQuality: "best_effort" | "standard";
  wordCount: number;
  charCount: number;
  citations: Array<{ index: number; url: string; text: string }>;
  generatedAt: string;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export class FormatterWorker implements IWorkerAgent {
  readonly workerId: string;
  readonly division = "Marketing" as const;

  constructor() {
    this.workerId = newId(EntityPrefix.WORKER);
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now();
    const marketingInput = input as unknown as MarketingInput;

    if (ctx.signal.aborted) {
      return err(new Error("Formatting cancelled"));
    }

    const formatted = formatContent(
      marketingInput.draft,
      marketingInput.outputFormat,
    );

    return ok({
      workerId: this.workerId,
      result: formatted as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    });
  }
}

export class CitationWorker implements IWorkerAgent {
  readonly workerId: string;
  readonly division = "Marketing" as const;

  constructor() {
    this.workerId = newId(EntityPrefix.WORKER);
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now();
    const { content, sources } = input as {
      content: string;
      sources?:
        | Array<{ url?: string | undefined; content: string; score: number }>
        | undefined;
    };

    if (ctx.signal.aborted) {
      return err(new Error("Citation injection cancelled"));
    }

    const cited = injectCitations(content, sources ?? []);

    return ok({
      workerId: this.workerId,
      result: cited as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    });
  }
}

export class DeliveryWorker implements IWorkerAgent {
  readonly workerId: string;
  readonly division = "Marketing" as const;

  constructor(
    private readonly deliverFn?: (output: DeliveredOutput) => Promise<void>,
  ) {
    this.workerId = newId(EntityPrefix.WORKER);
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now();
    const deliveryInput = input as unknown as {
      cited: CitedOutput;
      formatted: FormattedOutput;
      outputQuality: "best_effort" | "standard";
    };

    if (ctx.signal.aborted) {
      return err(new Error("Delivery cancelled"));
    }

    const delivered: DeliveredOutput = {
      finalContent: deliveryInput.cited.content,
      outputFormat: deliveryInput.formatted.format,
      outputQuality: deliveryInput.outputQuality,
      wordCount: deliveryInput.formatted.wordCount,
      charCount: deliveryInput.formatted.charCount,
      citations: deliveryInput.cited.citations,
      generatedAt: new Date().toISOString(),
    };

    // Call optional delivery hook (webhook, email, SSE event)
    if (this.deliverFn) {
      try {
        await this.deliverFn(delivered);
      } catch (e) {
        // Delivery hook failure is non-fatal — output is still persisted to MongoDB
        const msg = e instanceof Error ? e.message : String(e);
        // Use a simple log — we don't want to fail the whole pipeline
        console.error(
          { err: msg, taskId: ctx.taskId },
          "Delivery hook failed (non-fatal)",
        );
      }
    }

    return ok({
      workerId: this.workerId,
      result: delivered as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    });
  }
}

// ─── MarketingAgent ───────────────────────────────────────────────────────────

export interface MarketingAgentDeps {
  formatterWorker: FormatterWorker;
  citationWorker: CitationWorker;
  deliveryWorker: DeliveryWorker;
}

export class MarketingAgent implements IHeadAgent {
  readonly division = "Marketing" as const;
  readonly agentId: string;

  constructor(private readonly deps: MarketingAgentDeps) {
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
      return err(new Error("Marketing cancelled before start"));
    }

    const mCtx = ctx as AgentContext & { marketingInput?: MarketingInput };
    if (!mCtx.marketingInput) {
      return err(new Error("MarketingInput not found in AgentContext"));
    }

    const { marketingInput } = mCtx;
    const start = Date.now();

    log.info(
      {
        outputFormat: marketingInput.outputFormat,
        outputQuality: marketingInput.outputQuality,
        hasSources: (marketingInput.researchSources?.length ?? 0) > 0,
      },
      "Marketing pipeline starting",
    );

    // Step 1: Format
    const formatResult = await this.deps.formatterWorker.execute(
      ctx,
      marketingInput as unknown as Record<string, unknown>,
    );
    if (!formatResult.ok) {
      log.error({ err: formatResult.error.message }, "Formatting failed");
      return err(formatResult.error);
    }

    if (ctx.signal.aborted) {
      return err(new Error("Marketing cancelled after formatting"));
    }

    const formatted = formatResult.value.result as unknown as FormattedOutput;

    // Step 2: Inject citations
    const citationResult = await this.deps.citationWorker.execute(ctx, {
      content: formatted.content,
      sources: marketingInput.researchSources,
    });

    if (!citationResult.ok) {
      log.warn(
        { err: citationResult.error.message },
        "Citation injection failed, using uncited content",
      );
      // Non-fatal: continue with uncited content
    }

    if (ctx.signal.aborted) {
      return err(new Error("Marketing cancelled after citation"));
    }

    const cited: CitedOutput = citationResult.ok
      ? (citationResult.value.result as unknown as CitedOutput)
      : {
          content: formatted.content,
          citations: [],
          hasCitations: false,
        };

    // Step 3: Deliver
    const deliveryResult = await this.deps.deliveryWorker.execute(ctx, {
      cited,
      formatted,
      outputQuality: marketingInput.outputQuality,
    });

    if (!deliveryResult.ok) {
      log.error({ err: deliveryResult.error.message }, "Delivery failed");
      return err(deliveryResult.error);
    }

    const delivered = deliveryResult.value.result as unknown as DeliveredOutput;
    const durationMs = Date.now() - start;

    log.info(
      {
        wordCount: delivered.wordCount,
        charCount: delivered.charCount,
        citationCount: delivered.citations.length,
        outputQuality: delivered.outputQuality,
        durationMs,
      },
      "Marketing pipeline completed",
    );

    return ok({
      division: this.division,
      result: delivered as unknown as Record<string, unknown>,
      tokensConsumed: 0, // Marketing doesn't call LLM
      durationMs,
      workerCount: 3,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatContent(
  draft: string,
  format: MarketingInput["outputFormat"],
): FormattedOutput {
  let content = draft.trim();

  if (format === "markdown") {
    // Ensure content starts with a heading if it doesn't have one
    if (!content.startsWith("#")) {
      content = `## Output\n\n${content}`;
    }
    // Normalize multiple blank lines
    content = content.replace(/\n{3,}/g, "\n\n");
  }

  if (format === "text") {
    // Strip any markdown artifacts
    content = content
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
  }

  const words = content.split(/\s+/).filter((w) => w.length > 0);

  return {
    content,
    format,
    wordCount: words.length,
    charCount: content.length,
  };
}

function injectCitations(
  content: string,
  sources: Array<{ url?: string | undefined; content: string; score: number }>,
): CitedOutput {
  const urlSources = sources.filter(
    (s): s is typeof s & { url: string } => !!s.url,
  );

  if (urlSources.length === 0) {
    return {
      content,
      citations: [],
      hasCitations: false,
    };
  }

  const citations = urlSources.slice(0, 5).map((s, i) => ({
    index: i + 1,
    url: s.url,
    text: s.content.slice(0, 100),
  }));

  // Append citations section for markdown
  const citationSection =
    "\n\n---\n\n**Sources:**\n" +
    citations.map((c) => `${c.index}. [${c.text}...](${c.url})`).join("\n");

  return {
    content: content + citationSection,
    citations,
    hasCitations: true,
  };
}
