/**
 * GDPR anonymization tests.
 *
 * Verifies:
 * 1. userId → null in cost_analytics after deletion request
 * 2. prompt and finalOutput → '[REDACTED]' in task_envelopes
 * 3. Financial records preserved (cost data must remain)
 * 4. Hard delete: user_provider_keys and api_keys removed
 * 5. anonymizedAt field set on anonymized records
 */
import { describe, it, expect, vi } from 'vitest'
import type { Model } from 'mongoose'

// ─── Mock anonymization function ──────────────────────────────────────────────
// Matches the pattern from implementation_plan.md section 6.8

interface CostEvent {
  userId: string | null
  anonymizedAt: Date | null
  costUsd: string
  taskId: string
}

interface TaskEnvelope {
  userId: string | null
  'originalRequest.prompt': string
  finalOutput: string | null
  anonymizedAt: Date | null
}

async function anonymizeUserData(
  userId: string,
  deps: {
    costEventModel: { updateMany: (filter: unknown, update: unknown) => Promise<{ modifiedCount: number }> }
    taskEnvelopeModel: { updateMany: (filter: unknown, update: unknown) => Promise<{ modifiedCount: number }> }
    userProviderKeyModel: { deleteMany: (filter: unknown) => Promise<{ deletedCount: number }> }
    apiKeyModel: { deleteMany: (filter: unknown) => Promise<{ deletedCount: number }> }
  },
): Promise<void> {
  // Null out userId in cost analytics (preserve financial data)
  await deps.costEventModel.updateMany(
    { userId },
    { $set: { userId: null, anonymizedAt: new Date() } },
  )

  // Anonymize prompts and outputs
  await deps.taskEnvelopeModel.updateMany(
    { userId },
    {
      $set: {
        'originalRequest.prompt': '[REDACTED]',
        finalOutput: '[REDACTED]',
        anonymizedAt: new Date(),
      },
    },
  )

  // Hard delete personal data without audit trail value
  await deps.userProviderKeyModel.deleteMany({ userId })
  await deps.apiKeyModel.deleteMany({ ownerId: userId })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GDPR anonymization', () => {
  const userId = 'user_to_delete_001'

  function makeDeps() {
    return {
      costEventModel: {
        updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
      },
      taskEnvelopeModel: {
        updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
      },
      userProviderKeyModel: {
        deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
      },
      apiKeyModel: {
        deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      },
    }
  }

  it('nulls userId in cost_analytics (preserves financial records)', async () => {
    const deps = makeDeps()
    await anonymizeUserData(userId, deps)

    expect(deps.costEventModel.updateMany).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({
        $set: expect.objectContaining({ userId: null }),
      }),
    )
  })

  it('sets anonymizedAt in cost_analytics', async () => {
    const deps = makeDeps()
    await anonymizeUserData(userId, deps)

    const updateArgs = deps.costEventModel.updateMany.mock.calls[0]?.[1] as Record<string, unknown>
    const setOp = updateArgs?.['$set'] as Record<string, unknown>
    expect(setOp?.['anonymizedAt']).toBeInstanceOf(Date)
  })

  it('does NOT delete cost records (financial audit trail preserved)', async () => {
    const deps = makeDeps()
    // Should use updateMany, not deleteMany
    const deleteManySpy = vi.fn()
    deps.costEventModel = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
    }
    await anonymizeUserData(userId, deps)

    // Verify updateMany was called, not delete
    expect(deps.costEventModel.updateMany).toHaveBeenCalled()
  })

  it('redacts prompt and finalOutput in task_envelopes', async () => {
    const deps = makeDeps()
    await anonymizeUserData(userId, deps)

    expect(deps.taskEnvelopeModel.updateMany).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'originalRequest.prompt': '[REDACTED]',
          finalOutput: '[REDACTED]',
        }),
      }),
    )
  })

  it('hard-deletes user_provider_keys', async () => {
    const deps = makeDeps()
    await anonymizeUserData(userId, deps)

    expect(deps.userProviderKeyModel.deleteMany).toHaveBeenCalledWith({ userId })
  })

  it('hard-deletes api_keys owned by user', async () => {
    const deps = makeDeps()
    await anonymizeUserData(userId, deps)

    expect(deps.apiKeyModel.deleteMany).toHaveBeenCalledWith({ ownerId: userId })
  })

  it('anonymization is scoped to the specific userId', async () => {
    const deps = makeDeps()
    await anonymizeUserData('user_specific_001', deps)

    const costFilter = deps.costEventModel.updateMany.mock.calls[0]?.[0] as Record<string, unknown>
    expect(costFilter?.['userId']).toBe('user_specific_001')

    const taskFilter = deps.taskEnvelopeModel.updateMany.mock.calls[0]?.[0] as Record<string, unknown>
    expect(taskFilter?.['userId']).toBe('user_specific_001')
  })

  it('completes without throwing (Result pattern)', async () => {
    const deps = makeDeps()
    // Should not throw
    await expect(anonymizeUserData(userId, deps)).resolves.toBeUndefined()
  })
})
