import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { taskMachine } from "../machine.js";

function makeContext() {
  return {
    taskId: "task_01TEST",
    tenantId: "tenant_001",
    userId: "user_123",
    correlationId: "corr_001",
    executionPath: "standard" as const,
    selectedModel: "claude-sonnet-4-6",
    escalationChain: [
      { attempt: 1, model: "claude-haiku-4-5", maxCostUsd: "0.10" },
      { attempt: 2, model: "claude-sonnet-4-6", maxCostUsd: "0.30" },
    ],
    currentAttempt: 0,
    productionOutput: null,
    qaFailureReason: null,
    retryCount: { production: 0, qa: 0 },
    finalOutput: null,
    outputQuality: null,
    pendingDecision: null,
    error: null,
  };
}

describe("Task State Machine", () => {
  it("starts in Submitted state", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    expect(actor.getSnapshot().value).toBe("Submitted");
    actor.stop();
  });

  it("transitions Submitted → Preparing on SSC_READY", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    expect(actor.getSnapshot().value).toBe("Preparing");
    actor.stop();
  });

  it("transitions Preparing → Researching for standard path", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "SSC_READY" }); // Preparing → Researching
    expect(actor.getSnapshot().value).toBe("Researching");
    actor.stop();
  });

  it("transitions Preparing → Producing for fast path", () => {
    const ctx = { ...makeContext(), executionPath: "fast" as const };
    const actor = createActor(taskMachine, { input: ctx });
    actor.start();
    actor.send({ type: "SSC_READY" }); // Submitted → Preparing
    actor.send({ type: "SSC_READY" }); // Preparing → Producing (skip Researching)
    expect(actor.getSnapshot().value).toBe("Producing");
    actor.stop();
  });

  it("completes happy path", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "RESEARCH_COMPLETE", summary: "research done" });
    actor.send({ type: "PRODUCTION_COMPLETE", output: "draft output" });
    actor.send({ type: "QA_PASSED" });
    actor.send({ type: "FORMATTING_COMPLETE", finalOutput: "final output" });
    expect(actor.getSnapshot().value).toBe("Completed");
    expect(actor.getSnapshot().context.finalOutput).toBe("final output");
    expect(actor.getSnapshot().context.outputQuality).toBe("standard");
    actor.stop();
  });

  it("enters AwaitingUserDecision on budget insufficient", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
    actor.send({
      type: "BUDGET_INSUFFICIENT_FOR_ESCALATION",
      additionalCostUsd: "0.32",
      targetModel: "claude-opus-4-6",
    });
    expect(actor.getSnapshot().value).toBe("AwaitingUserDecision");
    expect(actor.getSnapshot().context.pendingDecision).not.toBeNull();
    actor.stop();
  });

  it("resolves AwaitingUserDecision with best_effort → Formatting", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
    actor.send({ type: "PRODUCTION_COMPLETE", output: "draft" });
    actor.send({
      type: "QA_FAILED",
      reason: "quality low",
      canEscalate: false,
    });
    // Can't retry (0 < 3 retries) → re-enters Producing
    expect(actor.getSnapshot().value).toBe("Producing");
    actor.stop();
  });

  it("cancels from any active state", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    expect(actor.getSnapshot().value).toBe("Preparing");
    actor.send({ type: "CANCEL" });
    expect(actor.getSnapshot().value).toBe("Cancelled");
    actor.stop();
  });

  it("fails on max retries exceeded", () => {
    const actor = createActor(taskMachine, { input: makeContext() });
    actor.start();
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "SSC_READY" });
    actor.send({ type: "RESEARCH_COMPLETE", summary: "done" });
    actor.send({ type: "PRODUCTION_COMPLETE", output: "draft" });
    // QA fails 3 times (MAX_QA_RETRIES = 3)
    actor.send({ type: "QA_FAILED", reason: "fail 1", canEscalate: false });
    actor.send({ type: "PRODUCTION_COMPLETE", output: "draft2" });
    actor.send({ type: "QA_FAILED", reason: "fail 2", canEscalate: false });
    actor.send({ type: "PRODUCTION_COMPLETE", output: "draft3" });
    actor.send({ type: "QA_FAILED", reason: "fail 3", canEscalate: false });
    // Should now be in Failed (3 retries exhausted)
    expect(actor.getSnapshot().value).toBe("Failed");
    actor.stop();
  });
});
