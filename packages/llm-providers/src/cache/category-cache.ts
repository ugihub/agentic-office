/**
 * Category-based TTL cache for LLM responses.
 *
 * Two layers:
 * 1. SYSTEM_FLOOR_TTL — hard minimum, cannot be overridden by tenant
 * 2. TENANT_MAX_TTL  — hard maximum, tenant can customize within this bound
 *
 * Categories:
 * - financial  → TTL=0 (never cache — price/exchange rate data)
 * - temporal   → TTL=60s minimum
 * - personnel  → TTL=1h minimum
 * - inventory  → TTL=5m minimum
 * - default    → TTL=1h minimum
 *
 * Cache key = sha256(model + prompt). NOT including tenantId (prompt is enough to deduplicate).
 * Financial prompts are NEVER cached — this is a hard constraint, not a config option.
 *
 * @see ADR-005-cache-ttl-categories.md
 */
import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'
import { createLogger } from '@bureau/telemetry'

const log = createLogger({ division: 'Production' })

// ─── Categories ───────────────────────────────────────────────────────────────

export type CacheCategory = 'financial' | 'temporal' | 'personnel' | 'inventory' | 'default'

/**
 * SYSTEM_FLOOR_TTL — minimum TTL per category.
 * Hard constraint. Tenant configuration cannot go below these values.
 * financial=0 means "never cache" — this cannot be overridden.
 */
export const SYSTEM_FLOOR_TTL: Readonly<Record<CacheCategory, number>> = {
  financial: 0,    // NEVER cache — not even for 1 second
  temporal: 60,    // min 1 minute
  personnel: 3_600,  // min 1 hour
  inventory: 300,  // min 5 minutes
  default: 3_600,  // min 1 hour
}

/**
 * TENANT_MAX_TTL — maximum TTL tenants can configure.
 * Tenant can set their cache TTL up to (but not exceeding) these values.
 */
export const TENANT_MAX_TTL: Readonly<Record<CacheCategory, number>> = {
  financial: 0,       // no override — financial is always TTL=0
  temporal: 600,      // max 10 minutes
  personnel: 86_400,  // max 24 hours
  inventory: 3_600,   // max 1 hour
  default: 604_800,   // max 7 days
}

// ─── Classifier (same logic as path-classifier but isolated here for LLM layer) ─

/**
 * Classify a prompt into a cache category.
 * This runs on every request — it must be fast (pure regex, no LLM).
 *
 * CRITICAL: Financial classifier is a runtime assertion, not just a test.
 * Any financial prompt that gets a non-zero TTL is a billing/compliance bug.
 */
export function classifyCacheCategory(prompt: string): CacheCategory {
  // Financial: price, exchange rate, stock, crypto — NEVER cache
  if (/harga|price|kurs|saham|crypto|bitcoin|stock|nilai tukar|exchange rate|forex/i.test(prompt)) {
    return 'financial'
  }
  // Temporal: time-sensitive data — short TTL
  if (/hari ini|sekarang|terbaru|terkini|minggu ini|today|now|latest|current|this week/i.test(prompt)) {
    return 'temporal'
  }
  // Personnel: leadership info — medium TTL (changes occasionally)
  if (/CEO|CTO|direktur|presiden|kepala|pemimpin|director|president|chief|founder/i.test(prompt)) {
    return 'personnel'
  }
  // Inventory: availability info — medium TTL
  if (/tersedia|available|stok|stock|inventory|in stock|out of stock/i.test(prompt)) {
    return 'inventory'
  }
  return 'default'
}

/**
 * Calculate effective TTL for a given category and optional tenant override.
 *
 * @param category - Detected category
 * @param tenantOverrideSec - Tenant-configured TTL (optional)
 * @returns Effective TTL in seconds. 0 means do not cache.
 */
export function effectiveTtl(category: CacheCategory, tenantOverrideSec?: number | undefined): number {
  const floor = SYSTEM_FLOOR_TTL[category]

  // Financial: always 0, regardless of tenant override
  if (floor === 0) return 0

  if (tenantOverrideSec === undefined) {
    return floor
  }

  const max = TENANT_MAX_TTL[category]
  // Clamp: max(floor, min(tenant, max))
  return Math.max(floor, Math.min(tenantOverrideSec, max))
}

// ─── Cache implementation ─────────────────────────────────────────────────────

export interface CachedResponse {
  text: string
  modelUsed: string
  tokensIn: number
  tokensOut: number
  cachedAt: number
  category: CacheCategory
}

export interface CacheOptions {
  /** Tenant TTL override in seconds (per category) */
  tenantTtl?: Partial<Record<CacheCategory, number>> | undefined
}

/**
 * Category-aware LLM response cache backed by Redis.
 */
export class CategoryCache {
  constructor(private readonly redis: Redis) {}

  /**
   * Generate a cache key for a model + prompt combination.
   */
  cacheKey(model: string, prompt: string): string {
    const hash = createHash('sha256')
      .update(`${model}:${prompt}`)
      .digest('hex')
      .slice(0, 32) // 32 hex chars = 128 bits, sufficient for dedup
    return `llm:cache:${hash}`
  }

  /**
   * Get a cached response. Returns null if not found or TTL=0.
   *
   * CRITICAL: Always re-classify the prompt category on get.
   * Never trust cached category from a previous request.
   */
  async get(
    model: string,
    prompt: string,
    options: CacheOptions = {},
  ): Promise<CachedResponse | null> {
    const category = classifyCacheCategory(prompt)
    const ttl = effectiveTtl(category, options.tenantTtl?.[category])

    // Financial and TTL=0: never even check cache
    if (ttl === 0) {
      log.debug({ category }, 'Cache bypass: TTL=0 (financial or zero-TTL category)')
      return null
    }

    const key = this.cacheKey(model, prompt)

    try {
      const cached = await this.redis.get(key)
      if (!cached) return null

      const parsed = JSON.parse(cached) as CachedResponse
      log.debug({ key: key.slice(0, 16), category, model }, 'Cache HIT')
      return parsed
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn({ err: msg }, 'Cache get failed (non-fatal)')
      return null
    }
  }

  /**
   * Store a response in cache with appropriate TTL.
   * Financial prompts are silently skipped.
   */
  async set(
    model: string,
    prompt: string,
    response: Omit<CachedResponse, 'cachedAt' | 'category'>,
    options: CacheOptions = {},
  ): Promise<void> {
    const category = classifyCacheCategory(prompt)
    const ttl = effectiveTtl(category, options.tenantTtl?.[category])

    if (ttl === 0) {
      // Silently skip — do not log warning (this is expected behavior, not an error)
      return
    }

    const key = this.cacheKey(model, prompt)
    const entry: CachedResponse = {
      ...response,
      cachedAt: Date.now(),
      category,
    }

    try {
      await this.redis.set(key, JSON.stringify(entry), 'EX', ttl)
      log.debug({ key: key.slice(0, 16), category, ttl, model }, 'Cache SET')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn({ err: msg }, 'Cache set failed (non-fatal)')
    }
  }

  /**
   * Invalidate a specific cache entry.
   */
  async invalidate(model: string, prompt: string): Promise<void> {
    const key = this.cacheKey(model, prompt)
    try {
      await this.redis.del(key)
    } catch {
      // Non-fatal
    }
  }
}
