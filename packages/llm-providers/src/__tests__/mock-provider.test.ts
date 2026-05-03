/**
 * Tests for MockLlmProvider — verify it behaves correctly for test usage
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockLlmProvider, createMockProvider } from './mock-provider.js'

describe('MockLlmProvider', () => {
  let mock: MockLlmProvider

  beforeEach(() => {
    mock = new MockLlmProvider()
  })

  describe('generate()', () => {
    it('returns default response for unknown model', async () => {
      const result = await mock.generate('mock-economy', { prompt: 'hello' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.text).toBe('Mock LLM response for testing.')
        expect(result.value.modelUsed).toBe('mock-economy')
        expect(result.value.finishReason).toBe('stop')
      }
    })

    it('returns configured response for model', async () => {
      mock.setResponse('mock-premium', { text: 'Premium response', tokensOut: 500 })
      const result = await mock.generate('mock-premium', { prompt: 'test' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.text).toBe('Premium response')
        expect(result.value.tokensOut).toBe(500)
      }
    })

    it('returns error when configured to fail', async () => {
      mock.failNextCall('mock-standard', new Error('Rate limit exceeded'))
      const result = await mock.generate('mock-standard', { prompt: 'test' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('Rate limit exceeded')
      }
    })

    it('respects AbortSignal', async () => {
      const controller = new AbortController()
      controller.abort()
      const result = await mock.generate('mock-economy', {
        prompt: 'test',
        signal: controller.signal,
      })
      expect(result.ok).toBe(false)
    })

    it('logs all calls', async () => {
      await mock.generate('mock-economy', { prompt: 'prompt 1' })
      await mock.generate('mock-standard', { prompt: 'prompt 2' })
      const calls = mock.getCalls()
      expect(calls).toHaveLength(2)
      expect(calls[0]?.model).toBe('mock-economy')
      expect(calls[1]?.model).toBe('mock-standard')
    })
  })

  describe('generateStream()', () => {
    it('yields word-by-word chunks', async () => {
      mock.setResponse('mock-standard', { text: 'Hello world test' })
      const chunks: string[] = []
      const gen = mock.generateStream('mock-standard', { prompt: 'test' })
      for await (const chunk of gen) {
        chunks.push(chunk.delta)
      }
      expect(chunks.join('').trim()).toBe('Hello world test')
    })

    it('throws when configured to fail', async () => {
      mock.failNextCall('mock-economy', new Error('Connection reset'))
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of mock.generateStream('mock-economy', { prompt: 'test' })) {
          // consume
        }
      }).rejects.toThrow('Connection reset')
    })
  })

  describe('supportsModel()', () => {
    it('returns true for supported models', () => {
      expect(mock.supportsModel('mock-economy')).toBe(true)
      expect(mock.supportsModel('claude-haiku-4-5')).toBe(true)
    })

    it('returns false for unsupported models', () => {
      expect(mock.supportsModel('gpt-99')).toBe(false)
    })
  })

  describe('reset()', () => {
    it('clears call log and responses', async () => {
      mock.setResponse('mock-economy', { text: 'custom' })
      await mock.generate('mock-economy', { prompt: 'test' })
      mock.reset()
      expect(mock.getCalls()).toHaveLength(0)
      const result = await mock.generate('mock-economy', { prompt: 'test' })
      if (result.ok) {
        expect(result.value.text).toBe('Mock LLM response for testing.')
      }
    })
  })

  describe('createMockProvider()', () => {
    it('initializes with preset responses', async () => {
      const provider = createMockProvider({
        'mock-premium': { text: 'Premium preset' },
      })
      const result = await provider.generate('mock-premium', { prompt: 'test' })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.text).toBe('Premium preset')
    })
  })
})
