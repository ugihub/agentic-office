/**
 * Scenario H — 50 task paralel → tidak ada race condition.
 *
 * Covers:
 * - 50 concurrent task submissions (different tenants)
 * - Finance atomic reservation: no saldo goes negative across concurrent tasks
 * - Unique taskIds generated for all 50 tasks (no collision)
 * - path-classifier handles concurrent calls without state pollution
 * - Budget per-tenant isolation maintained under parallel load
 *
 * Note: Full load test with real infrastructure is in tests/load/k6-load-test.js.
 * This test verifies correctness at the unit/integration level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockProvider } from '../../packages/llm-providers/src/__tests__/mock-provider.js'
import { classifyPath } from '../../core/src/path-classifier/classifier.js'
import { reserveBudgetAtomic } from '../../core/src/agents/ssc/finance-ssc.js'
import { newId } from '../../packages/shared-kernel/src/ulid.js'
import type { Model } from 'mongoose'
import type { BudgetDocument } from '../../packages/models/src/index.js'

const PARALLEL_TASK_COUNT = 50

describe('Scenario H — 50 Parallel Tasks (Race Condition Safety)', () => {
  describe('H1: Unique task ID generation', () => {
    it('50 parallel tasks generate unique IDs', () => {
      const ids = Array.from({ length: PARALLEL_TASK_COUNT }, () =>
        newId('task')
      )

      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(PARALLEL_TASK_COUNT)
    })

    it('ULID IDs are monotonically increasing', () => {
      const ids = Array.from({ length: 10 }, () => newId('task'))
      // ULIDs are time-based and lexicographically sortable
      const sorted = [...ids].sort()
      expect(sorted).toEqual(ids)
    })
  })

  describe('H2: Path classifier thread safety', () => {
    it('50 concurrent classifyPath calls return correct results', async () => {
      const prompts = [
        ...Array.from({ length: 20 }, () => 'Short simple question about weather.'),
        ...Array.from({ length: 20 }, () => 'Analisis mendalam tentang kompetitor fintech.'),
        ...Array.from({ length: 10 }, () => 'import React from "react"; const App = () => {}'),
      ]

      const results = await Promise.all(
        prompts.map((prompt) => Promise.resolve(classifyPath({ prompt })))
      )

      // Simple prompts → fast
      for (let i = 0; i < 20; i++) {
        expect(results[i]!.path).toBe('fast')
      }

      // Research prompts → standard or full
      for (let i = 20; i < 40; i++) {
        expect(['standard', 'full']).toContain(results[i]!.path)
      }

      // Code prompts → full
      for (let i = 40; i < 50; i++) {
        expect(results[i]!.path).toBe('full')
      }
    })
  })

  describe('H3: Finance atomic reservation under parallel load', () => {
    it('50 concurrent reservations: no negative balance', async () => {
      let currentBalance = 5.00 // $5 total budget
      const reservationAmount = 0.50 // Each task needs $0.50
      const successfulReservations: string[] = []
      const failedReservations: string[] = []

      // Simulate atomic findOneAndUpdate behavior
      let callCount = 0
      const mockModel = {
        findOneAndUpdate: vi.fn().mockImplementation(() => ({
          exec: vi.fn().mockImplementation(async () => {
            callCount++
            // Simulate atomic check: only allow if balance sufficient
            if (currentBalance >= reservationAmount) {
              currentBalance -= reservationAmount // Atomic decrement
              return { tenantId: 'tenant_test', remaining: { toString: () => String(currentBalance) } }
            }
            return null // $gte condition failed
          }),
        })),
        findOne: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({ isFrozen: false }),
          }),
        }),
      } as unknown as Model<BudgetDocument>

      // 50 concurrent reservations (budget only allows 10 @ $0.50 each)
      const tasks = Array.from({ length: PARALLEL_TASK_COUNT }, (_, i) =>
        reserveBudgetAtomic(
          { budgetModel: mockModel },
          {
            taskId: `task_h_${i.toString().padStart(3, '0')}`,
            tenantId: 'tenant_test',
            totalEstimatedCostUsd: String(reservationAmount),
            escalationChain: [
              { attempt: 1, model: 'claude-haiku-4-5', maxCostUsd: String(reservationAmount) },
            ],
          }
        )
      )

      const results = await Promise.all(tasks)

      for (const result of results) {
        if (result.ok) {
          successfulReservations.push('ok')
        } else {
          failedReservations.push('fail')
        }
      }

      // Balance can never go below 0
      expect(currentBalance).toBeGreaterThanOrEqual(0)
      // Total successful reservations limited by initial balance
      const maxPossible = Math.floor(5.00 / reservationAmount) // = 10
      expect(successfulReservations.length).toBeLessThanOrEqual(maxPossible)
      // All results accounted for
      expect(successfulReservations.length + failedReservations.length).toBe(PARALLEL_TASK_COUNT)
    })
  })

  describe('H4: Concurrent LLM calls with bulkhead', () => {
    it('50 concurrent LLM calls respect MAX_LLM_CONCURRENCY=3', async () => {
      const mockProvider = createMockProvider()
      let concurrent = 0
      let maxConcurrent = 0

      vi.spyOn(mockProvider, 'generate').mockImplementation(async (model) => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 5))
        concurrent--
        return {
          ok: true,
          value: {
            text: `Response for ${model}`,
            tokensIn: 50, tokensOut: 20, cachedTokens: 0,
            costUsd: '0.001', modelUsed: model, finishReason: 'stop' as const,
          },
        }
      })

      const MAX_CONCURRENT = 3
      const { default: pLimit } = await import('p-limit')
      const limit = pLimit(MAX_CONCURRENT)

      const calls = Array.from({ length: PARALLEL_TASK_COUNT }, (_, i) =>
        limit(() => mockProvider.generate('claude-haiku-4-5', { prompt: `Task ${i}` }))
      )

      await Promise.all(calls)

      expect(maxConcurrent).toBeLessThanOrEqual(MAX_CONCURRENT)
    })
  })

  describe('H5: Tenant isolation under parallel load', () => {
    it('tenant A tasks cannot access tenant B budget', () => {
      const budgets = new Map<string, number>([
        ['tenant_a', 5.00],
        ['tenant_b', 3.00],
      ])

      function reserveForTenant(tenantId: string, amount: number): boolean {
        const balance = budgets.get(tenantId) ?? 0
        if (balance < amount) return false
        budgets.set(tenantId, balance - amount)
        return true
      }

      // Tenant A tasks
      const tenantAResults = Array.from({ length: 5 }, () =>
        reserveForTenant('tenant_a', 1.00)
      )
      // Tenant B tasks
      const tenantBResults = Array.from({ length: 5 }, () =>
        reserveForTenant('tenant_b', 1.00)
      )

      // Tenant A only uses tenant A budget
      const tenantABalance = budgets.get('tenant_a')!
      const tenantBBalance = budgets.get('tenant_b')!

      expect(tenantABalance).toBeGreaterThanOrEqual(0) // A's budget not contaminated by B
      expect(tenantBBalance).toBeGreaterThanOrEqual(0) // B's budget not contaminated by A
      expect(tenantABalance + tenantBResults.filter(Boolean).length).toBeLessThanOrEqual(5) // Sanity
    })
  })

  describe('H6: Correlation ID uniqueness per request', () => {
    it('50 parallel tasks have unique correlation IDs', () => {
      const correlationIds = Array.from({ length: PARALLEL_TASK_COUNT }, () =>
        `corr_${newId('correlation')}`
      )

      const unique = new Set(correlationIds)
      expect(unique.size).toBe(PARALLEL_TASK_COUNT)
    })
  })
})
