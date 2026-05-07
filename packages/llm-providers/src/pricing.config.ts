/**
 * LLM provider pricing configuration (May 2026).
 *
 * Used by Finance SSC for budget estimation and cost tracking.
 * Alert threshold: ±20% deviation from rolling baseline triggers alert.
 *
 * IMPORTANT: Update this file when provider pricing changes.
 * All prices are USD per 1M tokens.
 */

export interface ModelPricing {
  readonly modelId: string;
  readonly provider: LlmProvider;
  readonly tier: ModelTier;
  /** USD per 1M input tokens */
  readonly inputPer1M: number;
  /** USD per 1M output tokens */
  readonly outputPer1M: number;
  /** USD per 1M cached input tokens (if provider supports prompt caching) */
  readonly cachedInputPer1M?: number | undefined;
  /** Max context window in tokens */
  readonly contextWindow: number;
  /** Max output tokens per request */
  readonly maxOutputTokens: number;
}

export type LlmProvider =
  | "anthropic"
  | "google"
  | "openai"
  | "deepseek"
  | "mistral"
  | "qwen"
  | "kimi";

export type ModelTier = "economy" | "standard" | "premium";

// ─── Pricing table (ref: May 2026) ───────────────────────────────────────────

export const MODEL_PRICING: ReadonlyArray<ModelPricing> = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    modelId: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    tier: "economy",
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    cachedInputPer1M: 0.1,
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  {
    modelId: "claude-sonnet-4-6",
    provider: "anthropic",
    tier: "standard",
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    modelId: "claude-opus-4-6",
    provider: "anthropic",
    tier: "premium",
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
  },

  // ── Google ─────────────────────────────────────────────────────────────────
  {
    modelId: "gemini-2.5-flash-lite",
    provider: "google",
    tier: "economy",
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
  },
  {
    modelId: "gemini-2.5-flash",
    provider: "google",
    tier: "economy",
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
  },
  {
    modelId: "gemini-2.5-pro",
    provider: "google",
    tier: "standard",
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    modelId: "gpt-5",
    provider: "openai",
    tier: "premium",
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
  },

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  {
    modelId: "deepseek-v3-2",
    provider: "deepseek",
    tier: "economy",
    inputPer1M: 0.28,
    outputPer1M: 0.42,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },

  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    modelId: "mistral-medium-3",
    provider: "mistral",
    tier: "standard",
    inputPer1M: 0.4,
    outputPer1M: 2.0,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },

  // ── Qwen ───────────────────────────────────────────────────────────────────
  {
    modelId: "qwen-2.5-7b",
    provider: "qwen",
    tier: "economy",
    inputPer1M: 0.3,
    outputPer1M: 0.8,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },

  // ── Kimi ───────────────────────────────────────────────────────────────────
  {
    modelId: "kimi-k2-5",
    provider: "kimi",
    tier: "standard",
    inputPer1M: 0.6,
    outputPer1M: 2.5,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _pricingMap = new Map(MODEL_PRICING.map((p) => [p.modelId, p]));

/** Get pricing for a model. Returns undefined if not in registry. */
export function getModelPricing(modelId: string): ModelPricing | undefined {
  return _pricingMap.get(modelId);
}

/** Get all models for a given tier */
export function getModelsByTier(tier: ModelTier): readonly ModelPricing[] {
  return MODEL_PRICING.filter((p) => p.tier === tier);
}

/** Get all models for a given provider */
export function getModelsByProvider(
  provider: LlmProvider,
): readonly ModelPricing[] {
  return MODEL_PRICING.filter((p) => p.provider === provider);
}

/**
 * Estimate cost for a request.
 * @param modelId - Model to use
 * @param tokensIn - Estimated input tokens
 * @param tokensOut - Estimated output tokens
 * @param cachedTokens - Tokens served from cache (default 0)
 * @returns Estimated cost in USD, or null if model not in registry
 */
export function estimateCost(
  modelId: string,
  tokensIn: number,
  tokensOut: number,
  cachedTokens = 0,
): number | null {
  const pricing = getModelPricing(modelId);
  if (!pricing) return null;

  const billableInput = tokensIn - cachedTokens;
  const cachedCost =
    (cachedTokens * (pricing.cachedInputPer1M ?? pricing.inputPer1M)) /
    1_000_000;
  const inputCost =
    (Math.max(billableInput, 0) * pricing.inputPer1M) / 1_000_000;
  const outputCost = (tokensOut * pricing.outputPer1M) / 1_000_000;

  return inputCost + outputCost + cachedCost;
}

/**
 * Estimate token count from character count.
 * Rule of thumb: ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Alert configuration ─────────────────────────────────────────────────────

/** Alert when current hour cost exceeds this multiple of 7-day average */
export const SPENDING_ANOMALY_MULTIPLIER = 3.0;

/** Alert when per-request cost deviates by this fraction from rolling baseline */
export const COST_DEVIATION_ALERT_THRESHOLD = 0.2;
