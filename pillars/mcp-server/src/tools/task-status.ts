/**
 * MCP Tool: bureau_task_status
 *
 * Poll task status. Returns current stage, progress, and output when complete.
 * Client should poll every 2-5s until stage is Completed/Failed/Cancelled.
 */
export const TASK_STATUS_TOOL = {
  name: 'bureau_task_status',
  description:
    'Get the current status of a Bureau task. ' +
    'Poll this until stage is Completed, Failed, or Cancelled. ' +
    'Returns partial output when available, full output on completion.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID returned by bureau_submit_task',
        minLength: 1,
      },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
} as const

export const TASK_CANCEL_TOOL = {
  name: 'bureau_cancel_task',
  description: 'Cancel a running Bureau task. Budget for incomplete work is refunded.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID to cancel',
        minLength: 1,
      },
    },
    required: ['taskId'],
    additionalProperties: false,
  },
} as const

export const TASK_DECISION_TOOL = {
  name: 'bureau_task_decision',
  description:
    'Respond to an AwaitingUserDecision state — when Bureau needs your input on budget escalation. ' +
    'Options: best_effort (use current output), add_budget (escalate model tier), cancel.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID in AwaitingUserDecision state',
        minLength: 1,
      },
      action: {
        type: 'string',
        enum: ['best_effort', 'add_budget', 'cancel'],
        description:
          'Decision: best_effort=accept current quality, add_budget=escalate model, cancel=stop',
      },
    },
    required: ['taskId', 'action'],
    additionalProperties: false,
  },
} as const
