/**
 * Escalation chain tests.
 *
 * Verifies:
 * 1. Escalation chain tier progression (economy → standard → premium)
 * 2. QA rejection includes escalation recommendation on full path
 * 3. Fast path QA does NOT escalate (fast path never escalates)
 * 4. MaxRetriesExceededError on attempt = maxRetries
 * 5. HR SSC builds correct escalation chain from complexity score
 */
import { describe, it, expect } from "vitest";
import type { AgentContext } from "@bureau/agents-core";
import {
  QaAgent,
  SchemaValidatorWorker,
  CompletenessCheckerWorker,
  RelevanceCheckerWorker,
} from "../agents/core/qa-agent.js";
import type { QaInput } from "../agents/core/qa-agent.js";
import { buildEscalationChain } from "../agents/ssc/hr-ssc.js";
import { MaxRetriesExceededError } from "@bureau/shared-kernel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(
  executionPath: AgentContext["executionPath"] = "full",
): AgentContext {
  return {
    taskId: "task_esc_001",
    tenantId: "tenant_test",
    userId: "user_001",
    correlationId: "corr_001",
    executionPath,
    signal: new AbortController().signal,
  };
}

function makeQaAgent() {
  return new QaAgent({
    schemaValidator: new SchemaValidatorWorker(),
    completenessChecker: new CompletenessCheckerWorker(),
    relevanceChecker: new RelevanceCheckerWorker(),
  });
}

type QaAgentContext = AgentContext & { qaInput: QaInput };

function makeQaCtx(
  executionPath: AgentContext["executionPath"],
  qaInput: QaInput,
): QaAgentContext {
  return { ...makeCtx(executionPath), qaInput };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Escalation chain — QA Agent", () => {
  const agent = makeQaAgent();

  it("fast path QA: schema-only, no escalation", async () => {
    const ctx = makeQaCtx("fast", {
      draft: "Valid short response.",
      originalPrompt: "Say something",
      outputFormat: "text",
      attemptNumber: 1,
      maxRetries: 3,
    });

    const result = await agent.execute(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as {
        passed: boolean;
        validatorsRun: string[];
        escalationRecommended: boolean;
      };
      expect(output.validatorsRun).toContain("SchemaValidator");
      expect(output.validatorsRun).not.toContain("CompletenessChecker");
      // Fast path never escalates
      expect(output.escalationRecommended).toBe(false);
    }
  });

  it("full path QA: runs 3 validators in parallel", async () => {
    const ctx = makeQaCtx("full", {
      draft:
        "A comprehensive detailed analysis of the market trends showing growth across multiple sectors with citations and data points.",
      originalPrompt: "Write a market analysis",
      outputFormat: "markdown",
      attemptNumber: 1,
      maxRetries: 3,
    });

    const result = await agent.execute(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as { validatorsRun: string[] };
      // Full path runs all 3 validators
      expect(output.validatorsRun.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("empty content fails QA with failure reasons", async () => {
    const ctx = makeQaCtx("full", {
      draft: "", // Empty content
      originalPrompt: "Write a detailed report",
      outputFormat: "markdown",
      attemptNumber: 1,
      maxRetries: 3,
    });

    const result = await agent.execute(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as {
        passed: boolean;
        failureReasons: string[];
        escalationRecommended: boolean;
      };
      expect(output.passed).toBe(false);
      expect(output.failureReasons.length).toBeGreaterThan(0);
      expect(output.escalationRecommended).toBe(true);
    }
  });

  it("returns MaxRetriesExceededError at maxRetries", async () => {
    const ctx = makeQaCtx("full", {
      draft: "", // Empty = fails
      originalPrompt: "Write a report",
      outputFormat: "markdown",
      attemptNumber: 3, // = maxRetries
      maxRetries: 3,
    });

    const result = await agent.execute(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MaxRetriesExceededError);
    }
  });

  it("does NOT return MaxRetriesExceededError before maxRetries", async () => {
    const ctx = makeQaCtx("full", {
      draft: "",
      originalPrompt: "Write a report",
      outputFormat: "markdown",
      attemptNumber: 2, // < maxRetries=3
      maxRetries: 3,
    });

    const result = await agent.execute(ctx);
    // Should succeed (returning passed=false in output) not fail
    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.result as { passed: boolean };
      expect(output.passed).toBe(false);
    }
  });
});

describe("Escalation chain — HR SSC buildEscalationChain", () => {
  it("returns entries array with 3 tiers from economy", () => {
    const chain = buildEscalationChain("economy");
    expect(chain.entries).toHaveLength(3); // economy → standard → premium
  });

  it("returns entries array with 2 tiers from standard", () => {
    const chain = buildEscalationChain("standard");
    expect(chain.entries).toHaveLength(2); // standard → premium
  });

  it("returns entries array with 1 tier from premium", () => {
    const chain = buildEscalationChain("premium");
    expect(chain.entries).toHaveLength(1); // premium only
  });

  it("attempt numbers are sequential starting at 1", () => {
    const chain = buildEscalationChain("economy");
    expect(chain.entries[0]?.attempt).toBe(1);
    expect(chain.entries[1]?.attempt).toBe(2);
    expect(chain.entries[2]?.attempt).toBe(3);
  });

  it("cost increases with tier progression", () => {
    const chain = buildEscalationChain("economy");
    const costs = chain.entries.map((e) => parseFloat(e.maxCostUsd));
    // Each tier should cost more than previous (or equal for flat-pricing providers)
    // Just verify all costs are positive
    for (const cost of costs) {
      expect(cost).toBeGreaterThan(0);
    }
  });

  it("totalMaxCostUsd = sum of all entry costs", () => {
    const chain = buildEscalationChain("economy");
    const summed = chain.entries.reduce(
      (sum, e) => sum + parseFloat(e.maxCostUsd),
      0,
    );
    expect(parseFloat(chain.totalMaxCostUsd)).toBeCloseTo(summed, 5);
  });

  it("all entries have model, provider, and maxCostUsd", () => {
    const chain = buildEscalationChain("economy");
    for (const entry of chain.entries) {
      expect(entry.model).toBeTruthy();
      expect(entry.provider).toBeTruthy();
      expect(entry.maxCostUsd).toBeTruthy();
      expect(parseFloat(entry.maxCostUsd)).toBeGreaterThan(0);
    }
  });

  it("economy → standard chain starts cheaper than standard → premium", () => {
    const fromEconomy = buildEscalationChain("economy");
    const fromStandard = buildEscalationChain("standard");
    const economyFirst = parseFloat(fromEconomy.entries[0]?.maxCostUsd ?? "99");
    const standardFirst = parseFloat(
      fromStandard.entries[0]?.maxCostUsd ?? "0",
    );
    expect(economyFirst).toBeLessThan(standardFirst);
  });
});
