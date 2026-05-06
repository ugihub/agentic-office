/**
 * Bureau Task State Machine — XState 5
 *
 * States:
 *   Submitted → Preparing → Researching → Producing → Reviewing
 *     → Formatting → Completed
 *     → AwaitingUserDecision (budget insufficient for escalation)
 *     → Failed (max retries exceeded)
 *   [any state] → Cancelled (user request)
 *
 * Key design decisions:
 * - AwaitingUserDecision: 24h timeout, default best_effort
 * - QA failure: re-enter Producing with higher model tier (escalation chain)
 * - Finance always consulted even in fast path
 */
import { setup, assign, type ActorRefFrom } from 'xstate'
import type { TaskStage, ExecutionPath } from '@bureau/contracts'

export interface TaskContext {
  taskId: string
  tenantId: string
  userId: string
  correlationId: string
  executionPath: ExecutionPath

  selectedModel: string | null
  escalationChain: Array<{ attempt: number; model: string; maxCostUsd: string }>
  currentAttempt: number

  productionOutput: string | null
  qaFailureReason: string | null
  retryCount: { production: number; qa: number }

  finalOutput: string | null
  outputQuality: 'best_effort' | 'standard' | null

  pendingDecision: {
    reason: 'budget_insufficient_for_escalation'
    attemptNumber: number
    bestEffortAvailable: boolean
    qualityEstimate: number
    escalationModel: string | null
    additionalCostUsd: string | null
    bestEffortOutput?: { available: boolean; qualityEstimate: number }
    escalationOption?: { available: boolean; targetModel: string; additionalCostUsd: string }
    notifiedAt?: Date | null
    expiresAt: Date
    defaultAction: 'best_effort' | 'add_budget' | 'cancel'
  } | null

  error: string | null
}

export type TaskEvent =
  | { type: 'SSC_READY' }
  | { type: 'RESEARCH_COMPLETE'; summary: string }
  | { type: 'PRODUCTION_COMPLETE'; output: string }
  | { type: 'QA_PASSED' }
  | { type: 'QA_FAILED'; reason: string; canEscalate: boolean }
  | { type: 'FORMATTING_COMPLETE'; finalOutput: string }
  | { type: 'BUDGET_INSUFFICIENT_FOR_ESCALATION'; additionalCostUsd: string; targetModel: string }
  | { type: 'USER_DECISION'; action: 'best_effort' | 'add_budget' | 'cancel' }
  | { type: 'DECISION_TIMEOUT' }
  | { type: 'MAX_RETRIES_EXCEEDED' }
  | { type: 'CANCEL' }
  | { type: 'ERROR'; message: string }

const MAX_QA_RETRIES = 3

export const taskMachine = setup({
  types: {
    context: {} as TaskContext,
    events: {} as TaskEvent,
    input: {} as TaskContext,
  },
  guards: {
    isResearchRequired: ({ context }) => context.executionPath !== 'fast',
    canRetryQa: ({ context }) => (context.retryCount?.qa ?? 0) < MAX_QA_RETRIES - 1,
    canEscalate: (_, params: { canEscalate: boolean }) => params.canEscalate,
  },
  actions: {
    incrementQaRetry: assign({
      retryCount: ({ context }) => ({
        production: context.retryCount?.production ?? 0,
        qa: (context.retryCount?.qa ?? 0) + 1,
      }),
    }),
    setQaFailureReason: assign({
      qaFailureReason: (_, params: { reason: string }) => params.reason,
    }),
    setProductionOutput: assign({
      productionOutput: (_, params: { output: string }) => params.output,
    }),
    setFinalOutput: assign({
      finalOutput: (_, params: { output: string }) => params.output,
      outputQuality: ({ context }) => context.outputQuality ?? 'standard',
    }),
    setFinalOutputBestEffort: assign({
      finalOutput: ({ context }) => context.productionOutput,
      outputQuality: () => 'best_effort' as const,
    }),
    setPendingDecision: assign({
      pendingDecision: (_, params: {
        additionalCostUsd: string
        targetModel: string
        attemptNumber: number
      }) => ({
        reason: 'budget_insufficient_for_escalation' as const,
        attemptNumber: params.attemptNumber,
        bestEffortAvailable: true,
        qualityEstimate: 0.75,
        escalationModel: params.targetModel,
        additionalCostUsd: params.additionalCostUsd,
        bestEffortOutput: { available: true, qualityEstimate: 0.75 },
        escalationOption: {
          available: true,
          targetModel: params.targetModel,
          additionalCostUsd: params.additionalCostUsd,
        },
        notifiedAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        defaultAction: 'best_effort' as const,
      }),
    }),
    clearPendingDecision: assign({ pendingDecision: () => null }),
    setError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    incrementCurrentAttempt: assign({
      currentAttempt: ({ context }) => context.currentAttempt + 1,
    }),
  },
}).createMachine({
  id: 'task',
  initial: 'Submitted',
  context: ({ input }: { input: TaskContext }) => input,

  states: {
    Submitted: {
      on: {
        SSC_READY: { target: 'Preparing' },
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    Preparing: {
      // Parallel: HR SSC + Finance SSC + Compliance SSC + IT SSC
      on: {
        SSC_READY: [
          { guard: 'isResearchRequired', target: 'Researching' },
          { target: 'Producing' },
        ],
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    Researching: {
      // Research Agent — skip in fast path
      on: {
        RESEARCH_COMPLETE: { target: 'Producing' },
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    Producing: {
      entry: { type: 'incrementCurrentAttempt' },
      on: {
        PRODUCTION_COMPLETE: {
          target: 'Reviewing',
          actions: {
            type: 'setProductionOutput',
            params: ({ event }) => ({ output: event.output }),
          },
        },
        BUDGET_INSUFFICIENT_FOR_ESCALATION: {
          target: 'AwaitingUserDecision',
          actions: {
            type: 'setPendingDecision',
            params: ({ event, context }) => ({
              additionalCostUsd: event.additionalCostUsd,
              targetModel: event.targetModel,
              attemptNumber: context.currentAttempt,
            }),
          },
        },
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    Reviewing: {
      // QA Agent gate
      on: {
        QA_PASSED: { target: 'Formatting' },
        BUDGET_INSUFFICIENT_FOR_ESCALATION: {
          target: 'AwaitingUserDecision',
          actions: {
            type: 'setPendingDecision',
            params: ({ event, context }) => ({
              additionalCostUsd: event.additionalCostUsd,
              targetModel: event.targetModel,
              attemptNumber: context.currentAttempt,
            }),
          },
        },
        QA_FAILED: [
          {
            // Can retry AND can escalate → re-enter Producing
            guard: { type: 'canRetryQa' },
            target: 'Producing',
            actions: [
              { type: 'incrementQaRetry' },
              {
                type: 'setQaFailureReason',
                params: ({ event }) => ({ reason: event.reason }),
              },
            ],
          },
          {
            // Max retries exceeded
            target: 'Failed',
            actions: { type: 'setError', params: ({ event }) => ({ message: event.reason }) },
          },
        ],
        MAX_RETRIES_EXCEEDED: { target: 'Failed' },
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    Formatting: {
      // Marketing Agent — format + citations + delivery
      on: {
        FORMATTING_COMPLETE: {
          target: 'Completed',
          actions: {
            type: 'setFinalOutput',
            params: ({ event }) => ({ output: event.finalOutput }),
          },
        },
        CANCEL: { target: 'Cancelled' },
        ERROR: {
          target: 'Failed',
          actions: { type: 'setError', params: ({ event }) => ({ message: event.message }) },
        },
      },
    },

    AwaitingUserDecision: {
      // 24h timeout — background job auto-executes defaultAction
      on: {
        USER_DECISION: [
          {
            guard: ({ event }) => event.action === 'best_effort',
            target: 'Formatting',
            actions: [
              { type: 'setFinalOutputBestEffort' },
              { type: 'clearPendingDecision' },
            ],
          },
          {
            guard: ({ event }) => event.action === 'add_budget',
            target: 'Producing',
            actions: { type: 'clearPendingDecision' },
          },
          {
            guard: ({ event }) => event.action === 'cancel',
            target: 'Cancelled',
            actions: { type: 'clearPendingDecision' },
          },
        ],
        DECISION_TIMEOUT: {
          // Default: best_effort after 24h
          target: 'Formatting',
          actions: [
            { type: 'setFinalOutputBestEffort' },
            { type: 'clearPendingDecision' },
          ],
        },
        CANCEL: { target: 'Cancelled' },
      },
    },

    Completed: {
      type: 'final',
    },

    Failed: {
      type: 'final',
    },

    Cancelled: {
      type: 'final',
    },
  },
})

export type TaskMachine = typeof taskMachine
export type TaskMachineActor = ActorRefFrom<TaskMachine>

/** Map XState state name to TaskStage type */
export function stateToStage(stateName: string): TaskStage {
  const validStages: TaskStage[] = [
    'Submitted', 'Preparing', 'Researching', 'Producing', 'Reviewing',
    'Formatting', 'AwaitingUserDecision', 'Completed', 'Failed', 'Cancelled',
  ]
  const found = validStages.find((s) => s === stateName)
  return found ?? 'Submitted'
}
