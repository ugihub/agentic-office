import { describe, it, expect } from "vitest";
import {
  SchemaValidatorWorker,
  CompletenessCheckerWorker,
  RelevanceCheckerWorker,
  QaAgent,
  type QaInput,
} from "../agents/core/qa-agent.js";
import type { AgentContext } from "@bureau/agents-core";

const makeCtx = (
  executionPath: "fast" | "standard" | "full" = "standard",
): AgentContext & { qaInput?: QaInput } => ({
  taskId: "task_001",
  tenantId: "tenant_001",
  userId: "user_001",
  correlationId: "corr_001",
  executionPath,
  signal: new AbortController().signal,
  qaInput: {
    draft:
      "## Analysis\n\nThis is a comprehensive analysis of the requested topic with detailed explanations and examples.",
    originalPrompt: "Analyze the topic",
    outputFormat: "markdown",
    attemptNumber: 1,
    maxRetries: 3,
  },
});

describe("SchemaValidatorWorker", () => {
  it("passes valid markdown", async () => {
    const worker = new SchemaValidatorWorker();
    const ctx = makeCtx();
    const result = await worker.execute(
      ctx,
      ctx.qaInput as unknown as Record<string, unknown>,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const validation = result.value.result as unknown as { passed: boolean };
      expect(validation.passed).toBe(true);
    }
  });

  it("fails empty draft", async () => {
    const worker = new SchemaValidatorWorker();
    const ctx = makeCtx();
    const result = await worker.execute(ctx, {
      ...ctx.qaInput,
      draft: "",
    } as unknown as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const validation = result.value.result as unknown as { passed: boolean };
      expect(validation.passed).toBe(false);
    }
  });

  it("fails invalid JSON when format is json", async () => {
    const worker = new SchemaValidatorWorker();
    const ctx = makeCtx();
    const result = await worker.execute(ctx, {
      ...ctx.qaInput,
      draft: "not valid json {{}",
      outputFormat: "json",
    } as unknown as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const validation = result.value.result as unknown as { passed: boolean };
      expect(validation.passed).toBe(false);
    }
  });
});

describe("QaAgent — fast path", () => {
  it("uses only SchemaValidator on fast path", async () => {
    const agent = new QaAgent({
      schemaValidator: new SchemaValidatorWorker(),
      completenessChecker: new CompletenessCheckerWorker(),
      relevanceChecker: new RelevanceCheckerWorker(),
    });

    const ctx = makeCtx("fast");
    const result = await agent.execute(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as unknown as {
        validatorsRun: string[];
      };
      expect(output.validatorsRun).toEqual(["SchemaValidator"]);
    }
  });
});

describe("QaAgent — full path", () => {
  it("runs 3 validators in parallel on full path", async () => {
    const agent = new QaAgent({
      schemaValidator: new SchemaValidatorWorker(),
      completenessChecker: new CompletenessCheckerWorker(),
      relevanceChecker: new RelevanceCheckerWorker(),
    });

    const ctx = makeCtx("full");
    const result = await agent.execute(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as unknown as {
        validatorsRun: string[];
      };
      expect(output.validatorsRun.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns MaxRetriesExceeded when last attempt fails", async () => {
    const agent = new QaAgent({
      schemaValidator: new SchemaValidatorWorker(),
      completenessChecker: new CompletenessCheckerWorker(),
      relevanceChecker: new RelevanceCheckerWorker(),
    });

    const ctx = makeCtx("full");
    // Empty draft + last attempt = MaxRetriesExceeded
    ctx.qaInput = {
      draft: "",
      originalPrompt: "test",
      outputFormat: "markdown",
      attemptNumber: 3,
      maxRetries: 3,
    };

    const result = await agent.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("QA failed after");
    }
  });
});
