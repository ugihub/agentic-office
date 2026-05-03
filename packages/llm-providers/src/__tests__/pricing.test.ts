import { describe, it, expect } from 'vitest'
import {
  estimateCost,
  estimateTokens,
  getModelPricing,
  getModelsByTier,
  MODEL_PRICING,
} from '../pricing.config.js'

describe('estimateCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    // $3/1M input, $15/1M output
    const cost = estimateCost('claude-sonnet-4-6', 1_000_000, 0)
    expect(cost).toBeCloseTo(3.0)
  })

  it('reduces cost for cached tokens', () => {
    // 1M input, 500k cached — cached at $0.30/1M, rest at $3/1M
    const withCache = estimateCost('claude-sonnet-4-6', 1_000_000, 0, 500_000)
    const withoutCache = estimateCost('claude-sonnet-4-6', 1_000_000, 0, 0)
    expect(withCache).toBeLessThan(withoutCache!)
  })

  it('returns null for unknown model', () => {
    const cost = estimateCost('unknown-model-xyz', 1000, 500)
    expect(cost).toBeNull()
  })

  it('includes both input and output tokens', () => {
    // gemini-2.5-flash-lite: $0.10/1M input, $0.40/1M output
    const cost = estimateCost('gemini-2.5-flash-lite', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.50) // 0.10 + 0.40
  })
})

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const tokens = estimateTokens('a'.repeat(4000))
    expect(tokens).toBe(1000)
  })
})

describe('getModelPricing', () => {
  it('returns pricing for known model', () => {
    const p = getModelPricing('claude-haiku-4-5-20251001')
    expect(p).toBeDefined()
    expect(p?.provider).toBe('anthropic')
    expect(p?.tier).toBe('economy')
  })

  it('returns undefined for unknown model', () => {
    expect(getModelPricing('not-a-real-model')).toBeUndefined()
  })
})

describe('getModelsByTier', () => {
  it('economy tier has at least 3 models', () => {
    const models = getModelsByTier('economy')
    expect(models.length).toBeGreaterThanOrEqual(3)
  })

  it('all models in registry have valid pricing fields', () => {
    for (const model of MODEL_PRICING) {
      expect(model.inputPer1M).toBeGreaterThan(0)
      expect(model.outputPer1M).toBeGreaterThan(0)
      expect(model.contextWindow).toBeGreaterThan(0)
    }
  })
})
