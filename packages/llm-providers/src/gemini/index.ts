/**
 * Gemini provider — Google via Vercel AI SDK.
 *
 * Concrete implementation. IModelProvider abstraction was built after
 * comparing this with Claude provider to find the common contract.
 *
 * Supports:
 * - gemini-2.5-flash-lite (economy)
 * - gemini-2.5-flash (economy/balanced)
 * - gemini-2.5-pro (standard)
 *
 * Note: Gemini does NOT support prompt caching the same way as Anthropic.
 * cachedTokens will always be 0.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, streamText } from 'ai'
import { ok, err } from '@bureau/shared-kernel'
import { createLogger } from '@bureau/telemetry'
import type { IModelProvider, GenerateOptions, GenerateResult, StreamChunk, ProviderInfo } from '../IModelProvider.js'
import type { Result } from '@bureau/shared-kernel'
import { estimateCost } from '../pricing.config.js'

const log = createLogger({ division: 'Production' })

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
] as const

type GeminiModel = typeof GEMINI_MODELS[number]

function isGeminiModel(modelId: string): modelId is GeminiModel {
  return (GEMINI_MODELS as readonly string[]).includes(modelId)
}

export class GeminiProvider implements IModelProvider {
  private readonly google

  readonly info: ProviderInfo = {
    name: 'google',
    supportedModels: GEMINI_MODELS,
    defaultModel: 'gemini-2.5-flash',
    supportsStreaming: true,
    supportsPromptCaching: false,
  }

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY']
    if (!key) {
      log.warn({}, 'GEMINI_API_KEY not set — Gemini provider will fail at runtime')
    }
    this.google = createGoogleGenerativeAI({ apiKey: key ?? '' })
  }

  supportsModel(modelId: string): boolean {
    return isGeminiModel(modelId)
  }

  async generate(
    model: string,
    options: GenerateOptions,
  ): Promise<Result<GenerateResult, Error>> {
    if (!isGeminiModel(model)) {
      return err(new Error(`Gemini provider does not support model: ${model}`))
    }

    if (options.signal?.aborted) {
      return err(new Error('Request cancelled before LLM call'))
    }

    log.info({ model, promptLen: options.prompt.length }, 'Gemini generate start')

    try {
      const response = await generateText({
        model: this.google(model),
        system: options.system,
        prompt: options.prompt,
        maxTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        abortSignal: options.signal,
      })

      const tokensIn = response.usage.promptTokens
      const tokensOut = response.usage.completionTokens
      const cachedTokens = 0 // Gemini doesn't surface cached token count via Vercel SDK

      const costUsd = estimateCost(model, tokensIn, tokensOut, cachedTokens)

      log.info(
        { model, tokensIn, tokensOut, costUsd },
        'Gemini generate complete',
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
      log.error({ model, err: error.message }, 'Gemini generate failed')
      return err(error)
    }
  }

  async *generateStream(
    model: string,
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    if (!isGeminiModel(model)) {
      throw new Error(`Gemini provider does not support model: ${model}`)
    }

    if (options.signal?.aborted) {
      throw new Error('Request cancelled before streaming')
    }

    log.info({ model }, 'Gemini stream start')

    const response = await streamText({
      model: this.google(model),
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

    const usage = await response.usage
    const tokensIn = usage.promptTokens
    const tokensOut = usage.completionTokens
    const costUsd = estimateCost(model, tokensIn, tokensOut, 0)

    return {
      text: await response.text,
      tokensIn,
      tokensOut,
      cachedTokens: 0,
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
