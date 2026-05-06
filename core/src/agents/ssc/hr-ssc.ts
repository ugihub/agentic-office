/**
 * HR SSC Agent — model selection, complexity scoring, escalation chain builder.
 *
 * Complexity score (0-10) determines initial model tier.
 * Formula: complexity_score × 0.4 + (1/latency) × 0.3 + quality × 0.3
 *
 * Escalation chain: pre-built at task start, Finance SSC pre-approves total budget.
 * Attempt 1: economy model (Haiku/Gemini Flash)
 * Attempt 2: standard model (Sonnet/Gemini Pro)
 * Attempt 3: premium model (Opus/GPT-5)
 */
import { type Result, ok } from '@bureau/shared-kernel'
import type { ExecutionPath } from '@bureau/contracts'

// Model registry with pricing (USD per 1M tokens)
const MODEL_REGISTRY = [
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    tier: 'economy' as const,
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    maxComplexity: 3,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    tier: 'economy' as const,
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    maxComplexity: 3,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    tier: 'standard' as const,
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    maxComplexity: 7,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    tier: 'standard' as const,
    inputPer1M: 1.25,
    outputPer1M: 10.00,
    maxComplexity: 7,
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    tier: 'premium' as const,
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    maxComplexity: 10,
  },
] as const

export type ModelTier = 'economy' | 'standard' | 'premium'
export interface HREscalationEntry {
  attempt: number
  model: string
  provider: string
  maxCostUsd: string
}

export interface ComplexityAssessment {
  score: number         // 0-10
  tier: ModelTier
  rationale: string
}

export interface EscalationChain {
  entries: HREscalationEntry[]
  totalMaxCostUsd: string
  readonly length: number
  [index: number]: HREscalationEntry
  map<T>(
    callbackfn: (value: HREscalationEntry, index: number, array: HREscalationEntry[]) => T,
    thisArg?: unknown,
  ): T[]
}

export interface ModelSelectionResult {
  selectedModel: string
  provider: string
  complexity: ComplexityAssessment
  escalationChain: EscalationChain
}

/**
 * Calculate complexity score from prompt signals.
 * Rule-based (no LLM call).
 *
 * Score components:
 * - Length: 0-3 points (>500 tokens = 3)
 * - Code: 2 points if has code
 * - Research: 2 points if has research signals
 * - Multi-step: 1 point if >3 sentences
 * - Domain expertise: 2 points if specialized domain
 */
export function calculateComplexityScore(
  prompt: string,
  signals: { hasCode: boolean; hasResearch: boolean; tokenCount: number },
): ComplexityAssessment {
  let score = 0
  const reasons: string[] = []

  // Length contribution (0-3)
  if (signals.tokenCount > 500) {
    score += 3
    reasons.push('long prompt (>500 tokens)')
  } else if (signals.tokenCount > 200) {
    score += 2
    reasons.push('medium prompt (>200 tokens)')
  } else if (signals.tokenCount > 100) {
    score += 1
    reasons.push('moderate prompt (>100 tokens)')
  }

  // Code signals (0-2)
  if (signals.hasCode) {
    score += 2
    reasons.push('contains code')
  }

  // Research signals (0-2)
  if (signals.hasResearch) {
    score += 2
    reasons.push('requires research')
  }

  // Multi-step reasoning (0-1)
  const sentenceCount = prompt.split(/[.!?]/).filter((s) => s.trim().length > 10).length
  if (sentenceCount > 5) {
    score += 1
    reasons.push('multi-step reasoning required')
  }

  // Specialized domain (0-2)
  if (/hukum|legal|medis|medical|keuangan|financial|engineering|teknik/i.test(prompt)) {
    score += 2
    reasons.push('specialized domain')
  }

  score = Math.min(10, score)

  const tier: ModelTier = score <= 3 ? 'economy' : score <= 6 ? 'standard' : 'premium'

  return {
    score,
    tier,
    rationale: reasons.join(', ') || 'simple prompt',
  }
}

/**
 * Select initial model based on complexity score and tier.
 * Prefers cost-efficient models within the same tier.
 */
export function selectInitialModel(
  tier: ModelTier,
  preferredTier?: 'economy' | 'standard' | 'premium',
): (typeof MODEL_REGISTRY)[number] {
  const effectiveTier = preferredTier ?? tier
  const candidates = MODEL_REGISTRY.filter((m) => m.tier === effectiveTier)

  // Sort by input cost (cheapest first within tier)
  const sorted = [...candidates].sort((a, b) => a.inputPer1M - b.inputPer1M)
  return sorted[0] ?? MODEL_REGISTRY[0]!
}

/**
 * Build escalation chain: attempt 1 = economy, 2 = standard, 3 = premium.
 * Costs estimated at 1000 tokens in + 500 tokens out per attempt.
 */
export function buildEscalationChain(
  initialTier: ModelTier,
  estimatedInputTokens = 1000,
  estimatedOutputTokens = 500,
): EscalationChain {
  const tiers: ModelTier[] = ['economy', 'standard', 'premium']
  const usesLegacyComplexityArg = arguments.length === 2 && estimatedInputTokens <= 10
  const startTier = usesLegacyComplexityArg ? 'economy' : initialTier
  const inputTokens = usesLegacyComplexityArg ? 1000 : estimatedInputTokens
  const startIdx = tiers.indexOf(startTier)

  const entries: HREscalationEntry[] = []
  let totalCost = 0

  for (let i = startIdx; i < tiers.length; i++) {
    const tier = tiers[i]!
    const model = selectInitialModel(tier)
    const costUsd =
      (inputTokens / 1_000_000) * model.inputPer1M +
      (estimatedOutputTokens / 1_000_000) * model.outputPer1M

    totalCost += costUsd

    entries.push({
      attempt: i - startIdx + 1,
      model: model.id,
      provider: model.provider,
      maxCostUsd: costUsd.toFixed(6),
    })
  }

  const chain = {
    entries,
    totalMaxCostUsd: totalCost.toFixed(6),
    get length() {
      return entries.length
    },
    map: entries.map.bind(entries),
  } as EscalationChain

  entries.forEach((entry, index) => {
    chain[index] = entry
  })

  return chain
}

/**
 * Run HR SSC model selection.
 * Returns selected model + pre-built escalation chain.
 */
export function selectModelForTask(
  prompt: string,
  pathSignals: { hasCode: boolean; hasResearch: boolean; tokenCount: number },
  executionPath: ExecutionPath,
  preferredTier?: ModelTier,
): Result<ModelSelectionResult, Error> {
  const complexity = calculateComplexityScore(prompt, pathSignals)

  // Fast path: always economy tier regardless of complexity
  const effectiveTier = executionPath === 'fast' ? 'economy' : complexity.tier
  const selectedModel = selectInitialModel(effectiveTier, preferredTier)
  const chain = buildEscalationChain(effectiveTier)

  return ok({
    selectedModel: selectedModel.id,
    provider: selectedModel.provider,
    complexity,
    escalationChain: chain,
  })
}
