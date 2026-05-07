import { describe, it, expect } from "vitest";
import {
  CreateTaskRequestSchema,
  TaskDecisionRequestSchema,
  TaskFeedbackRequestSchema,
} from "../task.js";

describe("Task contracts", () => {
  describe("CreateTaskRequestSchema", () => {
    it("parses valid request", () => {
      const result = CreateTaskRequestSchema.safeParse({
        prompt: "Analisis kompetitor di market fintech Indonesia",
        outputFormat: "markdown",
      });
      expect(result.success).toBe(true);
    });

    it("strips unknown fields", () => {
      const result = CreateTaskRequestSchema.safeParse({
        prompt: "test",
        unknownField: "should be stripped",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("unknownField" in result.data).toBe(false);
      }
    });

    it("rejects empty prompt", () => {
      const result = CreateTaskRequestSchema.safeParse({ prompt: "" });
      expect(result.success).toBe(false);
    });

    it("rejects prompt over 50000 chars", () => {
      const result = CreateTaskRequestSchema.safeParse({
        prompt: "a".repeat(50001),
      });
      expect(result.success).toBe(false);
    });

    it("defaults outputFormat to markdown", () => {
      const result = CreateTaskRequestSchema.safeParse({ prompt: "test" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.outputFormat).toBe("markdown");
    });
  });

  describe("TaskDecisionRequestSchema", () => {
    it("accepts best_effort", () => {
      const result = TaskDecisionRequestSchema.safeParse({
        action: "best_effort",
      });
      expect(result.success).toBe(true);
    });

    it("accepts add_budget", () => {
      const result = TaskDecisionRequestSchema.safeParse({
        action: "add_budget",
      });
      expect(result.success).toBe(true);
    });

    it("accepts cancel", () => {
      const result = TaskDecisionRequestSchema.safeParse({ action: "cancel" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid action", () => {
      const result = TaskDecisionRequestSchema.safeParse({ action: "destroy" });
      expect(result.success).toBe(false);
    });
  });

  describe("TaskFeedbackRequestSchema", () => {
    it("accepts valid rating and comment", () => {
      const result = TaskFeedbackRequestSchema.safeParse({
        rating: 4,
        comment: "Output bagus tapi perlu lebih spesifik",
      });
      expect(result.success).toBe(true);
    });

    it("rejects rating below 1", () => {
      const result = TaskFeedbackRequestSchema.safeParse({ rating: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects rating above 5", () => {
      const result = TaskFeedbackRequestSchema.safeParse({ rating: 6 });
      expect(result.success).toBe(false);
    });

    it("accepts rating without comment", () => {
      const result = TaskFeedbackRequestSchema.safeParse({ rating: 3 });
      expect(result.success).toBe(true);
    });
  });
});
