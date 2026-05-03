import { describe, it, expect } from 'vitest'
import { decomposeTask } from '../agents/core/project-manager.js'

describe('decomposeTask', () => {
  it('fast path has 5 divisions and no Research', () => {
    const plan = decomposeTask('task_001', 'fast')
    expect(plan.executionPath).toBe('fast')
    expect(plan.divisions.map((d) => d.division)).not.toContain('Research')
    // fast: Executive, Finance, Production, Compliance, Marketing
    expect(plan.divisions.length).toBe(5)
  })

  it('standard path has no Research division', () => {
    const plan = decomposeTask('task_002', 'standard')
    expect(plan.executionPath).toBe('standard')
    const divNames = plan.divisions.map((d) => d.division)
    expect(divNames).not.toContain('Research')
    expect(divNames).toContain('QA')
    expect(divNames).toContain('Production')
  })

  it('full path includes Research', () => {
    const plan = decomposeTask('task_003', 'full')
    expect(plan.executionPath).toBe('full')
    const divNames = plan.divisions.map((d) => d.division)
    expect(divNames).toContain('Research')
    expect(divNames).toContain('QA')
    expect(divNames).toContain('Production')
  })

  it('fast path stage sequence skips Researching', () => {
    const plan = decomposeTask('task_004', 'fast')
    expect(plan.stageSequence).not.toContain('Researching')
  })

  it('full path stage sequence includes Researching', () => {
    const plan = decomposeTask('task_005', 'full')
    expect(plan.stageSequence).toContain('Researching')
  })

  it('Finance always runs before Production', () => {
    for (const path of ['fast', 'standard', 'full'] as const) {
      const plan = decomposeTask('task_006', path)
      const finance = plan.divisions.find((d) => d.division === 'Finance')
      const production = plan.divisions.find((d) => d.division === 'Production')
      if (finance && production) {
        expect(finance.priority).toBeLessThan(production.priority)
      }
    }
  })
})
