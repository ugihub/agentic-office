/**
 * Research Agent — scatter pattern with 3 parallel workers.
 *
 * Workers:
 * 1. WebSearchWorker   — external web search
 * 2. KnowledgeBaseWorker — internal vector KB lookup
 * 3. EmbeddingWorker   — semantic similarity reranking
 *
 * Pattern: Scatter → Gather → Rerank
 *
 * Skipped on fast path. Called for standard/full paths only.
 */
import pLimit from 'p-limit'
import { type Result, ok, err, newId, EntityPrefix } from '@bureau/shared-kernel'
import { AgentCapacityError } from '@bureau/shared-kernel'
import type {
  IHeadAgent,
  IWorkerAgent,
  AgentContext,
  HeadAgentOutput,
  WorkerOutput,
} from '@bureau/agents-core'
import { createLogger } from '@bureau/telemetry'

// ─── Worker input / output types ─────────────────────────────────────────────

export interface ResearchInput {
  prompt: string
  taskId: string
  maxResults?: number | undefined
}

export interface ResearchResult {
  source: 'web' | 'knowledge_base' | 'semantic'
  items: Array<{
    content: string
    url?: string | undefined
    score: number
    metadata?: Record<string, unknown> | undefined
  }>
  queryUsed: string
  durationMs: number
}

export interface AggregatedResearch {
  summary: string
  sources: Array<{
    content: string
    url?: string | undefined
    score: number
    source: 'web' | 'knowledge_base' | 'semantic'
  }>
  confidence: number
  totalSources: number
}

// ─── WebSearchWorker ─────────────────────────────────────────────────────────

export class WebSearchWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'Research' as const

  constructor(
    private readonly searchFn: (
      query: string,
      maxResults: number,
    ) => Promise<Array<{ content: string; url: string; score: number }>>,
  ) {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const researchInput = input as unknown as ResearchInput

    if (ctx.signal.aborted) {
      return err(new Error('WebSearch cancelled'))
    }

    const results = await this.searchFn(researchInput.prompt, researchInput.maxResults ?? 5)

    const researchResult: ResearchResult = {
      source: 'web',
      items: results,
      queryUsed: researchInput.prompt,
      durationMs: Date.now() - start,
    }

    return ok({
      workerId: this.workerId,
      result: researchResult as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    })
  }
}

// ─── KnowledgeBaseWorker ─────────────────────────────────────────────────────

export class KnowledgeBaseWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'Research' as const

  constructor(
    private readonly kbSearchFn: (
      query: string,
      tenantId: string,
    ) => Promise<Array<{ content: string; score: number; metadata?: Record<string, unknown> | undefined }>>
  ) {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const researchInput = input as unknown as ResearchInput

    if (ctx.signal.aborted) {
      return err(new Error('KnowledgeBase search cancelled'))
    }

    const results = await this.kbSearchFn(researchInput.prompt, ctx.tenantId)

    const researchResult: ResearchResult = {
      source: 'knowledge_base',
      items: results,
      queryUsed: researchInput.prompt,
      durationMs: Date.now() - start,
    }

    return ok({
      workerId: this.workerId,
      result: researchResult as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    })
  }
}

// ─── EmbeddingWorker ─────────────────────────────────────────────────────────

export class EmbeddingWorker implements IWorkerAgent {
  readonly workerId: string
  readonly division = 'Research' as const

  constructor(
    private readonly rerankFn: (
      query: string,
      candidates: Array<{ content: string; score: number }>,
    ) => Promise<Array<{ content: string; score: number }>>
  ) {
    this.workerId = newId(EntityPrefix.WORKER)
  }

  async execute(
    ctx: AgentContext,
    input: Record<string, unknown>,
  ): Promise<Result<WorkerOutput, Error>> {
    const start = Date.now()
    const { prompt, candidates } = input as { prompt: string; candidates: Array<{ content: string; score: number }> }

    if (ctx.signal.aborted) {
      return err(new Error('Embedding reranking cancelled'))
    }

    const reranked = await this.rerankFn(prompt, candidates ?? [])

    const researchResult: ResearchResult = {
      source: 'semantic',
      items: reranked,
      queryUsed: prompt,
      durationMs: Date.now() - start,
    }

    return ok({
      workerId: this.workerId,
      result: researchResult as unknown as Record<string, unknown>,
      llmInvoked: false,
      durationMs: Date.now() - start,
    })
  }
}

// ─── ResearchAgent ────────────────────────────────────────────────────────────

export interface ResearchAgentDeps {
  webSearchWorker: WebSearchWorker
  knowledgeBaseWorker: KnowledgeBaseWorker
  embeddingWorker: EmbeddingWorker
  maxConcurrency?: number | undefined
}

export class ResearchAgent implements IHeadAgent {
  readonly division = 'Research' as const
  readonly agentId: string

  constructor(private readonly deps: ResearchAgentDeps) {
    this.agentId = newId(EntityPrefix.AGENT)
  }

  async execute(ctx: AgentContext): Promise<Result<HeadAgentOutput, Error>> {
    const log = createLogger({
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      division: this.division,
      agentId: this.agentId,
    })

    // Research is skipped on fast path
    if (ctx.executionPath === 'fast') {
      log.info('Skipping Research (fast path)')
      return ok({
        division: this.division,
        result: {
          skipped: true,
          reason: 'fast_path',
        },
        tokensConsumed: 0,
        durationMs: 0,
        workerCount: 0,
      })
    }

    if (ctx.signal.aborted) {
      return err(new Error('Research cancelled before start'))
    }

    const start = Date.now()
    const limit = pLimit(this.deps.maxConcurrency ?? 3)

    log.info('Starting Research scatter phase (web + kb + embedding parallel)')

    // Get prompt from context metadata (stored when task was submitted)
    const prompt = (ctx as AgentContext & { prompt?: string }).prompt ?? ctx.taskId

    // Phase 1: Web + KB in parallel
    const [webResult, kbResult] = await Promise.all([
      limit(() =>
        this.deps.webSearchWorker.execute(ctx, { prompt, taskId: ctx.taskId, maxResults: 5 }),
      ),
      limit(() =>
        this.deps.knowledgeBaseWorker.execute(ctx, { prompt, taskId: ctx.taskId }),
      ),
    ])

    if (ctx.signal.aborted) {
      return err(new Error('Research cancelled after scatter phase'))
    }

    // Gather candidates for reranking
    const candidates: Array<{ content: string; score: number }> = []

    if (webResult.ok) {
      const wr = webResult.value.result as unknown as ResearchResult
      candidates.push(...wr.items.map((i) => ({ content: i.content, score: i.score })))
    } else {
      log.warn({ err: webResult.error.message }, 'Web search failed, continuing without it')
    }

    if (kbResult.ok) {
      const kr = kbResult.value.result as unknown as ResearchResult
      candidates.push(...kr.items.map((i) => ({ content: i.content, score: i.score })))
    } else {
      log.warn({ err: kbResult.error.message }, 'KB search failed, continuing without it')
    }

    // Phase 2: Rerank with embeddings
    const embeddingResult = await this.deps.embeddingWorker.execute(ctx, {
      prompt,
      candidates,
    })

    if (!embeddingResult.ok) {
      log.warn({ err: embeddingResult.error.message }, 'Embedding rerank failed, using raw results')
    }

    // Aggregate results
    const aggregated = aggregateResearchResults(
      webResult.ok ? (webResult.value.result as unknown as ResearchResult) : null,
      kbResult.ok ? (kbResult.value.result as unknown as ResearchResult) : null,
      embeddingResult.ok ? (embeddingResult.value.result as unknown as ResearchResult) : null,
    )

    const durationMs = Date.now() - start
    const tokensConsumed =
      (webResult.ok ? webResult.value.tokensIn ?? 0 : 0) +
      (kbResult.ok ? kbResult.value.tokensIn ?? 0 : 0)

    log.info(
      {
        totalSources: aggregated.totalSources,
        confidence: aggregated.confidence,
        durationMs,
      },
      'Research completed',
    )

    return ok({
      division: this.division,
      result: aggregated as unknown as Record<string, unknown>,
      tokensConsumed,
      durationMs,
      workerCount: 3,
    })
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregateResearchResults(
  web: ResearchResult | null,
  kb: ResearchResult | null,
  semantic: ResearchResult | null,
): AggregatedResearch {
  const allItems: Array<{
    content: string
    url?: string | undefined
    score: number
    source: 'web' | 'knowledge_base' | 'semantic'
  }> = []

  if (web) {
    allItems.push(...web.items.map((i) => ({ ...i, source: 'web' as const })))
  }
  if (kb) {
    allItems.push(...kb.items.map((i) => ({ ...i, source: 'knowledge_base' as const })))
  }

  // Use semantic reranked if available, otherwise use raw items
  const sortedItems =
    semantic && semantic.items.length > 0
      ? semantic.items.map((i) => ({
          content: i.content,
          score: i.score,
          source: 'semantic' as const,
        }))
      : allItems.sort((a, b) => b.score - a.score)

  const topItems = sortedItems.slice(0, 10)
  const avgScore =
    topItems.length > 0
      ? topItems.reduce((sum, i) => sum + i.score, 0) / topItems.length
      : 0

  const summary =
    topItems.length > 0
      ? `Found ${topItems.length} relevant sources. Top result: ${topItems[0]?.content.slice(0, 200)}...`
      : 'No relevant research found.'

  return {
    summary,
    sources: topItems,
    confidence: Math.min(avgScore, 1.0),
    totalSources: allItems.length,
  }
}
