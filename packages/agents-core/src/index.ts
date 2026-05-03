/**
 * @bureau/agents-core
 *
 * Framework-agnostic agent interfaces and orchestration.
 * MUST NOT import from NestJS, Next.js, Fastify, or any web framework.
 */

export type {
  IHeadAgent,
  IWorkerAgent,
  AgentContext,
  HeadAgentOutput,
  WorkerOutput,
  DecompositionStrategy,
} from './interfaces.js'

export {
  runParallel,
  runPipeline,
  type OrchestratorOptions,
  type OrchestratorResult,
} from './orchestrator.js'
