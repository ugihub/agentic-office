/**
 * Path Classifier — rule-based, NO LLM call.
 *
 * DESIGN: LLM call to classify = overhead at high load.
 * Rule-based classifier for fast/standard paths.
 * LLM confidence only for borderline standard↔full edge cases.
 *
 * Finance SSC ALWAYS involved — even fast path.
 * Fast path is NOT a budget-skip.
 *
 * @see ADR-003: fast-path-classifier
 */
import type { ExecutionPath } from "@bureau/contracts";

export interface ClassifierInput {
  prompt: string;
  /** Estimated token count (rough: chars/4) */
  estimatedTokens?: number;
}

export interface ClassifierResult {
  path: ExecutionPath;
  /** Backward-compatible top-level estimate for API/test consumers. */
  estimatedTokens: number;
  signals: {
    hasCode: boolean;
    hasResearch: boolean;
    hasTemporal: boolean;
    tokenCount: number;
  };
}

/**
 * Fast heuristic token estimator (chars / 4).
 * Good enough for fast path gating — not for billing.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CODE_SIGNALS =
  /```|function |class |import |SELECT |CREATE |INSERT |DELETE |UPDATE |export |const |async /;

const RESEARCH_SIGNALS =
  /analisis|riset|bandingkan|tren|kompetitor|data|statistik|penelitian|survey|laporan|perbandingan|analysis|research|compare|trend|competitor|statistics|report/i;

const TEMPORAL_SIGNALS =
  /hari ini|terbaru|sekarang|minggu ini|terkini|bulan ini|kemarin|recent|latest|current|today|this week|this month|yesterday/i;

const FINANCIAL_SIGNALS =
  /harga|price|kurs|saham|crypto|bitcoin|stock|nilai tukar|exchange rate|forex|cryptocurrency/i;

const FAST_PATH_MAX_TOKENS = 80;
const FULL_RESEARCH_MIN_TOKENS = 120;

/**
 * Classify a prompt into execution path.
 *
 * fast: ≤150 tokens, no code, no research signals, no temporal signals
 * full: has code OR (has research AND >300 tokens)
 * standard: everything in between
 *
 * Financial signals → TTL = 0 for cache (separate concern, not path)
 */
export function classifyPath(input: ClassifierInput): ClassifierResult {
  const tokens = input.estimatedTokens ?? estimateTokens(input.prompt);
  const hasCode = CODE_SIGNALS.test(input.prompt);
  const hasResearch = RESEARCH_SIGNALS.test(input.prompt);
  const hasTemporal = TEMPORAL_SIGNALS.test(input.prompt);

  let path: ExecutionPath;

  if (
    !hasCode &&
    !hasResearch &&
    !hasTemporal &&
    tokens < FAST_PATH_MAX_TOKENS
  ) {
    path = "fast";
  } else if (hasCode || (hasResearch && tokens >= FULL_RESEARCH_MIN_TOKENS)) {
    path = "full";
  } else {
    path = "standard";
  }

  return {
    path,
    estimatedTokens: tokens,
    signals: { hasCode, hasResearch, hasTemporal, tokenCount: tokens },
  };
}

/**
 * Classify the prompt cache category for TTL determination.
 * Run this on EVERY request — not just in tests.
 * financial → TTL = 0 (hard constraint, cannot be overridden by tenant)
 */
export type CacheCategory =
  | "financial"
  | "temporal"
  | "personnel"
  | "inventory"
  | "default";

export function classifyCacheCategory(prompt: string): CacheCategory {
  if (FINANCIAL_SIGNALS.test(prompt)) return "financial";
  if (
    /CEO|CTO|direktur|presiden|kepala|pemimpin|director|president|leader/i.test(
      prompt,
    )
  )
    return "personnel";
  if (TEMPORAL_SIGNALS.test(prompt)) return "temporal";
  if (/tersedia|available|stok|stock|inventory/i.test(prompt))
    return "inventory";
  return "default";
}

/** TTL floor per category (seconds). Cannot be lowered by tenant. */
export const SYSTEM_FLOOR_TTL: Record<CacheCategory, number> = {
  financial: 0, // NEVER cached
  temporal: 60, // min 1 minute
  personnel: 3600, // min 1 hour
  inventory: 300, // min 5 minutes
  default: 3600, // min 1 hour
};

/** TTL max per category. Tenant can increase up to this, not beyond. */
export const TENANT_MAX_TTL: Record<CacheCategory, number> = {
  financial: 0, // no override for financial
  temporal: 600, // max 10 minutes
  personnel: 86400, // max 24 hours
  inventory: 3600, // max 1 hour
  default: 604800, // max 7 days
};
