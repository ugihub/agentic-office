/**
 * AwaitingUserDecision state tests.
 *
 * Verifies:
 * 1. State entered when BUDGET_INSUFFICIENT_FOR_ESCALATION event fired
 * 2. USER_DECISION best_effort → Formatting stage
 * 3. USER_DECISION cancel → Cancelled
 * 4. USER_DECISION add_budget → back to Producing
 * 5. CANCEL from any non-terminal state → Cancelled
 * 6. QA_FAILED with retry count < max → loops back to Producing
 * 7. MAX_RETRIES_EXCEEDED → Failed
 * 8. Fast path skips Researching
 */
import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { taskMachine } from "../../../packages/task-machine/src/machine.js";
import type { TaskContext } from "../../../packages/task-machine/src/machine.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_QA_RETRIES = 3;

function makeTaskContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    taskId: "task_test_001",
    tenantId: "tenant_test",
    userId: "user_001",
    correlationId: "corr_001",
    executionPath: "standard",
    selectedModel: "claude-haiku-4-5",
    escalationChain: [
      { attempt: 1, model: "claude-haiku-4-5", maxCostUsd: "0.10" },
      { attempt: 2, model: "claude-sonnet-4-6", maxCostUsd: "0.30" },
      { attempt: 3, model: "claude-opus-4-6", maxCostUsd: "0.50" },
    ],
    currentAttempt: 0,
    productionOutput: null,
    qaFailureReason: null,
    retryCount: { production: 0, qa: 0 },
    finalOutput: null,
    outputQuality: null,
    pendingDecision: null,
    error: null,
    ...overrides,
  };
}

function startTask(ctx: TaskContext) {
  const actor = createActor(taskMachine, { input: ctx });
  actor.start();
  return actor;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Task state machine", () => {
  describe("AwaitingUserDecision state", () => {
    it("enters AwaitingUserDecision on BUDGET_INSUFFICIENT_FOR_ESCALATION", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "SSC_READY" }); // → Preparing
      actor.send({ type: "SSC_READY" }); // → Researching (standard path)
      actor.send({ type: "RESEARCH_COMPLETE", summary: "research done" });
      // Now in Producing — fire budget insufficient
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      expect(actor.getSnapshot().value).toBe("AwaitingUserDecision");
    });

    it("best_effort → Formatting", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      actor.send({ type: "USER_DECISION", action: "best_effort" });
      expect(actor.getSnapshot().value).toBe("Formatting");
    });

    it("cancel → Cancelled", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      actor.send({ type: "USER_DECISION", action: "cancel" });
      expect(actor.getSnapshot().value).toBe("Cancelled");
    });

    it("add_budget → back to Producing", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      actor.send({ type: "USER_DECISION", action: "add_budget" });
      expect(actor.getSnapshot().value).toBe("Producing");
    });
  });

  describe("CANCEL from any stage", () => {
    it("cancels from Submitted", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "CANCEL" });
      expect(actor.getSnapshot().value).toBe("Cancelled");
    });

    it("cancels from Preparing", () => {
      const actor = startTask(makeTaskContext());
      actor.send({ type: "SSC_READY" }); // → Preparing
      actor.send({ type: "CANCEL" });
      expect(actor.getSnapshot().value).toBe("Cancelled");
    });

    it("cancels from Producing", () => {
      const actor = startTask(makeTaskContext({ executionPath: "fast" }));
      actor.send({ type: "SSC_READY" }); // → Preparing (fast path)
      actor.send({ type: "SSC_READY" }); // → Producing (fast path skips Research)
      actor.send({ type: "CANCEL" });
      expect(actor.getSnapshot().value).toBe("Cancelled");
    });
  });

  describe("QA retry logic", () => {
    it("QA_FAILED with canEscalate=true and retries remaining loops to Producing", () => {
      const actor = startTask(makeTaskContext({ executionPath: "fast" }));
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" }); // → Producing
      actor.send({ type: "PRODUCTION_COMPLETE", output: "draft output" }); // → Reviewing

      // First QA failure — should retry
      actor.send({
        type: "QA_FAILED",
        reason: "incomplete",
        canEscalate: true,
      });
      expect(actor.getSnapshot().value).toBe("Producing");
    });

    it("MAX_RETRIES_EXCEEDED → Failed", () => {
      const actor = startTask(makeTaskContext({ executionPath: "fast" }));
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "PRODUCTION_COMPLETE", output: "output" });
      actor.send({ type: "MAX_RETRIES_EXCEEDED" });

      expect(actor.getSnapshot().value).toBe("Failed");
    });
  });

  describe("Fast path", () => {
    it("fast path: Preparing → Producing (skips Researching)", () => {
      const actor = startTask(makeTaskContext({ executionPath: "fast" }));
      actor.send({ type: "SSC_READY" }); // → Preparing
      actor.send({ type: "SSC_READY" }); // → Producing (isResearchRequired=false for fast)

      expect(actor.getSnapshot().value).toBe("Producing");
    });
  });

  describe("Happy path", () => {
    it("full happy path: Submitted → Completed", () => {
      const actor = startTask(makeTaskContext({ executionPath: "fast" }));

      actor.send({ type: "SSC_READY" }); // Submitted → Preparing
      actor.send({ type: "SSC_READY" }); // Preparing → Producing (fast)
      actor.send({ type: "PRODUCTION_COMPLETE", output: "Great output" }); // → Reviewing
      actor.send({ type: "QA_PASSED" }); // → Formatting
      actor.send({
        type: "FORMATTING_COMPLETE",
        finalOutput: "Formatted output",
      }); // → Completed

      expect(actor.getSnapshot().value).toBe("Completed");
    });

    it("standard path includes Researching", () => {
      const actor = startTask(makeTaskContext({ executionPath: "standard" }));

      actor.send({ type: "SSC_READY" }); // → Preparing
      actor.send({ type: "SSC_READY" }); // → Researching (isResearchRequired=true)

      expect(actor.getSnapshot().value).toBe("Researching");
    });
  });
});
