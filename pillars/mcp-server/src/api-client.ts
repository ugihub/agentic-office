/**
 * Lightweight HTTP client for Bureau API calls from within the MCP server.
 *
 * MCP server runs as stdio process — no persistent connections.
 * Each tool call makes HTTP requests to the Bureau API server.
 *
 * Configuration via env vars:
 *   BUREAU_API_URL   — default: http://localhost:3001
 *   BUREAU_API_KEY   — required for authentication
 */
import type { Result } from '@bureau/shared-kernel'
import { ok, err } from '@bureau/shared-kernel'

export interface TaskSubmitResponse {
  taskId: string
  currentStage: string
  executionPath: 'fast' | 'standard' | 'full'
  estimatedCostUsd: string
  createdAt: string
}

export interface TaskStatusResponse {
  taskId: string
  currentStage: string
  executionPath: string
  finalOutput: string | null
  outputQuality: 'standard' | 'best_effort' | null
  costUsd: string | null
  pendingDecision: null | {
    reason: string
    attemptNumber: number
    bestEffortOutput: { available: boolean; qualityEstimate: number } | null
    escalationOption: { targetModel: string; additionalCostUsd: string; available: boolean } | null
    expiresAt: string
    defaultAction: string
  }
  updatedAt: string
}

function getBaseUrl(): string {
  return (process.env['BUREAU_API_URL'] ?? 'http://localhost:3001').replace(/\/$/, '')
}

function getApiKey(): string | null {
  return process.env['BUREAU_API_KEY'] ?? null
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const key = getApiKey()
  if (key) headers['X-Api-Key'] = key
  return headers
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<Result<T, Error>> {
  const url = `${getBaseUrl()}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...buildHeaders(), ...(init?.headers as Record<string, string> | undefined ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return err(new Error(`Bureau API ${res.status}: ${body}`))
    }
    const data = (await res.json()) as T
    return ok(data)
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)))
  }
}

export async function submitTask(params: {
  prompt: string
  maxCostUsd?: string | undefined
  outputFormat?: string | undefined
  preferredModelTier?: string | undefined
}): Promise<Result<TaskSubmitResponse, Error>> {
  const constraints: Record<string, string> = {
    maxCostUsd: params.maxCostUsd ?? '0.50',
  }
  if (params.preferredModelTier !== undefined) {
    constraints['preferredModelTier'] = params.preferredModelTier
  }

  return apiFetch<TaskSubmitResponse>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt,
      constraints,
      outputFormat: params.outputFormat ?? 'markdown',
    }),
  })
}

export async function getTaskStatus(
  taskId: string,
): Promise<Result<TaskStatusResponse, Error>> {
  return apiFetch<TaskStatusResponse>(`/api/v1/tasks/${taskId}/status`)
}

export async function cancelTask(
  taskId: string,
): Promise<Result<{ cancelled: boolean }, Error>> {
  return apiFetch<{ cancelled: boolean }>(`/api/v1/tasks/${taskId}/cancel`, {
    method: 'POST',
  })
}

export async function submitDecision(
  taskId: string,
  action: 'best_effort' | 'add_budget' | 'cancel',
): Promise<Result<{ accepted: boolean }, Error>> {
  return apiFetch<{ accepted: boolean }>(`/api/v1/tasks/${taskId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}
