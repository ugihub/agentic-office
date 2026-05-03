/**
 * Claude provider — Anthropic via Vercel AI SDK.
 *
 * Concrete implementation written BEFORE IModelProvider abstraction.
 * Supports:
 * - claude-haiku-4-5-20251001 (economy)
 * - claude-sonnet-4-6 (standard)
 * - claude-opus-4-6 (premium)
 *
 * Features:
 * - Prompt caching (cachedTokens tracked)
 * - Streaming via generateStream
 * - AbortSignal support
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, streamText } from 'ai'
import { ok, err } from '@bureau/shared-kernel'
import { createLogger } from '@bureau/telemetry'
import type { IModelProvider, GenerateOptions, GenerateResult, StreamChunk, ProviderInfo } from '../IModelProvider.js'
import type { Result } from '@bureau/shared-kernel'
import { estimateCost } from '../pricing.config.js'

const log = createLogger({ division: 'Production' })

const CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
] as const

type ClaudeModel = typeof CLAUDE_MODELS[number]

function isClaudeModel(modelId: string): modelId is ClaudeModel {
  return (CLAUDE_MODELS as readonly string[]).includes(modelId)
}

export class ClaudeProvider implements IModelProvider {
  private readonly anthropic

  readonly info: ProviderInfo = {
    name: 'anthropic',
    supportedModels: CLAUDE_MODELS,
    defaultModel: 'claude-sonnet-4-6',
    supportsStreaming: true,
    supportsPromptCaching: true,
  }

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['ANTHROPIC_API_KEY']
    if (!key) {
      log.warn({}, 'ANTHROPIC_API_KEY not set — Claude provider will fail at runtime')
    }
    this.anthropic = createAnthropic({ apiKey: key ?? '' })
  }

  supportsModel(modelId: string): boolean {
    return isClaudeModel(modelId)
  }

  async generate(
    model: string,
    options: GenerateOptions,
  ): Promise<Result<GenerateResult, Error>> {
    if (!isClaudeModel(model)) {
      return err(new Error(`Claude provider does not support model: ${model}`))
    }

    if (options.signal?.aborted) {
      return err(new Error('Request cancelled before LLM call'))
    }

    log.info({ model, promptLen: options.prompt.length }, 'Claude generate start')

    try {
      const response = await generateText({
        model: this.anthropic(model),
        system: options.system,
        prompt: options.prompt,
        maxTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        abortSignal: options.signal,
        experimental_providerMetadata: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      })

      const tokensIn = response.usage.promptTokens
      const tokensOut = response.usage.completionTokens
      // Vercel AI SDK exposes cached tokens via providerMetadata
      const cachedTokens =
        (response.experimental_providerMetadata?.['anthropic']?.['cacheReadInputTokens'] as number | undefined) ?? 0

      const costUsd = estimateCost(model, tokensIn, tokensOut, cachedTokens)

      log.info(
        { model, tokensIn, tokensOut, cachedTokens, costUsd },
        'Claude generate complete',
      )

      return ok({
        text: response.text,
        tokensIn,
        tokensOut,
        cachedTokens,
        costUsd: costUsd?.toFixed(6) ?? '0',
        modelUsed: model,
        finishReason: mapFinishReason(response.finishReason),
      })
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      log.error({ model, err: error.message }, 'Claude generate failed')
      return err(error)
    }
  }

  async *generateStream(
    model: string,
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    if (!isClaudeModel(model)) {
      throw new Error(`Claude provider does not support model: ${model}`)
    }

    if (options.signal?.aborted) {
      throw new Error('Request cancelled before streaming')
    }

    log.info({ model }, 'Claude stream start')

    const response = await streamText({
      model: this.anthropic(model),
      system: options.system,
      prompt: options.prompt,
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      abortSignal: options.signal,
    })

    for await (const chunk of response.textStream) {
      if (options.signal?.aborted) {
        yield { delta: '', done: true }
        break
      }
      yield { delta: chunk, done: false }
    }

    // Final chunk with usage
    const usage = await response.usage
    const tokensIn = usage.promptTokens
    const tokensOut = usage.completionTokens
    const cachedTokens =
      (response.experimental_providerMetadata?.then !== undefined ? 0 : 0)

    const costUsd = estimateCost(model, tokensIn, tokensOut, cachedTokens)

    return {
      text: await response.text,
      tokensIn,
      tokensOut,
      cachedTokens,
      costUsd: costUsd?.toFixed(6) ?? '0',
      modelUsed: model,
      finishReason: 'stop',
    }
  }
}

function mapFinishReason(
  reason: string | undefined,
): GenerateResult['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'content-filter':
      return 'content_filter'
    default:
      return 'stop'
  }
}
