/**
 * BureauClient unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BureauClient, BureauError } from '../client.js'

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
  })
}

function mockErrorResponse(status: number, body = 'Error') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    statusText: 'Error',
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BureauClient', () => {
  let client: BureauClient

  beforeEach(() => {
    client = new BureauClient({
      baseUrl: 'http://localhost:3001',
      apiKey: 'bureau_live_testkey',
      timeout: 5000,
    })
    mockFetch.mockClear()
  })

  describe('constructor', () => {
    it('sets X-Api-Key header', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Submitted' })
      await client.submitTask({ prompt: 'test' })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['X-Api-Key']).toBe('bureau_live_testkey')
    })

    it('sets Authorization header for JWT', async () => {
      const jwtClient = new BureauClient({
        baseUrl: 'http://localhost:3001',
        jwt: 'eyJhbGci...',
      })
      mockResponse({ taskId: 'task_001', currentStage: 'Submitted' })
      await jwtClient.submitTask({ prompt: 'test' })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer eyJhbGci...')
    })
  })

  describe('submitTask()', () => {
    it('POSTs to /api/v1/tasks', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Submitted' })
      await client.submitTask({ prompt: 'Write a report' })

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('http://localhost:3001/api/v1/tasks')
      expect(init.method).toBe('POST')
    })

    it('includes prompt in body', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Submitted' })
      await client.submitTask({ prompt: 'My prompt', outputFormat: 'json' })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['prompt']).toBe('My prompt')
      expect(body['outputFormat']).toBe('json')
    })

    it('includes Idempotency-Key when provided', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Submitted' })
      await client.submitTask({
        prompt: 'test',
        idempotencyKey: 'idem_key_001',
      })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['Idempotency-Key']).toBe('idem_key_001')
    })

    it('throws BureauError on 4xx', async () => {
      mockErrorResponse(401, 'Unauthorized')
      await expect(client.submitTask({ prompt: 'test' })).rejects.toThrow(BureauError)
    })

    it('throws BureauError with status code', async () => {
      mockErrorResponse(429, 'Rate limit exceeded')
      try {
        await client.submitTask({ prompt: 'test' })
      } catch (e) {
        expect(e).toBeInstanceOf(BureauError)
        expect((e as BureauError).status).toBe(429)
      }
    })
  })

  describe('getTaskStatus()', () => {
    it('GETs /api/v1/tasks/:taskId/status', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Producing' })
      await client.getTaskStatus('task_001')

      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe('http://localhost:3001/api/v1/tasks/task_001/status')
    })
  })

  describe('listTasks()', () => {
    it('unwraps paginated server response', async () => {
      mockResponse({ tasks: [{ taskId: 'task_001', currentStage: 'Completed' }] })
      const tasks = await client.listTasks()

      expect(tasks).toHaveLength(1)
      expect(tasks[0]?.taskId).toBe('task_001')
    })
  })

  describe('cancelTask()', () => {
    it('POSTs to /api/v1/tasks/:taskId/cancel', async () => {
      mockResponse({ cancelled: true })
      await client.cancelTask('task_001')

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/tasks/task_001/cancel')
      expect(init.method).toBe('POST')
    })
  })

  describe('submitDecision()', () => {
    it('POSTs decision to correct endpoint', async () => {
      mockResponse({ accepted: true })
      await client.submitDecision('task_001', 'best_effort')

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/tasks/task_001/decision')
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['action']).toBe('best_effort')
    })
  })

  describe('submitFeedback()', () => {
    it('POSTs rating to feedback endpoint', async () => {
      mockResponse({ recorded: true })
      await client.submitFeedback('task_001', 4, 'Great output')

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/tasks/task_001/feedback')
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['rating']).toBe(4)
      expect(body['comment']).toBe('Great output')
    })
  })

  describe('listApiKeys()', () => {
    it('GETs /api/v1/auth/keys', async () => {
      mockResponse([])
      await client.listApiKeys()

      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe('http://localhost:3001/api/v1/auth/keys')
    })

    it('unwraps server keys response', async () => {
      mockResponse({ keys: [{ keyId: 'key_001', name: 'test', keyPrefix: 'bureau_live' }] })
      const keys = await client.listApiKeys()

      expect(keys).toHaveLength(1)
      expect(keys[0]?.keyId).toBe('key_001')
    })
  })

  describe('createApiKey()', () => {
    it('POSTs to /api/v1/auth/keys', async () => {
      mockResponse({ plaintext: 'bureau_live_xxx', keyId: 'key_001', name: 'test', keyPrefix: 'bureau_live', permissions: [] })
      await client.createApiKey({ name: 'Test Key' })

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/auth/keys')
      expect(init.method).toBe('POST')
    })

    it('normalizes legacy prefix field to keyPrefix', async () => {
      mockResponse({ plaintext: 'bureau_live_xxx', keyId: 'key_001', name: 'test', prefix: 'bureau_live', permissions: [] })
      const result = await client.createApiKey({ name: 'Test Key' })

      expect(result.keyPrefix).toBe('bureau_live')
    })
  })

  describe('waitForTask()', () => {
    it('polls until terminal state', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Producing', finalOutput: null })
      mockResponse({ taskId: 'task_001', currentStage: 'Completed', finalOutput: 'Done!', costUsd: '0.01' })

      const result = await client.waitForTask('task_001', { intervalMs: 1 })
      expect(result.currentStage).toBe('Completed')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws on Failed state', async () => {
      mockResponse({ taskId: 'task_001', currentStage: 'Failed', finalOutput: null })
      await expect(client.waitForTask('task_001', { intervalMs: 1 })).rejects.toThrow(BureauError)
    })

    it('calls onStatus callback on each poll', async () => {
      const onStatus = vi.fn()
      mockResponse({ taskId: 'task_001', currentStage: 'Producing', finalOutput: null })
      mockResponse({ taskId: 'task_001', currentStage: 'Completed', finalOutput: 'Done!', costUsd: '0.01' })

      await client.waitForTask('task_001', { intervalMs: 1, onStatus })
      expect(onStatus).toHaveBeenCalledTimes(2)
    })
  })
})
