import { describe, it, expect } from "vitest";
import {
  InsufficientBudgetError,
  TaskNotFoundError,
  LlmProviderError,
  isBureauError,
  ValidationError,
} from "../errors.js";

describe("Error hierarchy", () => {
  describe("BureauError", () => {
    it("has correct name and code", () => {
      const e = new TaskNotFoundError("task_123");
      expect(e.name).toBe("TaskNotFoundError");
      expect(e.code).toBe("TASK_NOT_FOUND");
      expect(e.message).toContain("task_123");
    });

    it("instanceof Error", () => {
      const e = new TaskNotFoundError("task_123");
      expect(e).toBeInstanceOf(Error);
    });

    it("has timestamp", () => {
      const before = new Date();
      const e = new TaskNotFoundError("task_123");
      const after = new Date();
      expect(e.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(e.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("serializes to JSON", () => {
      const e = new TaskNotFoundError("task_123");
      const json = e.toJSON();
      expect(json["code"]).toBe("TASK_NOT_FOUND");
      expect(json["name"]).toBe("TaskNotFoundError");
      expect(json["message"]).toContain("task_123");
    });
  });

  describe("InsufficientBudgetError", () => {
    it("carries budget context", () => {
      const e = new InsufficientBudgetError("tenant_001", "0.50", "0.20");
      expect(e.tenantId).toBe("tenant_001");
      expect(e.required).toBe("0.50");
      expect(e.available).toBe("0.20");
      expect(e.code).toBe("BUDGET_INSUFFICIENT");
    });
  });

  describe("LlmProviderError", () => {
    it("carries provider context", () => {
      const e = new LlmProviderError(
        "anthropic",
        "claude-sonnet-4-6",
        "503 Service Unavailable",
      );
      expect(e.provider).toBe("anthropic");
      expect(e.model).toBe("claude-sonnet-4-6");
      expect(e.message).toContain("503");
    });

    it("supports cause chaining", () => {
      const cause = new Error("network error");
      const e = new LlmProviderError(
        "anthropic",
        "claude-sonnet-4-6",
        "failed",
        { cause },
      );
      expect(e.cause).toBe(cause);
    });
  });

  describe("isBureauError()", () => {
    it("returns true for BureauError subclasses", () => {
      expect(isBureauError(new TaskNotFoundError("t"))).toBe(true);
      expect(isBureauError(new ValidationError("field", "required"))).toBe(
        true,
      );
    });

    it("returns false for plain Error", () => {
      expect(isBureauError(new Error("plain"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isBureauError("string")).toBe(false);
      expect(isBureauError(null)).toBe(false);
      expect(isBureauError(undefined)).toBe(false);
    });
  });
});
