import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { checkSuperKey, requirePermission } from "../middleware/auth.js";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("auth middleware hardening", () => {
  it("does not allow BUREAU_SUPER_KEY in production", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      BUREAU_SUPER_KEY: "super-secret-bootstrap-key",
    };

    expect(checkSuperKey("super-secret-bootstrap-key")).toBeNull();
  });

  it("requires provider-keys:read for listing provider keys", () => {
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as FastifyReply;

    expect(() =>
      requirePermission(
        {
          tenantId: "tenant_1",
          userId: "user_1",
          permissions: ["provider-keys:write"],
          authMethod: "api_key",
        },
        "provider-keys:read",
        reply,
      ),
    ).toThrow("FORBIDDEN");
  });

  it("rejects super key shorter than 32 chars (BUG-7)", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      BUREAU_SUPER_KEY: "short-key-only-15ch", // 18 chars
    };

    expect(checkSuperKey("short-key-only-15ch")).toBeNull();
  });

  it("rejects super key of correct length but wrong value (BUG-7)", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      BUREAU_SUPER_KEY: "a".repeat(32),
    };

    expect(checkSuperKey("b".repeat(32))).toBeNull();
  });

  it("accepts valid super key of correct length in dev (BUG-7)", () => {
    const key = "x".repeat(32);
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      BUREAU_SUPER_KEY: key,
    };

    const ctx = checkSuperKey(key);
    expect(ctx).not.toBeNull();
    expect(ctx?.tenantId).toBe("tenant_super");
    expect(ctx?.permissions).toContain("task:write");
  });

  it("rejects super key in production (BUG-7 / SEC-03)", () => {
    const key = "x".repeat(32);
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      BUREAU_SUPER_KEY: key,
    };

    expect(checkSuperKey(key)).toBeNull();
  });
});
