/**
 * Upstash Vector semantic cache unit tests.
 * Uses mock client — no real Upstash connection required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SemanticCache } from "./upstash-vector-cache.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeClient = (
  overrides: Partial<{
    queryScore: number;
    queryMetadata: object | undefined;
  }> = {},
) => ({
  upsert: vi.fn().mockResolvedValue(undefined),
  query: vi
    .fn()
    .mockResolvedValue(
      overrides.queryScore !== undefined
        ? [{ score: overrides.queryScore, metadata: overrides.queryMetadata }]
        : [],
    ),
  delete: vi.fn().mockResolvedValue(undefined),
});

const mockEmbedFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

const makeResponse = () => ({
  text: "Test LLM response",
  modelUsed: "claude-haiku-4-5",
  tokensIn: 100,
  tokensOut: 50,
  costUsd: 0.001,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SemanticCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedFn.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  describe("get()", () => {
    it("returns null on MISS (no results from Upstash)", async () => {
      const client = makeClient();
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "What is TypeScript?");
      expect(result).toBeNull();
    });

    it("returns cached entry on HIT (score >= 0.95)", async () => {
      const metadata = { ...makeResponse(), cachedAt: Date.now() };
      const client = makeClient({ queryScore: 0.97, queryMetadata: metadata });
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "What is TypeScript?");
      expect(result).not.toBeNull();
      expect(result?.text).toBe("Test LLM response");
    });

    it("returns null when score below threshold (< 0.95)", async () => {
      const metadata = { ...makeResponse(), cachedAt: Date.now() };
      const client = makeClient({ queryScore: 0.8, queryMetadata: metadata });
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "What is TypeScript?");
      expect(result).toBeNull();
    });

    it("returns null when score below 0.90 even with custom threshold of 0.80", async () => {
      // Floor is 0.90 — user cannot lower it below that
      const metadata = { ...makeResponse(), cachedAt: Date.now() };
      const client = makeClient({ queryScore: 0.85, queryMetadata: metadata });
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "Test", {
        similarityThreshold: 0.8,
      });
      expect(result).toBeNull(); // 0.85 < SIMILARITY_FLOOR(0.90) even though threshold=0.80
    });

    it("BYPASSES semantic cache for financial prompts", async () => {
      const metadata = { ...makeResponse(), cachedAt: Date.now() };
      const client = makeClient({ queryScore: 0.99, queryMetadata: metadata });
      const cache = new SemanticCache(client, mockEmbedFn);

      const financialPrompts = [
        "Berapa harga bitcoin sekarang?",
        "What is the current stock price of AAPL?",
        "EUR/USD exchange rate today",
        "Bitcoin crypto price prediction",
        "saham GOTO naik berapa?",
      ];

      for (const prompt of financialPrompts) {
        const result = await cache.get("claude-sonnet-4-6", prompt);
        expect(result).toBeNull();
        // Embedding function should NOT be called for financial prompts
      }
      expect(mockEmbedFn).not.toHaveBeenCalled();
    });

    it("returns null when bypass option is set", async () => {
      const metadata = { ...makeResponse(), cachedAt: Date.now() };
      const client = makeClient({ queryScore: 0.99, queryMetadata: metadata });
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get(
        "claude-haiku-4-5",
        "What is TypeScript?",
        { bypass: true },
      );
      expect(result).toBeNull();
      expect(mockEmbedFn).not.toHaveBeenCalled();
    });

    it("returns null (non-fatal) when Upstash throws", async () => {
      const client = makeClient();
      client.query.mockRejectedValue(new Error("Upstash connection timeout"));
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "Hello world");
      expect(result).toBeNull(); // non-fatal fallthrough
    });

    it("returns null when embedding function throws", async () => {
      mockEmbedFn.mockRejectedValue(new Error("Embedding service unavailable"));
      const client = makeClient();
      const cache = new SemanticCache(client, mockEmbedFn);

      const result = await cache.get("claude-haiku-4-5", "What is AI?");
      expect(result).toBeNull();
    });
  });

  describe("set()", () => {
    it("stores response in Upstash with embedding", async () => {
      const client = makeClient();
      const cache = new SemanticCache(client, mockEmbedFn);

      await cache.set(
        "claude-haiku-4-5",
        "What is TypeScript?",
        makeResponse(),
      );

      expect(mockEmbedFn).toHaveBeenCalledWith("What is TypeScript?");
      expect(client.upsert).toHaveBeenCalledOnce();
      const call = client.upsert.mock.calls[0]![0];
      expect(call.vector).toEqual([0.1, 0.2, 0.3]);
      expect(call.metadata.text).toBe("Test LLM response");
      expect(call.metadata.cachedAt).toBeGreaterThan(0);
    });

    it("SKIPS financial prompts — never upserts", async () => {
      const client = makeClient();
      const cache = new SemanticCache(client, mockEmbedFn);

      await cache.set(
        "claude-haiku-4-5",
        "harga bitcoin saat ini",
        makeResponse(),
      );

      expect(client.upsert).not.toHaveBeenCalled();
      expect(mockEmbedFn).not.toHaveBeenCalled();
    });

    it("does not throw when Upstash set fails (non-fatal)", async () => {
      const client = makeClient();
      client.upsert.mockRejectedValue(new Error("Upstash write failed"));
      const cache = new SemanticCache(client, mockEmbedFn);

      // Should not throw
      await expect(
        cache.set("claude-haiku-4-5", "Hello world", makeResponse()),
      ).resolves.toBeUndefined();
    });
  });

  describe("invalidate()", () => {
    it("calls client.delete with correct ID", async () => {
      const client = makeClient();
      const cache = new SemanticCache(client, mockEmbedFn);

      await cache.invalidate("claude-haiku-4-5", "What is TypeScript?");
      expect(client.delete).toHaveBeenCalledOnce();
    });

    it("does not throw when delete fails (non-fatal)", async () => {
      const client = makeClient();
      client.delete.mockRejectedValue(new Error("Upstash delete failed"));
      const cache = new SemanticCache(client, mockEmbedFn);

      await expect(
        cache.invalidate("claude-haiku-4-5", "test"),
      ).resolves.toBeUndefined();
    });
  });
});
