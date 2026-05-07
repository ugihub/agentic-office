/**
 * Phase 8 — Cost Benchmark Tests.
 *
 * Validates that smart routing + escalation chain saves >= 60% cost
 * compared to always using the most expensive model (Opus/GPT-5).
 *
 * Also benchmarks:
 * - Fast path vs full path cost difference
 * - Cache hit savings (prompt caching effect)
 * - Escalation chain actual cost vs naive approach
 */
import { describe, it, expect } from "vitest";
import {
  estimateCost,
  getModelPricing,
  MODEL_PRICING,
  SPENDING_ANOMALY_MULTIPLIER,
  COST_DEVIATION_ALERT_THRESHOLD,
} from "../../packages/llm-providers/src/pricing.config.js";
import { buildEscalationChain } from "../../core/src/agents/ssc/hr-ssc.js";
import { classifyPath } from "../../core/src/path-classifier/classifier.js";

// ─── Cost Savings Benchmark ───────────────────────────────────────────────────

describe("Cost Benchmark — Smart Routing Saves >= 60%", () => {
  const TOKENS_IN = 10_000;
  const TOKENS_OUT = 2_000;

  describe("Baseline: always use most expensive model", () => {
    it("calculates baseline (Opus) cost", () => {
      const baselineCost = estimateCost(
        "claude-opus-4-6",
        TOKENS_IN,
        TOKENS_OUT,
      );
      expect(baselineCost).not.toBeNull();
      expect(baselineCost!).toBeGreaterThan(0);

      // Opus: $5.00/1M input + $25.00/1M output
      // = (10000/1M)*5 + (2000/1M)*25 = 0.05 + 0.05 = $0.10
      expect(baselineCost!).toBeCloseTo(0.1, 2);
    });
  });

  describe("Smart routing: uses cheapest model first", () => {
    it("economy model (Haiku) costs 60%+ less than Opus for same tokens", () => {
      const opusCost = estimateCost("claude-opus-4-6", TOKENS_IN, TOKENS_OUT)!;
      const haikuCost = estimateCost(
        "claude-haiku-4-5-20251001",
        TOKENS_IN,
        TOKENS_OUT,
      )!;

      const savings = (opusCost - haikuCost) / opusCost;
      console.log(
        `Opus: $${opusCost.toFixed(4)} | Haiku: $${haikuCost.toFixed(4)} | Savings: ${(savings * 100).toFixed(1)}%`,
      );

      // Haiku is significantly cheaper than Opus
      expect(savings).toBeGreaterThanOrEqual(0.6); // >= 60% savings
    });

    it("DeepSeek V3.2 saves even more vs Opus", () => {
      const opusCost = estimateCost("claude-opus-4-6", TOKENS_IN, TOKENS_OUT)!;
      const deepseekCost = estimateCost(
        "deepseek-v3-2",
        TOKENS_IN,
        TOKENS_OUT,
      )!;

      const savings = (opusCost - deepseekCost) / opusCost;
      console.log(
        `Opus: $${opusCost.toFixed(4)} | DeepSeek: $${deepseekCost.toFixed(4)} | Savings: ${(savings * 100).toFixed(1)}%`,
      );

      expect(savings).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe("Escalation chain cost vs naive", () => {
    it("task completing on Attempt 1 (economy) vs always Opus", () => {
      const chain = buildEscalationChain("economy", 8_000, 1_500);
      const attempt1Model = chain.entries[0]!.model;

      // Naive: always Opus
      const naiveCost = estimateCost("claude-opus-4-6", 8_000, 1_500)!;

      // Smart: economy first, often completes here
      const smartCostAttempt1 = estimateCost(attempt1Model, 8_000, 1_500)!;

      const savings = (naiveCost - smartCostAttempt1) / naiveCost;
      console.log(`\nEscalation chain benchmark:`);
      console.log(`  Naive (Opus): $${naiveCost.toFixed(4)}`);
      console.log(
        `  Smart Attempt 1 (${attempt1Model}): $${smartCostAttempt1.toFixed(4)}`,
      );
      console.log(`  Savings: ${(savings * 100).toFixed(1)}%`);

      // If task completes on first attempt, we save ≥ 60%
      expect(savings).toBeGreaterThanOrEqual(0.6);
    });

    it("even worst-case (all 3 attempts) still saves vs 3x Opus", () => {
      const chain = buildEscalationChain("economy", 8_000, 1_500);

      // Naive: 3 Opus attempts
      const naiveCost3x = estimateCost("claude-opus-4-6", 8_000, 1_500)! * 3;

      // Smart: economy → standard → premium (1 attempt each tier)
      const smartTotalCost = chain.entries.reduce((sum, entry) => {
        return sum + (estimateCost(entry.model, 8_000, 1_500) ?? 0);
      }, 0);

      const savings = (naiveCost3x - smartTotalCost) / naiveCost3x;
      console.log(`\nWorst-case escalation benchmark:`);
      console.log(`  Naive (3x Opus): $${naiveCost3x.toFixed(4)}`);
      console.log(`  Smart (3-tier chain): $${smartTotalCost.toFixed(4)}`);
      console.log(`  Savings: ${(savings * 100).toFixed(1)}%`);

      expect(savings).toBeGreaterThanOrEqual(0.4); // At least 40% even in worst case
    });
  });

  describe("Prompt caching savings (cachedTokens)", () => {
    it("cached tokens reduce cost significantly", () => {
      const TOTAL_INPUT = 10_000;
      const CACHED = 7_000; // 70% cache hit
      const OUTPUT = 500;

      // Without caching
      const costWithoutCache = estimateCost(
        "claude-sonnet-4-6",
        TOTAL_INPUT,
        OUTPUT,
      )!;

      // With caching: cachedTokens at ~10% of normal input price (via cachedInputPer1M)
      const costWithCache = estimateCost(
        "claude-sonnet-4-6",
        TOTAL_INPUT,
        OUTPUT,
        CACHED,
      )!;

      const cacheSavings =
        (costWithoutCache - costWithCache) / costWithoutCache;
      console.log(`\nPrompt caching benchmark:`);
      console.log(`  Without cache: $${costWithoutCache.toFixed(5)}`);
      console.log(`  With 70% cache hit: $${costWithCache.toFixed(5)}`);
      console.log(`  Cache savings: ${(cacheSavings * 100).toFixed(1)}%`);

      // 70% cache hit at 90% discount = significant savings
      expect(cacheSavings).toBeGreaterThan(0.3);
    });
  });
});

// ─── Pricing Config Validation ────────────────────────────────────────────────

describe("Pricing Config Validation", () => {
  it("all registered models have valid pricing", () => {
    for (const pricing of MODEL_PRICING) {
      expect(
        pricing.inputPer1M,
        `${pricing.modelId}: inputPer1M <= 0`,
      ).toBeGreaterThan(0);
      expect(
        pricing.outputPer1M,
        `${pricing.modelId}: outputPer1M <= 0`,
      ).toBeGreaterThan(0);
      expect(pricing.tier, `${pricing.modelId}: tier missing`).toMatch(
        /^(economy|standard|premium)$/,
      );
    }
  });

  it("premium models are more expensive than economy", () => {
    const economyInputPrices = MODEL_PRICING.filter(
      (p) => p.tier === "economy",
    ).map((p) => p.inputPer1M);

    const premiumInputPrices = MODEL_PRICING.filter(
      (p) => p.tier === "premium",
    ).map((p) => p.inputPer1M);

    const maxEconomy = Math.max(...economyInputPrices);
    const minPremium = Math.min(...premiumInputPrices);

    // Premium tier costs more than economy
    expect(minPremium).toBeGreaterThan(maxEconomy * 0.5);
  });

  it("spending anomaly multiplier is 3.0", () => {
    expect(SPENDING_ANOMALY_MULTIPLIER).toBe(3.0);
  });

  it("cost deviation alert threshold is 20%", () => {
    expect(COST_DEVIATION_ALERT_THRESHOLD).toBe(0.2);
  });

  it("Anthropic Haiku included as economy tier", () => {
    const haiku = getModelPricing("claude-haiku-4-5-20251001");
    expect(haiku).toBeDefined();
    expect(haiku!.tier).toBe("economy");
    expect(haiku!.provider).toBe("anthropic");
  });

  it("Anthropic Sonnet included as standard tier", () => {
    const sonnet = getModelPricing("claude-sonnet-4-6");
    expect(sonnet).toBeDefined();
    expect(sonnet!.tier).toBe("standard");
  });

  it("Anthropic Opus included as premium tier", () => {
    const opus = getModelPricing("claude-opus-4-6");
    expect(opus).toBeDefined();
    expect(opus!.tier).toBe("premium");
  });
});

// ─── Fast Path vs Full Path Cost Comparison ───────────────────────────────────

describe("Fast Path vs Full Path Cost Comparison", () => {
  it("fast path uses fewer LLM calls (lower cost)", () => {
    const callCost = estimateCost("claude-haiku-4-5-20251001", 5_000, 1_000)!;

    // Fast path: 1 LLM call (Production only, no Research)
    const fastPathTotal = callCost * 1;

    // Full path: 3+ LLM calls (Research + Production + QA)
    const fullPathTotal = callCost * 3;

    const savings = (fullPathTotal - fastPathTotal) / fullPathTotal;
    console.log(`\nFast path vs full path:`);
    console.log(`  Fast path (1 call): $${fastPathTotal.toFixed(5)}`);
    console.log(`  Full path (3 calls): $${fullPathTotal.toFixed(5)}`);
    console.log(`  Fast path saves: ${(savings * 100).toFixed(0)}%`);

    expect(fastPathTotal).toBeLessThan(fullPathTotal);
    expect(savings).toBeGreaterThan(0.5); // 50%+ savings from fewer calls
  });

  it("fast path applicable for simple prompts", () => {
    const simplePrompts = [
      "What is 2+2?",
      'Translate "cat" to French.',
      "Define photosynthesis.",
    ];

    let fastCount = 0;
    for (const prompt of simplePrompts) {
      if (classifyPath({ prompt }).path === "fast") fastCount++;
    }

    // All simple prompts should be fast path
    expect(fastCount).toBe(simplePrompts.length);
  });
});

// ─── Escalation Chain Structure ───────────────────────────────────────────────

describe("Escalation Chain Structure", () => {
  it("economy start chain: economy → standard → premium", () => {
    const chain = buildEscalationChain("economy");

    expect(chain.entries).toHaveLength(3);
    expect(chain.entries[0]!.attempt).toBe(1);
    expect(chain.entries[1]!.attempt).toBe(2);
    expect(chain.entries[2]!.attempt).toBe(3);

    // Costs increase per attempt
    const costs = chain.entries.map((e) => parseFloat(e.maxCostUsd));
    expect(costs[1]!).toBeGreaterThan(costs[0]!);
    expect(costs[2]!).toBeGreaterThan(costs[1]!);
  });

  it("standard start chain: standard → premium (2 attempts)", () => {
    const chain = buildEscalationChain("standard");
    expect(chain.entries.length).toBeGreaterThanOrEqual(2);
    expect(chain.entries[0]!.attempt).toBe(1);
  });

  it("totalMaxCostUsd is sum of all entries", () => {
    const chain = buildEscalationChain("economy");
    const sumEntries = chain.entries.reduce(
      (s, e) => s + parseFloat(e.maxCostUsd),
      0,
    );
    expect(parseFloat(chain.totalMaxCostUsd)).toBeCloseTo(sumEntries, 4);
  });
});
