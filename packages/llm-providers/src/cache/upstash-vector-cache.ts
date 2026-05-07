/**
 * Upstash Vector — Semantic Cache for LLM responses.
 *
 * Semantic cache goes beyond exact-match (Redis key = sha256(model+prompt)).
 * Queries with ~95% semantic similarity return the cached response,
 * saving LLM cost on paraphrase variants ("What is X?" vs "Tell me about X?").
 *
 * Architecture:
 * - Vector store: Upstash Vector (serverless, pay-per-query)
 * - Embedding: prompt is embedded via a cheap embedding model before lookup
 * - Similarity threshold: 0.95 (configurable, floor=0.90)
 * - Financial prompts: BYPASSED (TTL=0 rule applies here too)
 * - Fallback: if Upstash is unavailable, log.warn and fall through to LLM
 *
 * @see ADR-005-cache-ttl-categories.md
 * @see https://upstash.com/docs/vector/overall/getstarted
 */

import { createLogger, recordCacheHit } from "@bureau/telemetry";
import { classifyCacheCategory, SYSTEM_FLOOR_TTL } from "./category-cache.js";

const log = createLogger({ division: "Production" });

// ─── Similarity threshold ─────────────────────────────────────────────────────

/** Hard minimum similarity — do not serve cache below this even if Upstash returns it */
const SIMILARITY_FLOOR = 0.9;

/** Default target similarity — configurable, must be >= SIMILARITY_FLOOR */
const DEFAULT_SIMILARITY_THRESHOLD = 0.95;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SemanticCacheEntry {
  text: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cachedAt: number;
}

export interface SemanticCacheOptions {
  /** Similarity threshold (0-1). Default: 0.95. Min: 0.90 */
  similarityThreshold?: number;
  /** Skip cache entirely for this request */
  bypass?: boolean;
}

// ─── Upstash Vector client interface ─────────────────────────────────────────

/** Minimal interface to avoid hard dep on @upstash/vector in tests */
interface UpstashVectorClient {
  upsert(args: {
    id: string;
    vector: number[];
    metadata: SemanticCacheEntry;
  }): Promise<unknown>;
  query(args: {
    vector: number[];
    topK: number;
    includeMetadata: boolean;
  }): Promise<Array<{ score: number; metadata?: SemanticCacheEntry }>>;
  delete(ids: string[]): Promise<unknown>;
}

/** Minimal embedding function interface */
type EmbedFn = (text: string) => Promise<number[]>;

// ─── Factory function ─────────────────────────────────────────────────────────

/**
 * Create Upstash Vector semantic cache.
 *
 * @param client - Upstash Vector client (injected for testability)
 * @param embedFn - Embedding function (injected — use cheap model like text-embedding-3-small)
 *
 * @example
 * ```typescript
 * import { Index } from '@upstash/vector'
 * const vectorClient = new Index({
 *   url: process.env.UPSTASH_VECTOR_REST_URL!,
 *   token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
 * })
 * const embedFn = async (text: string) => {
 *   // Use OpenAI text-embedding-3-small or any embedding model
 *   const resp = await openai.embeddings.create({ input: text, model: 'text-embedding-3-small' })
 *   return resp.data[0]!.embedding
 * }
 * const semanticCache = createSemanticCache(vectorClient, embedFn)
 * ```
 */
export function createSemanticCache(
  client: UpstashVectorClient,
  embedFn: EmbedFn,
) {
  return new SemanticCache(client, embedFn);
}

// ─── SemanticCache class ──────────────────────────────────────────────────────

export class SemanticCache {
  constructor(
    private readonly client: UpstashVectorClient,
    private readonly embedFn: EmbedFn,
  ) {}

  /**
   * Look up semantically similar response.
   *
   * Flow:
   * 1. Classify prompt category → financial = bypass
   * 2. Embed prompt → vector
   * 3. Query Upstash with topK=1 → if score >= threshold → cache HIT
   * 4. Record cache hit metric
   *
   * Returns null on any error (non-fatal by design).
   */
  async get(
    model: string,
    prompt: string,
    options: SemanticCacheOptions = {},
  ): Promise<SemanticCacheEntry | null> {
    if (options.bypass) return null;

    // Financial prompts: NEVER serve from semantic cache
    const category = classifyCacheCategory(prompt);
    if (SYSTEM_FLOOR_TTL[category] === 0) {
      log.debug({ category }, "Semantic cache bypass: financial prompt");
      return null;
    }

    const threshold = Math.max(
      SIMILARITY_FLOOR,
      options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    );

    try {
      const vector = await this.embedFn(prompt);
      const results = await this.client.query({
        vector,
        topK: 1,
        includeMetadata: true,
      });

      const top = results[0];
      if (!top || top.score < threshold || !top.metadata) {
        log.debug({ score: top?.score, threshold }, "Semantic cache MISS");
        return null;
      }

      log.info({ score: top.score, model, category }, "Semantic cache HIT");

      // Record metric
      recordCacheHit({
        cacheType: "semantic",
        model,
        savedTokens: top.metadata.tokensIn + top.metadata.tokensOut,
        savedUsd: top.metadata.costUsd,
      });

      return top.metadata;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn({ err: msg }, "Semantic cache get failed (non-fatal)");
      return null;
    }
  }

  /**
   * Store a response in the semantic cache.
   * Financial prompts: silently skipped.
   *
   * Vector ID = sha256-prefix of (model + prompt) for deduplication.
   */
  async set(
    model: string,
    prompt: string,
    response: Omit<SemanticCacheEntry, "cachedAt">,
  ): Promise<void> {
    const category = classifyCacheCategory(prompt);
    if (SYSTEM_FLOOR_TTL[category] === 0) {
      return; // financial: never store
    }

    try {
      const vector = await this.embedFn(prompt);
      const id = `${model}:${Buffer.from(prompt).toString("base64").slice(0, 32)}`;
      const entry: SemanticCacheEntry = { ...response, cachedAt: Date.now() };

      await this.client.upsert({ id, vector, metadata: entry });
      log.debug({ model, category }, "Semantic cache SET");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn({ err: msg }, "Semantic cache set failed (non-fatal)");
    }
  }

  /**
   * Invalidate a specific entry by model + prompt.
   */
  async invalidate(model: string, prompt: string): Promise<void> {
    const id = `${model}:${Buffer.from(prompt).toString("base64").slice(0, 32)}`;
    try {
      await this.client.delete([id]);
    } catch {
      // Non-fatal
    }
  }
}

// ─── Configuration guide ──────────────────────────────────────────────────────

/**
 * Environment variables required for Upstash Vector:
 *
 * UPSTASH_VECTOR_REST_URL=https://xxx.upstash.io
 * UPSTASH_VECTOR_REST_TOKEN=AXxx...
 *
 * Index configuration (set in Upstash console):
 * - Dimensions: 1536 (OpenAI text-embedding-3-small) or 768 (other models)
 * - Distance metric: COSINE (required for semantic similarity)
 * - Region: select closest to your deployment region
 *
 * Cost estimate (May 2026 Upstash pricing):
 * - Free tier: 10,000 queries/month
 * - Pay-as-you-go: $0.40/100K queries
 * - At 5 tasks/sec with 95% hit rate → ~15K queries/day → ~$1.80/day
 *
 * Expected savings:
 * - For paraphrase variants with 95% similarity threshold:
 *   ~20-40% additional cost reduction on top of exact-match Redis cache
 */
