/**
 * @bureau/llm-providers
 *
 * LLM provider implementations + resilience + caching.
 *
 * Quick start:
 * ```ts
 * import { ProviderRegistry, ClaudeProvider, GeminiProvider, CategoryCache } from '@bureau/llm-providers'
 * import { createRedisConnection } from '@bureau/infra-messaging'
 *
 * const cache = new CategoryCache(redis)
 * const registry = new ProviderRegistry(cache)
 * registry.register(new ClaudeProvider())
 * registry.register(new GeminiProvider())
 *
 * const result = await registry.generate('claude-sonnet-4-6', { prompt: 'Hello' })
 * ```
 */

// Core interface
export type {
  IModelProvider,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ProviderInfo,
} from './IModelProvider.js'

// Concrete providers
export { ClaudeProvider } from './claude/index.js'
export { GeminiProvider } from './gemini/index.js'

// Registry + routing
export { ProviderRegistry } from './provider-registry.js'

// Pricing
export {
  MODEL_PRICING,
  getModelPricing,
  getModelsByTier,
  getModelsByProvider,
  estimateCost,
  estimateTokens,
  SPENDING_ANOMALY_MULTIPLIER,
  COST_DEVIATION_ALERT_THRESHOLD,
  type ModelPricing,
  type LlmProvider,
  type ModelTier,
} from './pricing.config.js'

// Cache
export {
  CategoryCache,
  classifyCacheCategory,
  effectiveTtl,
  SYSTEM_FLOOR_TTL,
  TENANT_MAX_TTL,
  type CacheCategory,
  type CachedResponse,
  type CacheOptions,
} from './cache/category-cache.js'

// Resilience
export {
  createLlmPolicy,
  getCircuitBreakerState,
  resetCircuitBreaker,
  type LlmPolicyOptions,
  type WrappedPolicy,
} from './resilience/policies.js'
