/**
 * QA Agent — gate pattern.
 *
 * Fast path: SchemaValidator only (1 validator)
 * Full/Standard path: SchemaValidator + CompletenessChecker + RelevanceChecker (3, parallel)
 *
 * On failure: includes failure reason + escalation tier recommendation.
 * Max retries: 3x. After 3x fail → trigger AwaitingUserDecision.
 *
 * CRITICAL: QA failure must carry actionable failure reason for Production to improve.
 */
import { type Result, ok, err, newId, EntityPrefix } from '@bureau/shared-kernel'
import { MaxRetriesExceededError } from '@bureau/shared-kernel'
import type {
  IHeadAgent,
  IWorkerAgent,
  AgentContext,
  HeadAgentOutput,
  WorkerOutput,
} from '@bureau/agents-core'
import { createLogger } from '@bureau/telemetry'
import type { ModelTier } from '../ssc/hr-ssc.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QaInput {
  draft: string
  originalPrompt: string
  outputFormat: 'markdown' | 'json' | 'text' | 'html'
  attemptNumber: number
  maxRetries: number
}

export interface ValidationResult {
  passed: boolean
  score: number         // 0-1
  failureReasons: string[]
  recommendations: string[]
  escalationRecommended: boolean
  recommendedTier?: ModelTier | undefined
}

export interface QaOutput {
  passed: boolean
  overallScore: number
  failureReasons: string[]
  recommendations: string[]
  escalationRecommended: boolean
  recommendedTier?: ModelTier | undefined
  validatorsRun: string[]
  isLastAttempt: boolean
}

// ─── Validators ───────────────────────────────────────────────────────────────

export class SchemaValidatorWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'QA' as const

  constructor() {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const qaInput = input as unknown as QaInput

    if (ctx.signal.aborted) {
      return err(new Error('Schema validation cancelled'))
    }

    const result = validateSchema(qaInput.draft, qaInput.outputFormat)

    return ok({
      workerId: this.workerId,
      result: result as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    })
  }
}

export class CompletenessCheckerWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'QA' as const

  constructor(
    private readonly llmCheckFn?: (
      prompt: string,
      draft: string,
    ) => Promise<{ score: number; missing: string[] }>,
  ) {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const qaInput = input as unknown as QaInput

    if (ctx.signal.aborted) {
      return err(new Error('Completeness check cancelled'))
    }

    let result: ValidationResult

    if (this.llmCheckFn) {
      const check = await this.llmCheckFn(qaInput.originalPrompt, qaInput.draft)
      result = {
        passed: check.score >= 0.7,
        score: check.score,
        failureReasons: check.missing.map((m) => `Missing: ${m}`),
        recommendations: check.missing.map(
          (m) => `Include content about: ${m}`,
        ),
        escalationRecommended: check.score < 0.5,
        recommendedTier: check.score < 0.5 ? 'standard' : undefined,
      }
    } else {
      // Heuristic completeness check (no LLM)
      result = heuristicCompletenessCheck(qaInput.draft, qaInput.originalPrompt)
    }

    return ok({
      workerId: this.workerId,
      result: result as unknown as Record<string, unknown>,
      llmInvoked: !!this.llmCheckFn,
      durationMs: Date.now() - start,
    })
  }
}

export class RelevanceCheckerWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'QA' as const

  constructor(
    private readonly relevanceFn?: (
      prompt: string,
      draft: string,
    ) => Promise<{ score: number; offTopicSections: string[] }>,
  ) {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const qaInput = input as unknown as QaInput

    if (ctx.signal.aborted) {
      return err(new Error('Relevance check cancelled'))
    }

    let result: ValidationResult

    if (this.relevanceFn) {
      const check = await this.relevanceFn(qaInput.originalPrompt, qaInput.draft)
      result = {
        passed: check.score >= 0.6 && check.offTopicSections.length === 0,
        score: check.score,
        failureReasons: check.offTopicSections.map((s) => `Off-topic section: ${s}`),
        recommendations: check.offTopicSections.map(
          (s) => `Remove or refocus section: ${s}`,
        ),
        escalationRecommended: check.score < 0.4,
        recommendedTier: check.score < 0.4 ? 'premium' : undefined,
      }
    } else {
      result = heuristicRelevanceCheck(qaInput.draft, qaInput.originalPrompt)
    }

    return ok({
      workerId: this.workerId,
      result: result as unknown as Record<string, unknown>,
      llmInvoked: !!this.relevanceFn,
      durationMs: Date.now() - start,
    })
  }
}

// ─── QaAgent ─────────────────────────────────────────────────────────────────

export interface QaAgentDeps {
  schemaValidator: SchemaValidatorWorker
  completenessChecker: CompletenessCheckerWorker
  relevanceChecker: RelevanceCheckerWorker
}

export class QaAgent implements IHeadAgent {
  readonly division = 'QA' as const
  readonly agentId: string
  static readonly MAX_RETRIES = 3

  constructor(private readonly deps: QaAgentDeps) {
    this.agentId = newId(EntityPrefix.AGENT)
  }

  async execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>> {
    const log = createLogger({
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      division: this.division,
      agentId: this.agentId,
    })

    if (ctx.signal.aborted) {
      return err(new Error('QA cancelled before start'))
    }

    const qaCtx = ctx as AgentContext & { qaInput?: QaInput }
    if (!qaCtx.qaInput) {
      return err(new Error('QaInput not found in AgentContext'))
    }

    const { qaInput } = qaCtx
    const start = Date.now()
    const isFastPath = ctx.executionPath === 'fast'

    log.info(
      {
        executionPath: ctx.executionPath,
        attemptNumber: qaInput.attemptNumber,
        maxRetries: qaInput.maxRetries,
        isFastPath,
      },
      'QA gate starting',
    )

    // Fast path: schema-only validation (lightweight)
    if (isFastPath) {
      const schemaResult = await this.deps.schemaValidator.execute(
        ctx,
        qaInput as unknown as Record<string, unknown>,
      )

      if (!schemaResult.ok) {
        return err(schemaResult.error)
      }

      const validation = schemaResult.value.result as unknown as ValidationResult
      const qaOutput: QaOutput = {
        passed: validation.passed,
        overallScore: validation.score,
        failureReasons: validation.failureReasons,
        recommendations: validation.recommendations,
        escalationRecommended: false, // fast path never escalates
        validatorsRun: ['SchemaValidator'],
        isLastAttempt: qaInput.attemptNumber >= qaInput.maxRetries,
      }

      log.info(
        { passed: qaOutput.passed, score: qaOutput.overallScore },
        'QA fast path completed',
      )

      return ok({
        division: this.division,
        result: qaOutput as unknown as Record<string, unknown>,
        tokensConsumed: 0,
        durationMs: Date.now() - start,
        workerCount: 1,
      })
    }

    // Full/Standard path: all 3 validators in parallel
    const workerInput = qaInput as unknown as Record<string, unknown>
    const [schemaResult, completenessResult, relevanceResult] = await Promise.all([
      this.deps.schemaValidator.execute(ctx, workerInput),
      this.deps.completenessChecker.execute(ctx, workerInput),
      this.deps.relevanceChecker.execute(ctx, workerInput),
    ])

    if (ctx.signal.aborted) {
      return err(new Error('QA cancelled during validation'))
    }

    const validations: ValidationResult[] = []
    const validatorNames: string[] = []

    if (schemaResult.ok) {
      validations.push(schemaResult.value.result as unknown as ValidationResult)
      validatorNames.push('SchemaValidator')
    }
    if (completenessResult.ok) {
      validations.push(completenessResult.value.result as unknown as ValidationResult)
      validatorNames.push('CompletenessChecker')
    }
    if (relevanceResult.ok) {
      validations.push(relevanceResult.value.result as unknown as ValidationResult)
      validatorNames.push('RelevanceChecker')
    }

    const qaOutput = aggregateQaResults(
      validations,
      validatorNames,
      qaInput.attemptNumber,
      qaInput.maxRetries,
    )

    const durationMs = Date.now() - start

    log.info(
      {
        passed: qaOutput.passed,
        overallScore: qaOutput.overallScore,
        failureCount: qaOutput.failureReasons.length,
        escalationRecommended: qaOutput.escalationRecommended,
        recommendedTier: qaOutput.recommendedTier,
        durationMs,
      },
      'QA full path completed',
    )

    // If max retries exceeded, surface as error for state machine
    if (!qaOutput.passed && qaOutput.isLastAttempt) {
      log.warn(
        { attemptNumber: qaInput.attemptNumber, maxRetries: qaInput.maxRetries },
        'QA max retries exceeded',
      )
      return err(
        new MaxRetriesExceededError(
          ctx.taskId,
          'QA',
          qaInput.maxRetries,
          `QA failed after ${qaInput.maxRetries} attempts: ${qaOutput.failureReasons.join('; ')}`,
        ),
      )
    }

    return ok({
      division: this.division,
      result: qaOutput as unknown as Record<string, unknown>,
      tokensConsumed: 0,
      durationMs,
      workerCount: validatorNames.length,
    })
  }
}

// ─── Aggregation & Heuristics ─────────────────────────────────────────────────

function aggregateQaResults(
  validations: ValidationResult[],
  validatorNames: string[],
  attemptNumber: number,
  maxRetries: number,
): QaOutput {
  if (validations.length === 0) {
    return {
      passed: false,
      overallScore: 0,
      failureReasons: ['All validators failed to run'],
      recommendations: ['Retry with more stable infrastructure'],
      escalationRecommended: true,
      validatorsRun: [],
      isLastAttempt: attemptNumber >= maxRetries,
    }
  }

  const overallScore =
    validations.reduce((sum, v) => sum + v.score, 0) / validations.length

  const allPassed = validations.every((v) => v.passed)
  const allFailureReasons = validations.flatMap((v) => v.failureReasons)
  const allRecommendations = validations.flatMap((v) => v.recommendations)

  // Escalation: any validator recommends it AND score is low enough
  const anyEscalationRecommended = validations.some((v) => v.escalationRecommended)
  const escalationRecommended = anyEscalationRecommended && overallScore < 0.6

  // Pick highest tier recommendation
  const recommendedTiers = validations
    .map((v) => v.recommendedTier)
    .filter(Boolean) as ModelTier[]
  const tierOrder: ModelTier[] = ['economy', 'standard', 'premium']
  const recommendedTier = recommendedTiers.length > 0
    ? recommendedTiers.reduce((highest, current) => {
        return tierOrder.indexOf(current) > tierOrder.indexOf(highest) ? current : highest
      })
    : undefined

  return {
    passed: allPassed,
    overallScore,
    failureReasons: [...new Set(allFailureReasons)],
    recommendations: [...new Set(allRecommendations)],
    escalationRecommended,
    recommendedTier,
    validatorsRun: validatorNames,
    isLastAttempt: attemptNumber >= maxRetries,
  }
}

function validateSchema(draft: string, format: QaInput['outputFormat']): ValidationResult {
  const failureReasons: string[] = []
  const recommendations: string[] = []

  if (!draft || draft.trim().length === 0) {
    return {
      passed: false,
      score: 0,
      failureReasons: ['Draft is empty'],
      recommendations: ['Generate non-empty content'],
      escalationRecommended: true,
      recommendedTier: 'standard',
    }
  }

  if (format === 'json') {
    try {
      JSON.parse(draft)
    } catch {
      failureReasons.push('Draft is not valid JSON')
      recommendations.push('Ensure output is parseable JSON')
    }
  }

  if (format === 'markdown') {
    if (draft.length < 50) {
      failureReasons.push('Markdown content too short (< 50 chars)')
      recommendations.push('Provide more comprehensive content')
    }
  }

  const passed = failureReasons.length === 0
  const score = passed ? 1.0 : Math.max(0, 1.0 - failureReasons.length * 0.3)

  return {
    passed,
    score,
    failureReasons,
    recommendations,
    escalationRecommended: !passed && score < 0.5,
  }
}

function heuristicCompletenessCheck(draft: string, prompt: string): ValidationResult {
  // Extract key terms from prompt
  const promptWords = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)

  const draftLower = draft.toLowerCase()
  const coveredTerms = promptWords.filter((w) => draftLower.includes(w))
  const coverage = promptWords.length > 0 ? coveredTerms.length / promptWords.length : 1.0

  const passed = coverage >= 0.6 && draft.length >= 100
  const failureReasons: string[] = []

  if (coverage < 0.6) {
    const missingTerms = promptWords.filter((w) => !draftLower.includes(w)).slice(0, 3)
    failureReasons.push(`Low topic coverage (${Math.round(coverage * 100)}%)`)
    if (missingTerms.length > 0) {
      failureReasons.push(`Missing key topics: ${missingTerms.join(', ')}`)
    }
  }

  if (draft.length < 100) {
    failureReasons.push('Response too brief')
  }

  return {
    passed,
    score: coverage,
    failureReasons,
    recommendations: failureReasons.map((r) => `Fix: ${r}`),
    escalationRecommended: coverage < 0.4,
    recommendedTier: coverage < 0.4 ? 'standard' : undefined,
  }
}

function heuristicRelevanceCheck(draft: string, prompt: string): ValidationResult {
  // Simple length ratio heuristic — very long responses for short prompts may be off-topic
  const promptLen = prompt.length
  const draftLen = draft.length
  const ratio = draftLen / Math.max(promptLen, 1)

  // Expect 2x-20x expansion
  const passed = ratio >= 1.5 && ratio <= 30

  const failureReasons: string[] = []
  if (ratio < 1.5) {
    failureReasons.push('Response too short relative to prompt complexity')
  }
  if (ratio > 30) {
    failureReasons.push('Response may be excessively long or off-topic')
  }

  const score = passed ? 0.8 : Math.max(0, 0.8 - Math.abs(ratio - 10) * 0.02)

  return {
    passed,
    score,
    failureReasons,
    recommendations: failureReasons.map((r) => `Review: ${r}`),
    escalationRecommended: false,
  }
}
