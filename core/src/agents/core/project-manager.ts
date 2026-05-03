/**
 * Project Manager Agent — decomposes tasks into division-specific work orders.
 *
 * Reads executionPath from AgentContext and decides:
 * - fast: CEO → Production → [light Compliance] → Marketing (3 divisions)
 * - standard: CEO → SSC → Production → QA → Marketing (5 divisions)
 * - full: CEO → SSC → Research → Production → QA → Marketing (7 divisions)
 *
 * PM itself does NOT call LLM. It is a pure routing + planning agent.
 */
import { type Result, ok, err, newId, EntityPrefix } from '@bureau/shared-kernel'
import type { IHeadAgent, AgentContext, HeadAgentOutput } from '@bureau/agents-core'
import { createLogger } from '@bureau/telemetry'
import type { Division } from '@bureau/contracts'

export interface WorkOrder {
  division: Division
  priority: number
  mustRunBefore: Division[]
  canRunParallelWith: Division[]
  skipReason?: string | undefined
}

export interface DecomposedPlan {
  taskId: string
  executionPath: 'fast' | 'standard' | 'full'
  divisions: WorkOrder[]
  /** Estimated stages in execution order */
  stageSequence: string[]
}

// ─── Division plans per execution path ──────────────────────────────────────

const FAST_PATH_DIVISIONS: WorkOrder[] = [
  {
    division: 'Executive',
    priority: 1,
    mustRunBefore: ['Production'],
    canRunParallelWith: [],
  },
  {
    division: 'Finance',
    priority: 2,
    mustRunBefore: ['Production'],
    canRunParallelWith: ['Executive'],
  },
  {
    division: 'Production',
    priority: 3,
    mustRunBefore: ['Marketing'],
    canRunParallelWith: [],
  },
  {
    division: 'Compliance',
    priority: 4,
    mustRunBefore: ['Marketing'],
    canRunParallelWith: ['Production'],
    // Note: fast path uses schema-only validation
  },
  {
    division: 'Marketing',
    priority: 5,
    mustRunBefore: [],
    canRunParallelWith: [],
  },
]

const STANDARD_PATH_DIVISIONS: WorkOrder[] = [
  {
    division: 'Executive',
    priority: 1,
    mustRunBefore: ['HR', 'Finance', 'Compliance', 'IT'],
    canRunParallelWith: [],
  },
  {
    division: 'HR',
    priority: 2,
    mustRunBefore: ['Production'],
    canRunParallelWith: ['Finance', 'Compliance', 'IT'],
  },
  {
    division: 'Finance',
    priority: 2,
    mustRunBefore: ['Production'],
    canRunParallelWith: ['HR', 'Compliance', 'IT'],
  },
  {
    division: 'Compliance',
    priority: 2,
    mustRunBefore: ['Production'],
    canRunParallelWith: ['HR', 'Finance', 'IT'],
  },
  {
    division: 'IT',
    priority: 2,
    mustRunBefore: ['Production'],
    canRunParallelWith: ['HR', 'Finance', 'Compliance'],
  },
  {
    division: 'Production',
    priority: 3,
    mustRunBefore: ['QA'],
    canRunParallelWith: [],
  },
  {
    division: 'QA',
    priority: 4,
    mustRunBefore: ['Marketing'],
    canRunParallelWith: [],
  },
  {
    division: 'Marketing',
    priority: 5,
    mustRunBefore: [],
    canRunParallelWith: [],
  },
]

const FULL_PATH_DIVISIONS: WorkOrder[] = [
  {
    division: 'Executive',
    priority: 1,
    mustRunBefore: ['HR', 'Finance', 'Compliance', 'IT'],
    canRunParallelWith: [],
  },
  {
    division: 'HR',
    priority: 2,
    mustRunBefore: ['Research'],
    canRunParallelWith: ['Finance', 'Compliance', 'IT'],
  },
  {
    division: 'Finance',
    priority: 2,
    mustRunBefore: ['Research'],
    canRunParallelWith: ['HR', 'Compliance', 'IT'],
  },
  {
    division: 'Compliance',
    priority: 2,
    mustRunBefore: ['Research'],
    canRunParallelWith: ['HR', 'Finance', 'IT'],
  },
  {
    division: 'IT',
    priority: 2,
    mustRunBefore: ['Research'],
    canRunParallelWith: ['HR', 'Finance', 'Compliance'],
  },
  {
    division: 'Research',
    priority: 3,
    mustRunBefore: ['Production'],
    canRunParallelWith: [],
  },
  {
    division: 'Production',
    priority: 4,
    mustRunBefore: ['QA'],
    canRunParallelWith: [],
  },
  {
    division: 'QA',
    priority: 5,
    mustRunBefore: ['Marketing'],
    canRunParallelWith: [],
  },
  {
    division: 'Marketing',
    priority: 6,
    mustRunBefore: [],
    canRunParallelWith: [],
  },
]

const STAGE_SEQUENCES = {
  fast: ['Submitted', 'Preparing', 'Producing', 'Reviewing', 'Formatting', 'Completed'],
  standard: [
    'Submitted',
    'Preparing',
    'Producing',
    'Reviewing',
    'Formatting',
    'Completed',
  ],
  full: [
    'Submitted',
    'Preparing',
    'Researching',
    'Producing',
    'Reviewing',
    'Formatting',
    'Completed',
  ],
} as const

// ─── ProjectManagerAgent ─────────────────────────────────────────────────────

export class ProjectManagerAgent implements IHeadAgent {
  readonly division = 'Executive' as const
  readonly agentId: string

  constructor() {
    this.agentId = newId(EntityPrefix.AGENT)
  }

  async execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>> {
    const log = createLogger({
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      division: this.division,
      agentId: this.agentId,
    })

    log.info({ executionPath: ctx.executionPath }, 'ProjectManager decomposing task')

    if (ctx.signal.aborted) {
      return err(new Error('Task cancelled before ProjectManager processing'))
    }

    const plan = decomposeTask(ctx.taskId, ctx.executionPath)

    log.info(
      {
        divisionCount: plan.divisions.length,
        stageCount: plan.stageSequence.length,
        executionPath: plan.executionPath,
      },
      'Task decomposed into plan',
    )

    return ok({
      division: this.division,
      result: {
        plan,
        divisionCount: plan.divisions.length,
        stageSequence: plan.stageSequence,
      },
      tokensConsumed: 0, // PM never calls LLM
      durationMs: 0,
      workerCount: plan.divisions.length,
    })
  }
}

/** Pure function — decompose a task into execution plan */
export function decomposeTask(
  taskId: string,
  executionPath: 'fast' | 'standard' | 'full' | string,
): DecomposedPlan {
  const path = executionPath as 'fast' | 'standard' | 'full'

  const divisions =
    path === 'fast'
      ? FAST_PATH_DIVISIONS
      : path === 'full'
        ? FULL_PATH_DIVISIONS
        : STANDARD_PATH_DIVISIONS

  const stageSequence = STAGE_SEQUENCES[path] ?? STAGE_SEQUENCES.standard

  return {
    taskId,
    executionPath: path,
    divisions: [...divisions],
    stageSequence: [...stageSequence],
  }
}
