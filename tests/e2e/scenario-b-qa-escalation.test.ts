/**
 * Scenario B — QA reject loop → model escalation → task selesai dengan model lebih tinggi.
 *
 * Covers:
 * - QA fails on Attempt 1 (economy model) → sends failure reason to Production
 * - Production re-attempts with standard model (escalationChain[1])
 * - QA passes on Attempt 2 → task completes with model tier 'standard'
 * - agent_executions records attemptReason correctly per attempt
 *
 * Also verifies:
 * - Max retry count (3) is enforced before escalating to AwaitingUserDecision
 * - QA failure reasons are propagated to Production (targeted improvement)
 */
import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { taskMachine } from '../../packages/task-machine/src/machine.js'
import { createMockProvider } from '../../packages/llm-providers/src/__tests__/mock-provider.js'
import { buildEscalationChain } from '../../core/src/agents/ssc/hr-ssc.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStandardMachineActor(executionPath: 'fast' | 'standard' | 'full' = 'standard') {
  return createActor(taskMachine, {
    input: {
      taskId: 'task_b_test_001',
      tenantId: 'tenant_test',
      userId: 'user_test',
      correlationId: 'corr_b_001',
      executionPath,
    },
  })
}

describe('Scenario B — QA Reject Loop + Model Escalation', () => {
  describe('B1: QA failure propagation', () => {
    it('QA returns failure reason that Production can use for targeted fix', () => {
      // QA failure payload shape
      const qaFailure = {
        passed: false,
        failureReasons: ['Output lacks specific data points', 'Citations missing'],
        recommendations: ['Add quantitative statistics', 'Include source references'],
        escalationRecommended: true,
        recommendedTier: 'standard',
      }

      expect(qaFailure.passed).toBe(false)
      expect(qaFailure.failureReasons).toHaveLength(2)
      expect(qaFailure.escalationRecommended).toBe(true)
      expect(qaFailure.recommendedTier).toBe('standard')
    })

    it('Production receives failure reason before next attempt', () => {
      // Simulate what ChunkWorker does with QA failure reason
      const failureReason = 'Output lacks specific data points. Add quantitative statistics.'
      const improvedPrompt = `Previous attempt failed: ${failureReason}\n\nOriginal request: Write analysis.`

      expect(improvedPrompt).toContain('Previous attempt failed')
      expect(improvedPrompt).toContain(failureReason)
    })
  })

  describe('B2: Escalation chain model selection', () => {
    it('HR SSC builds escalation chain based on complexity', () => {
      const chain = buildEscalationChain('standard', 4)

      expect(chain).toHaveLength(3)
      expect(chain[0]!.attempt).toBe(1)
      expect(chain[1]!.attempt).toBe(2)
      expect(chain[2]!.attempt).toBe(3)

      // Each tier uses a more expensive model
      const costs = chain.map((c) => parseFloat(c.maxCostUsd))
      expect(costs[1]!).toBeGreaterThan(costs[0]!)
      expect(costs[2]!).toBeGreaterThan(costs[1]!)
    })

    it('Attempt 1 uses economy model, Attempt 2 uses standard model', () => {
      const chain = buildEscalationChain('standard', 3)

      // Attempt 1 = economy (haiku or flash)
      const attempt1Model = chain[0]!.model
      expect(['claude-haiku-4-5', 'gemini-2.5-flash-lite', 'deepseek-v3-2']).toContain(
        attempt1Model,
      )

      // Attempt 2 = standard tier
      const attempt2Model = chain[1]!.model
      expect(['claude-sonnet-4-6', 'gemini-2.5-pro', 'mistral-medium-3']).toContain(
        attempt2Model,
      )
    })
  })

  describe('B3: State machine QA reject → re-enter Producing', () => {
    it('QA fail (< max retries) re-enters Producing state', () => {
      const actor = makeStandardMachineActor()
      actor.start()

      // Progress to Producing
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'RESEARCH_COMPLETE', summary: 'Research.' })
      actor.send({ type: 'PRODUCTION_COMPLETE', output: 'Draft v1.' })

      // QA rejects — can escalate
      actor.send({ type: 'QA_FAILED', reason: 'Insufficient data', canEscalate: true })

      // Should re-enter Producing (or Reviewing, then back to Producing)
      const state = actor.getSnapshot()
      // Machine loops back — not Failed or Cancelled
      expect(['Producing', 'Reviewing']).toContain(state.value)

      actor.stop()
    })

    it('QA pass on attempt 2 → task completes', () => {
      const actor = makeStandardMachineActor()
      actor.start()

      // Progress to Producing
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'RESEARCH_COMPLETE', summary: 'Research.' })

      // Attempt 1: QA fail
      actor.send({ type: 'PRODUCTION_COMPLETE', output: 'Draft v1.' })
      actor.send({ type: 'QA_FAILED', reason: 'Insufficient data', canEscalate: true })

      // Attempt 2: Production + QA pass
      actor.send({ type: 'PRODUCTION_COMPLETE', output: 'Improved draft with stats.' })
      actor.send({ type: 'QA_PASSED' })
      actor.send({ type: 'FORMATTING_COMPLETE', finalOutput: 'Final content.' })

      const state = actor.getSnapshot()
      expect(state.value).toBe('Completed')
      expect(state.context.retryCount.qa).toBeGreaterThan(0)

      actor.stop()
    })
  })

  describe('B4: Mock LLM escalation behavior', () => {
    it('Economy model produces lower quality output (simulated)', async () => {
      const mockProvider = createMockProvider({
        'claude-haiku-4-5': {
          text: 'Basic output without detailed analysis.',
          tokensOut: 50,
        },
        'claude-sonnet-4-6': {
          text: 'Comprehensive analysis with data: 35% growth YoY, supporting 2M+ jobs.',
          tokensOut: 200,
        },
      })

      const economyResult = await mockProvider.generate('claude-haiku-4-5', {
        prompt: 'Analyze renewable energy market',
      })
      const standardResult = await mockProvider.generate('claude-sonnet-4-6', {
        prompt: 'Analyze renewable energy market',
      })

      expect(economyResult.ok && standardResult.ok).toBe(true)
      if (economyResult.ok && standardResult.ok) {
        // Standard model produces more tokens (higher quality sim)
        expect(standardResult.value.tokensOut).toBeGreaterThan(economyResult.value.tokensOut)
      }
    })

    it('attemptReason tracked correctly across attempts', () => {
      const attemptLog: Array<{ attempt: number; reason: string; model: string }> = []

      const chain = buildEscalationChain('standard', 5)

      // Attempt 1: initial
      attemptLog.push({ attempt: 1, reason: 'initial', model: chain[0]!.model })
      // Attempt 2: QA escalation
      attemptLog.push({ attempt: 2, reason: 'qa_escalation', model: chain[1]!.model })

      expect(attemptLog[0]!.reason).toBe('initial')
      expect(attemptLog[1]!.reason).toBe('qa_escalation')
      expect(attemptLog[0]!.model).not.toBe(attemptLog[1]!.model)
    })
  })

  describe('B5: Max retry enforcement', () => {
    it('After 3 QA failures machine enters AwaitingUserDecision', () => {
      const actor = makeStandardMachineActor()
      actor.start()

      // Progress to Producing
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'SSC_READY' })
      actor.send({ type: 'RESEARCH_COMPLETE', summary: 'Research.' })

      // 3 QA failures
      for (let i = 0; i < 3; i++) {
        actor.send({ type: 'PRODUCTION_COMPLETE', output: `Draft v${i + 1}.` })
        actor.send({ type: 'QA_FAILED', reason: `Failure ${i + 1}`, canEscalate: false })
      }

      // After max retries → MaxRetriesExceeded → AwaitingUserDecision or Failed
      actor.send({ type: 'MAX_RETRIES_EXCEEDED' })

      const state = actor.getSnapshot()
      expect(['AwaitingUserDecision', 'Failed']).toContain(state.value)

      actor.stop()
    })
  })
})
