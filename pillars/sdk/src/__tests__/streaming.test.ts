/**
 * SDK streaming tests — parseSSEEvent and streamSSE
 */
import { describe, it, expect } from "vitest";
import { parseSSEEvent } from "../streaming.js";

describe("parseSSEEvent()", () => {
  it("parses basic event with data", () => {
    const raw = `event: task.stage.changed\ndata: {"taskId":"t1","from":"Producing","to":"Reviewing","at":"2026-05-03T10:00:00Z"}`;
    const event = parseSSEEvent(raw);
    expect(event).not.toBeNull();
    if (event) {
      expect(event.event).toBe("task.stage.changed");
      expect((event as unknown as Record<string, unknown>)["taskId"]).toBe(
        "t1",
      );
    }
  });

  it("parses task.completed event", () => {
    const raw = `event: task.completed\ndata: {"taskId":"t2","output":"Final output","outputQuality":"standard","costUsd":"0.032"}`;
    const event = parseSSEEvent(raw);
    expect(event).not.toBeNull();
    if (event) {
      expect(event.event).toBe("task.completed");
      expect((event as unknown as Record<string, unknown>)["output"]).toBe(
        "Final output",
      );
    }
  });

  it("parses decision_required event", () => {
    const raw = [
      "event: decision_required",
      'data: {"taskId":"t3","pendingDecision":{"reason":"budget_insufficient_for_escalation","attemptNumber":2,"bestEffortOutput":{"available":true,"qualityEstimate":0.8},"escalationOption":null,"expiresAt":"2026-05-04T10:00:00Z","defaultAction":"best_effort"}}',
    ].join("\n");
    const event = parseSSEEvent(raw);
    expect(event).not.toBeNull();
    if (event) {
      expect(event.event).toBe("decision_required");
    }
  });

  it("returns null for heartbeat lines (empty data)", () => {
    const raw = ": heartbeat";
    const event = parseSSEEvent(raw);
    expect(event).toBeNull();
  });

  it("returns null for missing event type", () => {
    const raw = 'data: {"taskId":"t4"}';
    const event = parseSSEEvent(raw);
    expect(event).toBeNull();
  });

  it("returns null for missing data", () => {
    const raw = "event: task.stage.changed";
    const event = parseSSEEvent(raw);
    expect(event).toBeNull();
  });

  it("returns null for invalid JSON in data", () => {
    const raw = "event: task.stage.changed\ndata: {invalid json}";
    const event = parseSSEEvent(raw);
    expect(event).toBeNull();
  });

  it("handles multi-line events (double newline separator)", () => {
    const raw = `event: division.progress\ndata: {"taskId":"t5","division":"Production","progress":0.4}`;
    const event = parseSSEEvent(raw);
    expect(event).not.toBeNull();
    if (event) {
      expect(event.event).toBe("division.progress");
      expect((event as unknown as Record<string, unknown>)["progress"]).toBe(
        0.4,
      );
    }
  });
});
