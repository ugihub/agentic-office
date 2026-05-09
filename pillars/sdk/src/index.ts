/**
 * @bureau/sdk — Bureau TypeScript SDK
 *
 * @example
 * ```typescript
 * import { BureauClient } from '@bureau/sdk'
 *
 * const bureau = new BureauClient({ apiKey: 'bureau_live_...' })
 *
 * // Submit and wait
 * const task = await bureau.submitTask({ prompt: 'Write a market analysis for...' })
 * const result = await bureau.waitForTask(task.taskId, {
 *   onStatus: (s) => console.log(s.currentStage)
 * })
 * console.log(result.finalOutput)
 *
 * // Or stream events
 * const task2 = await bureau.submitTask({ prompt: 'Generate a...' })
 * for await (const event of bureau.streamTask(task2.taskId)) {
 *   if (event.event === 'task.completed') console.log(event.output)
 * }
 * ```
 */
export { BureauClient, BureauError } from "./client.js";
export { streamSSE, parseSSEEvent } from "./streaming.js";
export type {
  BureauClientOptions,
  SubmitTaskOptions,
  TaskConstraints,
  TaskEnvelope,
  TaskStatus,
  TaskStage,
  ExecutionPath,
  OutputQuality,
  PendingDecision,
  ApiKey,
  CreateApiKeyResult,
  DecisionAction,
  BureauSSEEvent,
  StageChangedEvent,
  DivisionProgressEvent,
  DecisionRequiredEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  ProviderKeyStatus,
} from "./types.js";
