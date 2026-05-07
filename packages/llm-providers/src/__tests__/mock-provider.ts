/**
 * Mock LLM provider for tests.
 *
 * Deterministic, zero-cost, zero-latency LLM simulation.
 * Supports configurable responses, delays, and failure modes.
 *
 * Usage:
 *   const mock = new MockLlmProvider()
 *   mock.setResponse('claude-haiku-4-5', { text: 'test output' })
 *   const result = await mock.generate('claude-haiku-4-5', { prompt: 'hello' })
 */
import type {
  IModelProvider,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ProviderInfo,
} from "../IModelProvider.js";
import type { Result } from "@bureau/shared-kernel";
import { ok, err } from "@bureau/shared-kernel";

export interface MockResponse {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokens?: number;
  costUsd?: string;
  finishReason?: GenerateResult["finishReason"];
  /** If set, provider throws this error instead */
  error?: Error;
  /** Delay in ms before responding (for timeout tests) */
  delayMs?: number;
}

const DEFAULT_RESPONSE: MockResponse = {
  text: "Mock LLM response for testing.",
  tokensIn: 100,
  tokensOut: 20,
  cachedTokens: 0,
  costUsd: "0.00001",
  finishReason: "stop",
};

export class MockLlmProvider implements IModelProvider {
  private responses = new Map<string, MockResponse>();
  private callLog: Array<{ model: string; prompt: string; at: Date }> = [];
  private defaultResponse: MockResponse = { ...DEFAULT_RESPONSE };

  readonly info: ProviderInfo = {
    name: "mock",
    supportedModels: [
      "mock-economy",
      "mock-standard",
      "mock-premium",
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    defaultModel: "mock-standard",
    supportsStreaming: true,
    supportsPromptCaching: false,
  };

  /** Set response for a specific model */
  setResponse(model: string, response: Partial<MockResponse>): void {
    this.responses.set(model, { ...DEFAULT_RESPONSE, ...response });
  }

  /** Set default response for all models */
  setDefaultResponse(response: Partial<MockResponse>): void {
    this.defaultResponse = { ...DEFAULT_RESPONSE, ...response };
  }

  /** Make next call fail with given error */
  failNextCall(model: string, error: Error): void {
    this.responses.set(model, { ...DEFAULT_RESPONSE, error });
  }

  /** Get call log for assertions */
  getCalls(): Array<{ model: string; prompt: string; at: Date }> {
    return [...this.callLog];
  }

  /** Reset call log and responses */
  reset(): void {
    this.responses.clear();
    this.callLog = [];
    this.defaultResponse = { ...DEFAULT_RESPONSE };
  }

  supportsModel(modelId: string): boolean {
    return this.info.supportedModels.includes(modelId);
  }

  async generate(
    model: string,
    options: GenerateOptions,
  ): Promise<Result<GenerateResult, Error>> {
    this.callLog.push({ model, prompt: options.prompt, at: new Date() });

    const response = this.responses.get(model) ?? this.defaultResponse;

    if (response.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    if (options.signal?.aborted) {
      return err(new Error("AbortError: Request was aborted"));
    }

    if (response.error) {
      this.responses.delete(model);
      return err(response.error);
    }

    return ok({
      text: response.text,
      tokensIn: response.tokensIn ?? 100,
      tokensOut: response.tokensOut ?? 20,
      cachedTokens: response.cachedTokens ?? 0,
      costUsd: response.costUsd ?? "0.00001",
      modelUsed: model,
      finishReason: response.finishReason ?? "stop",
    });
  }

  async *generateStream(
    model: string,
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    this.callLog.push({ model, prompt: options.prompt, at: new Date() });

    const response = this.responses.get(model) ?? this.defaultResponse;

    if (response.error) {
      throw response.error;
    }

    const words = response.text.split(" ");
    for (const word of words) {
      if (options.signal?.aborted) {
        throw new Error("AbortError: Request was aborted");
      }
      yield { delta: `${word} `, done: false };
    }

    return {
      text: response.text,
      tokensIn: response.tokensIn ?? 100,
      tokensOut: response.tokensOut ?? 20,
      cachedTokens: response.cachedTokens ?? 0,
      costUsd: response.costUsd ?? "0.00001",
      modelUsed: model,
      finishReason: response.finishReason ?? "stop",
    };
  }
}

/** Shared singleton mock for use across tests in a describe block */
export function createMockProvider(
  responses?: Record<string, Partial<MockResponse>>,
): MockLlmProvider {
  const mock = new MockLlmProvider();
  if (responses) {
    for (const [model, response] of Object.entries(responses)) {
      mock.setResponse(model, response);
    }
  }
  return mock;
}
