/**
 * Bureau MCP Server — Pilar 1 (Plugin Distribution)
 *
 * Runs as a stdio MCP server compatible with Claude Code, Gemini CLI, and Codex.
 * Install: npx @bureau/mcp-server
 * Configure in claude_code_config.json: { "mcpServers": { "bureau": { "command": "npx", "args": ["@bureau/mcp-server"] } } }
 *
 * Tools exposed:
 *   bureau_submit_task   — submit a task to Bureau
 *   bureau_task_status   — poll task progress
 *   bureau_cancel_task   — cancel a running task
 *   bureau_task_decision — respond to AwaitingUserDecision
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { SUBMIT_TASK_TOOL, SubmitTaskInputSchema } from './tools/submit-task.js'
import {
  TASK_STATUS_TOOL,
  TASK_CANCEL_TOOL,
  TASK_DECISION_TOOL,
} from './tools/task-status.js'
import {
  submitTask,
  getTaskStatus,
  cancelTask,
  submitDecision,
} from './api-client.js'

const SERVER_NAME = 'bureau'
const SERVER_VERSION = '0.1.0'

// ─── Build Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    capabilities: {
      tools: {},
    },
  },
)

// ─── List Tools ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    SUBMIT_TASK_TOOL,
    TASK_STATUS_TOOL,
    TASK_CANCEL_TOOL,
    TASK_DECISION_TOOL,
  ],
}))

// ─── Handle Tool Calls ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'bureau_submit_task': {
      const parsed = SubmitTaskInputSchema.safeParse(args)
      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid input: ${parsed.error.message}`,
            },
          ],
          isError: true,
        }
      }

      const result = await submitTask(parsed.data)
      if (!result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to submit task: ${result.error.message}`,
            },
          ],
          isError: true,
        }
      }

      const task = result.value
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Task submitted successfully.`,
              ``,
              `**Task ID:** ${task.taskId}`,
              `**Stage:** ${task.currentStage}`,
              `**Path:** ${task.executionPath}`,
              `**Est. Cost:** $${task.estimatedCostUsd}`,
              ``,
              `Use bureau_task_status with taskId="${task.taskId}" to track progress.`,
              `Poll every 3-5 seconds until stage is Completed, Failed, or Cancelled.`,
            ].join('\n'),
          },
        ],
      }
    }

    case 'bureau_task_status': {
      const taskId = (args as { taskId?: unknown })['taskId']
      if (typeof taskId !== 'string' || !taskId) {
        return {
          content: [{ type: 'text' as const, text: 'taskId is required' }],
          isError: true,
        }
      }

      const result = await getTaskStatus(taskId)
      if (!result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to get task status: ${result.error.message}`,
            },
          ],
          isError: true,
        }
      }

      const task = result.value
      const lines: string[] = [
        `**Task:** ${task.taskId}`,
        `**Stage:** ${task.currentStage}`,
        `**Path:** ${task.executionPath}`,
      ]

      if (task.costUsd) lines.push(`**Cost so far:** $${task.costUsd}`)

      if (task.pendingDecision) {
        lines.push(``)
        lines.push(`⚠️ **Decision Required**`)
        lines.push(`Reason: ${task.pendingDecision.reason}`)
        if (task.pendingDecision.bestEffortOutput?.available) {
          lines.push(
            `Best-effort output available (quality estimate: ${(task.pendingDecision.bestEffortOutput.qualityEstimate * 100).toFixed(0)}%)`,
          )
        }
        if (task.pendingDecision.escalationOption?.available) {
          lines.push(
            `Escalation option: ${task.pendingDecision.escalationOption.targetModel} (+$${task.pendingDecision.escalationOption.additionalCostUsd})`,
          )
        }
        lines.push(`Expires: ${task.pendingDecision.expiresAt}`)
        lines.push(`Default action: ${task.pendingDecision.defaultAction}`)
        lines.push(``)
        lines.push(`Use bureau_task_decision to respond.`)
      }

      if (task.finalOutput) {
        lines.push(``)
        lines.push(`**Output${task.outputQuality === 'best_effort' ? ' (best effort)' : ''}:**`)
        lines.push(task.finalOutput)
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      }
    }

    case 'bureau_cancel_task': {
      const taskId = (args as { taskId?: unknown })['taskId']
      if (typeof taskId !== 'string' || !taskId) {
        return {
          content: [{ type: 'text' as const, text: 'taskId is required' }],
          isError: true,
        }
      }

      const result = await cancelTask(taskId)
      if (!result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to cancel task: ${result.error.message}`,
            },
          ],
          isError: true,
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: result.value.cancelled
              ? `Task ${taskId} cancelled. Budget for incomplete work will be refunded.`
              : `Task ${taskId} could not be cancelled (may already be in terminal state).`,
          },
        ],
      }
    }

    case 'bureau_task_decision': {
      const taskId = (args as { taskId?: unknown; action?: unknown })['taskId']
      const action = (args as { taskId?: unknown; action?: unknown })['action']

      if (typeof taskId !== 'string' || !taskId) {
        return {
          content: [{ type: 'text' as const, text: 'taskId is required' }],
          isError: true,
        }
      }
      if (action !== 'best_effort' && action !== 'add_budget' && action !== 'cancel') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'action must be one of: best_effort, add_budget, cancel',
            },
          ],
          isError: true,
        }
      }

      const result = await submitDecision(taskId, action)
      if (!result.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to submit decision: ${result.error.message}`,
            },
          ],
          isError: true,
        }
      }

      const actionLabels = {
        best_effort: 'Best-effort output accepted. Task will complete with current quality.',
        add_budget: 'Budget added. Task escalating to higher model tier.',
        cancel: 'Task cancelled.',
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: actionLabels[action],
          },
        ],
      }
    }

    default:
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      }
  }
})

// ─── Start ─────────────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server runs until stdin closes
}

export { server }
