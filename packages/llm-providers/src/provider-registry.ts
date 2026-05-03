/**
 * Provider registry — routes model IDs to the correct provider.
 *
 * Also wraps every call with:
 * 1. Category cache check (get before call, set after)
 * 2. Cockatiel policy (retry + circuit-breaker + bulkhead)
 *
 * Fallback chain: if primary provider fails (circuit open), try next provider
 * that supports the same model tier.
 */
import { ok, err } from '@bureau/shared-kernel'
import { createLogger } from '@bureau/telemetry'
import type { IModelProvider, GenerateOptions, GenerateResult } from './IModelProvider.js'
import type { Result } from '@bureau/shared-kernel'
import type { CategoryCache } from './cache/category-cache.js'
import { createLlmPolicy } from './resilience/policies.js'
import type { LlmProvider } from './pricing.config.js'

const log = createLogger({ division: 'Production' })

// ─── Registry ─────────────────────────────────────────────────────────────────

export class ProviderRegistry {
  private readonly providers = new Map<string, IModelProvider>()

  constructor(private readonly cache?: CategoryCache | undefined) {}

  /** Register a provider. Last registration for a given name wins. */
  register(provider: IModelProvider): void {
    this.providers.set(provider.info.name, provider)
    log.info(
      {
        provider: provider.info.name,
        models: provider.info.supportedModels.length,
      },
      'Provider registered',
    )
  }

  /** Get provider for a model ID */
  getProviderForModel(modelId: string): IModelProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(modelId)) return provider
    }
    return undefined
  }

  /**
   * Generate with full middleware stack:
   * cache → policy → provider → cache set
   */
  async generate(
    modelId: string,
    options: GenerateOptions,
  ): Promise<Result<GenerateResult, Error>> {
    // 1. Cache lookup (skip for financial prompts — TTL=0 enforced inside cache)
    if (this.cache) {
      const cached = await this.cache.get(modelId, options.prompt)
      if (cached) {
        log.info({ modelId }, 'LLM response served from cache')
        return ok({
          text: cached.text,
          tokensIn: cached.tokensIn,
          tokensOut: cached.tokensOut,
          cachedTokens: cached.tokensIn, // All tokens are "cached" from provider perspective
          costUsd: '0',                  // No cost for cached responses
          modelUsed: cached.modelUsed,
          finishReason: 'stop',
        })
      }
    }

    // 2. Resolve provider
    const provider = this.getProviderForModel(modelId)
    if (!provider) {
      return err(new Error(`No provider registered for model: ${modelId}`))
    }

    const providerName = provider.info.name as LlmProvider

    // 3. Execute with resilience policy
    const policy = createLlmPolicy(providerName)

    let result: Result<GenerateResult, Error>

    try {
      result = await policy.execute(() => provider.generate(modelId, options))
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      log.error({ modelId, provider: providerName, err: error.message }, 'Provider call failed after retries')
      result = err(error)
    }

    // 4. Cache successful response
    if (result.ok && this.cache) {
      await this.cache.set(modelId, options.prompt, {
        text: result.value.text,
        modelUsed: result.value.modelUsed,
        tokensIn: result.value.tokensIn,
        tokensOut: result.value.tokensOut,
      })
    }

    return result
  }

  /**
   * Try fallback chain: if primary model fails, try alternates in same tier.
   *
   * Called by Production Agent when primary model in escalation chain fails
   * with a non-retryable error (e.g., circuit open).
   */
  async generateWithFallback(
    modelId: string,
    fallbackModelIds: string[],
    options: GenerateOptions,
  ): Promise<Result<GenerateResult & { usedFallback: boolean; originalModel: string }, Error>> {
    const primaryResult = await this.generate(modelId, options)

    if (primaryResult.ok) {
      return ok({ ...primaryResult.value, usedFallback: false, originalModel: modelId })
    }

    log.warn(
      { modelId, err: primaryResult.error.message, fallbackCount: fallbackModelIds.length },
      'Primary model failed, trying fallback chain',
    )

    for (const fallbackId of fallbackModelIds) {
      const fallbackResult = await this.generate(fallbackId, options)
      if (fallbackResult.ok) {
        log.info({ originalModel: modelId, usedModel: fallbackId }, 'Fallback provider succeeded')
        return ok({
          ...fallbackResult.value,
          usedFallback: true,
          originalModel: modelId,
        })
      }
      log.warn(
        { fallbackId, err: fallbackResult.error.message },
        'Fallback model also failed',
      )
    }

    return err(
      new Error(
        `All providers failed. Primary: ${primaryResult.error.message}. Tried ${fallbackModelIds.length} fallbacks.`,
      ),
    )
  }
}
