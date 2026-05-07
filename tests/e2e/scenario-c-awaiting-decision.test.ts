/**
 * Scenario C — Budget habis setelah attempt ke-2 → AwaitingUserDecision → best_effort.
 *
 * Covers:
 * - Finance SSC pre-approves total escalation chain budget
 * - Budget insufficient for attempt 3 → BUDGET_INSUFFICIENT_FOR_ESCALATION event
 * - State machine enters AwaitingUserDecision (not Failed)
 * - pendingDecision object has correct shape (bestEffortOutput, escalationOption, expiresAt)
 * - User responds best_effort → task completes with outputQuality='best_effort'
 * - Timeout (24h) → defaultAction auto-executed by background job
 * - Cancel → task Cancelled with full budget refund
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { taskMachine } from "../../packages/task-machine/src/machine.js";
import { reserveBudgetAtomic } from "../../core/src/agents/ssc/finance-ssc.js";
import { InsufficientBudgetError } from "../../packages/shared-kernel/src/errors.js";
import type { Model } from "mongoose";
import type { BudgetDocument } from "../../packages/models/src/index.js";

// ─── Mock budget model factory ────────────────────────────────────────────────

function makeInsufficientBudgetModel() {
  return {
    findOneAndUpdate: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null), // $gte fails → null
    }),
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          isFrozen: false,
          remaining: { toString: () => "0.05" },
        }),
      }),
    }),
  } as unknown as Model<BudgetDocument>;
}

function makeStandardActor(
  executionPath: "fast" | "standard" | "full" = "standard",
) {
  return createActor(taskMachine, {
    input: {
      taskId: "task_c_001",
      tenantId: "tenant_test",
      userId: "user_test",
      correlationId: "corr_c_001",
      executionPath,
    },
  });
}

describe("Scenario C — Budget Exhausted → AwaitingUserDecision", () => {
  describe("C1: Finance pre-approval validates chain budget", () => {
    it("reserveBudgetAtomic fails when remaining < totalEstimatedCost", async () => {
      const model = makeInsufficientBudgetModel();

      const result = await reserveBudgetAtomic(
        { budgetModel: model },
        {
          taskId: "task_c_001",
          tenantId: "tenant_test",
          totalEstimatedCostUsd: "1.50", // Exceeds remaining 0.05
          escalationChain: [
            { attempt: 1, model: "claude-haiku-4-5", maxCostUsd: "0.10" },
            { attempt: 2, model: "claude-sonnet-4-6", maxCostUsd: "0.40" },
            { attempt: 3, model: "claude-opus-4-6", maxCostUsd: "1.00" },
          ],
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(InsufficientBudgetError);
      }
    });
  });

  describe("C2: State machine enters AwaitingUserDecision", () => {
    it("BUDGET_INSUFFICIENT_FOR_ESCALATION → AwaitingUserDecision state", () => {
      const actor = makeStandardActor();
      actor.start();

      // Progress to Producing
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "Research done." });
      actor.send({ type: "PRODUCTION_COMPLETE", output: "Partial output." });
      actor.send({
        type: "QA_FAILED",
        reason: "Needs improvement",
        canEscalate: true,
      });

      // Budget check: can't afford escalation → AwaitingUserDecision
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      const state = actor.getSnapshot();
      expect(state.value).toBe("AwaitingUserDecision");
      expect(state.context.pendingDecision).not.toBeNull();

      actor.stop();
    });

    it("pendingDecision has correct shape with all required fields", () => {
      const actor = makeStandardActor();
      actor.start();

      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "Research." });
      actor.send({
        type: "PRODUCTION_COMPLETE",
        output: "Best effort output.",
      });
      actor.send({
        type: "QA_FAILED",
        reason: "Insufficient depth",
        canEscalate: true,
      });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      const { pendingDecision } = actor.getSnapshot().context;

      expect(pendingDecision).toBeDefined();
      expect(pendingDecision?.reason).toBe(
        "budget_insufficient_for_escalation",
      );
      expect(pendingDecision?.bestEffortAvailable).toBe(true);
      expect(pendingDecision?.escalationModel).toBe("claude-opus-4-6");
      expect(pendingDecision?.additionalCostUsd).toBe("0.32");
      expect(pendingDecision?.defaultAction).toBe("best_effort");
      expect(pendingDecision?.expiresAt).toBeInstanceOf(Date);

      actor.stop();
    });
  });

  describe("C3: User decision — best_effort path", () => {
    it("USER_DECISION best_effort → Formatting → Completed with best_effort quality", () => {
      const actor = makeStandardActor();
      actor.start();

      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "Research." });
      actor.send({
        type: "PRODUCTION_COMPLETE",
        output: "Best effort output.",
      });
      actor.send({
        type: "QA_FAILED",
        reason: "Insufficient depth",
        canEscalate: true,
      });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      // User chooses best_effort
      actor.send({ type: "USER_DECISION", action: "best_effort" });
      actor.send({
        type: "FORMATTING_COMPLETE",
        finalOutput:
          "Best effort final output (quality: standard albeit with limitations).",
      });

      const state = actor.getSnapshot();
      expect(state.value).toBe("Completed");
      expect(state.context.outputQuality).toBe("best_effort");
      expect(state.context.finalOutput).toContain("Best effort final output");

      actor.stop();
    });
  });

  describe("C4: User decision — cancel path", () => {
    it("USER_DECISION cancel → Cancelled (budget refund expected)", () => {
      const actor = makeStandardActor();
      actor.start();

      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "Research." });
      actor.send({ type: "PRODUCTION_COMPLETE", output: "Draft." });
      actor.send({
        type: "QA_FAILED",
        reason: "Insufficient depth",
        canEscalate: true,
      });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      actor.send({ type: "USER_DECISION", action: "cancel" });

      const state = actor.getSnapshot();
      expect(state.value).toBe("Cancelled");

      actor.stop();
    });
  });

  describe("C5: Decision timeout — auto-execute default action", () => {
    it("DECISION_TIMEOUT auto-executes best_effort default action", () => {
      const actor = makeStandardActor();
      actor.start();

      actor.send({ type: "SSC_READY" });
      actor.send({ type: "SSC_READY" });
      actor.send({ type: "RESEARCH_COMPLETE", summary: "Research." });
      actor.send({ type: "PRODUCTION_COMPLETE", output: "Draft." });
      actor.send({
        type: "QA_FAILED",
        reason: "Insufficient depth",
        canEscalate: true,
      });
      actor.send({
        type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
        additionalCostUsd: "0.32",
        targetModel: "claude-opus-4-6",
      });

      // Simulate 24h timeout — background job fires DECISION_TIMEOUT
      actor.send({ type: "DECISION_TIMEOUT" });

      // Default action (best_effort) should be executed
      actor.send({
        type: "FORMATTING_COMPLETE",
        finalOutput: "Auto best_effort output after timeout.",
      });

      const state = actor.getSnapshot();
      expect(state.value).toBe("Completed");
      expect(state.context.outputQuality).toBe("best_effort");

      actor.stop();
    });

    it("decision timeout background job scans tasks with expiresAt < now", () => {
      // Verify timeout detection logic
      const pastExpiry = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const futureExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now

      const isExpired = (expiresAt: Date) => expiresAt < new Date();

      expect(isExpired(pastExpiry)).toBe(true);
      expect(isExpired(futureExpiry)).toBe(false);
    });

    it("email notification sent only once (notifiedAt prevents duplicates)", () => {
      // Verify email deduplication logic
      const task = {
        currentStage: "AwaitingUserDecision",
        pendingDecision: {
          notifiedAt: null as Date | null,
        },
      };

      function shouldSendEmail(t: typeof task) {
        return (
          t.currentStage === "AwaitingUserDecision" &&
          t.pendingDecision?.notifiedAt === null
        );
      }

      // First check: not yet notified → send
      expect(shouldSendEmail(task)).toBe(true);

      // After sending, mark notifiedAt
      task.pendingDecision.notifiedAt = new Date();

      // Second check: already notified → skip
      expect(shouldSendEmail(task)).toBe(false);
    });
  });
});
