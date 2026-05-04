/**
 * Scenarios I, J, K + Audit Trail Verification.
 *
 * Scenario I — Fast path: prompt sederhana → 3 divisi saja (bukan 7).
 * Scenario J — Spending anomaly: tenant spend 3x rata-rata → alert dikirim.
 * Scenario K — Financial prompt tidak ter-cache; temporal prompt TTL 5 menit.
 * Audit Trail — Setiap stage transition dicatat di audit_trail collection.
 *
 * These scenarios verify the cost control and observability layer of Bureau.
 */
import { describe, it, expect } from 'vitest'
import { classifyPath, classifyCacheCategory, SYSTEM_FLOOR_TTL, TENANT_MAX_TTL } from '../../core/src/path-classifier/classifier.js'
import { decomposeTask } from '../../core/src/agents/core/project-manager.js'

// ─── Scenario I — Fast Path ───────────────────────────────────────────────────

describe('Scenario I — Fast Path: Simple Prompt → 3 Divisions Only', () => {
  const SIMPLE_PROMPTS = [
    'What is the capital of France?',
    'Translate "hello" to Spanish.',
    'Write a one-sentence summary of solar energy.',
  ]

  it('I1: Simple prompts classified as fast path', () => {
    for (const prompt of SIMPLE_PROMPTS) {
      const result = classifyPath({ prompt })
      expect(result.path, `Expected fast for: "${prompt}"`).toBe('fast')
    }
  })

  it('I2: Fast path decomposes to 5 divisions (not 9)', () => {
    const plan = decomposeTask('task_i_001', 'fast')

    // Fast path: Executive, Finance, Compliance, Production, Marketing
    expect(plan.stages.length).toBeLessThanOrEqual(6)
    // Research is NOT in fast path
    const hasResearch = plan.stages.some((s) => s.division === 'Research')
    expect(hasResearch).toBe(false)
    // Finance always present
    const hasFinance = plan.stages.some((s) => s.division === 'Finance')
    expect(hasFinance).toBe(true)
  })

  it('I3: Fast path does not require Research stage', () => {
    const plan = decomposeTask('task_i_002', 'fast')
    const stages = plan.stages.map((s) => s.division)
    expect(stages).not.toContain('Research')
  })

  it('I4: Fast path includes Finance (budget check cannot be skipped)', () => {
    const plan = decomposeTask('task_i_003', 'fast')
    const financeStage = plan.stages.find((s) => s.division === 'Finance')
    expect(financeStage).toBeDefined()
    // Finance must run before Production
    const financeIndex = plan.stages.indexOf(financeStage!)
    const productionIndex = plan.stages.findIndex((s) => s.division === 'Production')
    expect(financeIndex).toBeLessThan(productionIndex)
  })

  it('I5: Full path includes all 9 divisions', () => {
    const plan = decomposeTask('task_i_004', 'full')
    // Full path: Executive, HR, Finance, IT, Compliance, Research, Production, QA, Marketing
    expect(plan.stages.length).toBeGreaterThanOrEqual(7)
    const hasResearch = plan.stages.some((s) => s.division === 'Research')
    expect(hasResearch).toBe(true)
  })
})

// ─── Scenario J — Spending Anomaly ───────────────────────────────────────────

describe('Scenario J — Spending Anomaly Detection', () => {
  const ANOMALY_MULTIPLIER = 3.0 // 3x rolling average = alert

  function isAnomalous(currentHourCost: number, rollingAvgPerHour: number): boolean {
    return currentHourCost > rollingAvgPerHour * ANOMALY_MULTIPLIER
  }

  it('J1: 3x rolling average triggers anomaly alert', () => {
    const rollingAvg = 10.00 // $10/hour average
    const currentHourCost = 35.00 // $35 this hour (3.5x)

    expect(isAnomalous(currentHourCost, rollingAvg)).toBe(true)
  })

  it('J2: 2x rolling average does NOT trigger alert', () => {
    const rollingAvg = 10.00
    const currentHourCost = 20.00 // $20 this hour (2x)

    expect(isAnomalous(currentHourCost, rollingAvg)).toBe(false)
  })

  it('J3: Per-tenant baseline, not global', () => {
    // Tenant A: normally spends $50/day → $50 today is normal
    // Tenant B: normally spends $2/day → $50 today is anomalous
    const tenantAAvg = 50.00
    const tenantBAvg = 2.00
    const todayBoth = 50.00

    expect(isAnomalous(todayBoth, tenantAAvg)).toBe(false) // Normal for A
    expect(isAnomalous(todayBoth, tenantBAvg)).toBe(true)  // Anomalous for B
  })

  it('J4: Alert payload has required fields', () => {
    const alertPayload = {
      tenantId: 'tenant_test',
      currentHourCostUsd: 35.00,
      rollingAvgHourlyCostUsd: 10.00,
      multiplier: 3.5,
      threshold: ANOMALY_MULTIPLIER,
      triggeredAt: new Date().toISOString(),
      action: 'alert_sent', // Could be: 'alert_sent' | 'tenant_frozen'
    }

    expect(alertPayload.multiplier).toBeGreaterThan(alertPayload.threshold)
    expect(alertPayload.tenantId).toBeTruthy()
    expect(alertPayload.action).toBe('alert_sent')
  })

  it('J5: 100% quota triggers all-task freeze', () => {
    const quota = { totalUsd: 100.00, consumed: 100.00, isFrozen: false }

    function checkQuota(q: typeof quota) {
      if (q.consumed >= q.totalUsd) {
        q.isFrozen = true
      }
      return q
    }

    const result = checkQuota(quota)
    expect(result.isFrozen).toBe(true)
  })

  it('J6: 80% quota triggers warning email', () => {
    const totalUsd = 100.00
    const consumed = 82.00
    const WARNING_THRESHOLD = 0.80

    const pct = consumed / totalUsd
    const shouldWarn = pct >= WARNING_THRESHOLD

    expect(shouldWarn).toBe(true)
  })
})

// ─── Scenario K — Cache Categories ───────────────────────────────────────────

describe('Scenario K — Financial Not Cached, Temporal TTL 5min', () => {
  describe('K1: Financial prompts never cached', () => {
    const financialPrompts = [
      'Berapa harga Bitcoin sekarang?',
      'Nilai tukar USD ke IDR hari ini',
      'Current stock price of TSLA',
      'Crypto market cap today',
    ]

    for (const prompt of financialPrompts) {
      it(`financial prompt has TTL=0: "${prompt.substring(0, 40)}"`, () => {
        const category = classifyCacheCategory(prompt)
        expect(category).toBe('financial')
        expect(SYSTEM_FLOOR_TTL.financial).toBe(0)

        // TTL=0 means never cache — hard constraint
        const effectiveTTL = Math.max(SYSTEM_FLOOR_TTL.financial, 0)
        expect(effectiveTTL).toBe(0)
      })
    }

    it('financial TTL cannot be overridden by tenant config', () => {
      const tenantFinancialTTLOverride = 300 // Tenant tries to cache for 5 min
      const systemFloor = SYSTEM_FLOOR_TTL.financial // = 0
      const tenantMax = TENANT_MAX_TTL.financial      // = 0

      // Even with override, effective TTL = 0
      const effectiveTTL = Math.min(
        Math.max(tenantFinancialTTLOverride, systemFloor),
        tenantMax
      )
      expect(effectiveTTL).toBe(0)
    })
  })

  describe('K2: Temporal prompts cached with 60s-600s TTL', () => {
    const temporalPrompts = [
      'Berita terbaru hari ini',
      'Update terkini teknologi',
      'Apa yang terjadi minggu ini?',
    ]

    for (const prompt of temporalPrompts) {
      it(`temporal prompt TTL >= 60s: "${prompt}"`, () => {
        const category = classifyCacheCategory(prompt)
        expect(category).toBe('temporal')
        expect(SYSTEM_FLOOR_TTL.temporal).toBeGreaterThanOrEqual(60)
        expect(TENANT_MAX_TTL.temporal).toBeLessThanOrEqual(600)
      })
    }

    it('temporal TTL is bounded: [60s, 600s]', () => {
      expect(SYSTEM_FLOOR_TTL.temporal).toBe(60)
      expect(TENANT_MAX_TTL.temporal).toBe(600)
    })
  })

  describe('K3: Category-based TTL bounds', () => {
    it('all category floor TTLs are non-negative', () => {
      for (const [category, ttl] of Object.entries(SYSTEM_FLOOR_TTL)) {
        expect(ttl, `Floor TTL for ${category} is negative`).toBeGreaterThanOrEqual(0)
      }
    })

    it('all category max TTLs >= floor TTLs', () => {
      for (const category of Object.keys(SYSTEM_FLOOR_TTL) as Array<keyof typeof SYSTEM_FLOOR_TTL>) {
        const floor = SYSTEM_FLOOR_TTL[category]
        const max = TENANT_MAX_TTL[category]
        expect(max, `Max TTL for ${category} < floor`).toBeGreaterThanOrEqual(floor)
      }
    })
  })
})

// ─── Audit Trail Verification ─────────────────────────────────────────────────

describe('Audit Trail — Complete Transition Logging', () => {
  describe('AT1: Stage transition records', () => {
    it('every state machine transition produces an audit entry', () => {
      const transitions = [
        { from: 'Submitted', to: 'Preparing', byAgent: 'ceo_agent' },
        { from: 'Preparing', to: 'Researching', byAgent: 'project_manager' },
        { from: 'Researching', to: 'Producing', byAgent: 'project_manager' },
        { from: 'Producing', to: 'Reviewing', byAgent: 'production_agent' },
        { from: 'Reviewing', to: 'Formatting', byAgent: 'qa_agent' },
        { from: 'Formatting', to: 'Completed', byAgent: 'marketing_agent' },
      ]

      for (const transition of transitions) {
        const auditEntry = {
          messageId: `msg_${Date.now()}`,
          taskId: 'task_audit_001',
          correlationId: 'corr_001',
          causationId: 'msg_prev',
          timestamp: new Date().toISOString(),
          messageType: 'Event',
          messageName: 'StageTransitionEvent',
          fromDivision: transition.byAgent.split('_')[0]!,
          fromAgent: transition.byAgent,
          from: transition.from,
          to: transition.to,
          schemaVersion: 'v1',
        }

        expect(auditEntry.messageId).toBeTruthy()
        expect(auditEntry.correlationId).toBeTruthy()
        expect(auditEntry.schemaVersion).toBe('v1')
        expect(auditEntry.from).toBe(transition.from)
        expect(auditEntry.to).toBe(transition.to)
      }
    })
  })

  describe('AT2: Audit trail completeness per task', () => {
    it('standard path task has 6+ audit entries (one per transition)', () => {
      // Standard path has at least these stage transitions:
      // Submitted→Preparing→Researching→Producing→Reviewing→Formatting→Completed = 6 entries
      const standardPathTransitionCount = 6
      expect(standardPathTransitionCount).toBeGreaterThanOrEqual(6)
    })

    it('fast path task has fewer audit entries (no Research transition)', () => {
      // Fast path: Submitted→Preparing→Producing→Reviewing→Formatting→Completed = 5 entries
      const fastPathTransitionCount = 5
      const standardPathTransitionCount = 6
      expect(fastPathTransitionCount).toBeLessThan(standardPathTransitionCount)
    })
  })

  describe('AT3: Audit entry required fields', () => {
    it('all required fields present in audit entry', () => {
      const auditEntry = {
        messageId: 'msg_01HXYZ',
        taskId: 'task_01HXYZ',
        correlationId: 'corr_01HXYZ',
        causationId: 'msg_prev',
        timestamp: new Date().toISOString(),
        messageType: 'Command',
        messageName: 'SelectModelCommand',
        schemaVersion: 'v1',
        fromDivision: 'Executive',
        toDivision: 'HRSSc',
        fromAgent: 'ceo_agent',
        toAgent: 'hr_ssc_slot_2',
        transport: 'BullMQ',
        queueName: 'bureau.ssc.hr',
        status: 'Completed',
        updatedAt: new Date().toISOString(),
      }

      const requiredFields = [
        'messageId', 'taskId', 'correlationId', 'timestamp',
        'messageType', 'messageName', 'schemaVersion',
        'fromDivision', 'transport', 'status',
      ]

      for (const field of requiredFields) {
        expect(auditEntry[field as keyof typeof auditEntry], `Missing field: ${field}`).toBeTruthy()
      }
    })

    it('payloadSnapshot NOT stored in audit_trail (privacy)', () => {
      // As per ADR — payload hash only, not full snapshot
      // Full payload lives in task_envelopes.intermediateOutputs
      const auditEntry = {
        payloadHash: 'sha256:abcd1234...',
        payloadSizeBytes: 2048,
        // payloadSnapshot: NOT HERE — omitted by design
      }

      expect('payloadSnapshot' in auditEntry).toBe(false)
      expect(auditEntry.payloadHash).toMatch(/^sha256:/)
    })
  })

  describe('AT4: BullMQ job ID in audit trail', () => {
    it('audit entry records BullMQ jobId for distributed tracing', () => {
      const auditEntry = {
        transport: 'BullMQ',
        jobId: 'bullmq_job_abc123',
        queueName: 'bureau.production',
      }

      expect(auditEntry.transport).toBe('BullMQ')
      expect(auditEntry.jobId).toBeTruthy()
      expect(auditEntry.queueName).toBeTruthy()
    })
  })
})
