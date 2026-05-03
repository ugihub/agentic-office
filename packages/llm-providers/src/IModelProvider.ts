/**
 * IModelProvider — abstraction over LLM providers.
 *
 * IMPORTANT: This abstraction was created AFTER two concrete implementations
 * (Claude + Gemini) were written. Per plan principle:
 * "Abstractions are found, not designed. Every generalization needs two concrete examples."
 *
 * Do NOT add new methods without at least two concrete use cases.
 */
import type { Result } from '@bureau/shared-kernel'

// ─── Core types ───────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** System prompt (optional) */
  system?: string | undefined
  /** User message / prompt */
  prompt: string
  /** Max output tokens */
  maxTokens?: number | undefined
  /** Temperature 0-1 (default: model-specific) */
  temperature?: number | undefined
  /** AbortSignal for cancellation */
  signal?: AbortSignal | undefined
  /** Enable streaming (default: false) */
  stream?: boolean | undefined
}

export interface GenerateResult {
  /** Full generated text */
  text: string
  /** Input tokens consumed */
  tokensIn: number
  /** Output tokens generated */
  tokensOut: number
  /** Tokens served from prompt cache */
  cachedTokens: number
  /** Actual cost in USD (calculated from pricing registry) */
  costUsd: string
  /** Model that actually served the request (may differ if fallback used) */
  modelUsed: string
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error'
}

export interface StreamChunk {
  delta: string
  done: boolean
}

export interface ProviderInfo {
  name: string
  supportedModels: readonly string[]
  defaultModel: string
  supportsStreaming: boolean
  supportsPromptCaching: boolean
}

// ─── IModelProvider ───────────────────────────────────────────────────────────

export interface IModelProvider {
  readonly info: ProviderInfo

  /**
   * Generate a response (non-streaming).
   * Must return Result<T, E> — never throw.
   */
  generate(
    model: string,
    options: GenerateOptions,
  ): Promise<Result<GenerateResult, Error>>

  /**
   * Generate a streaming response.
   * Yields text chunks as they arrive.
   * Must check signal.aborted before each chunk.
   */
  generateStream(
    model: string,
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown>

  /**
   * Check if this provider supports a given model.
   */
  supportsModel(modelId: string): boolean
}
