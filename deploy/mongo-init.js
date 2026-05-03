// MongoDB initialization script
// Creates the bureau database with required collections and indexes

db = db.getSiblingDB('bureau')

// Collections with schema validation
db.createCollection('task_envelopes', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['taskId', 'tenantId', 'userId', 'submittedAt', 'currentStage', 'schemaVersion'],
    },
  },
})

db.createCollection('audit_trail')
db.createCollection('agent_executions')
db.createCollection('cost_analytics')
db.createCollection('outbox')
db.createCollection('api_keys')
db.createCollection('user_provider_keys')

// Indexes — task_envelopes
db.task_envelopes.createIndex({ taskId: 1 }, { unique: true })
db.task_envelopes.createIndex({ tenantId: 1, submittedAt: -1 })
db.task_envelopes.createIndex({ currentStage: 1 })
db.task_envelopes.createIndex({ 'pendingDecision.expiresAt': 1 }, { sparse: true })

// Indexes — audit_trail
db.audit_trail.createIndex({ taskId: 1 })
db.audit_trail.createIndex({ correlationId: 1 })
db.audit_trail.createIndex({ timestamp: -1 })

// Indexes — agent_executions
db.agent_executions.createIndex({ taskId: 1 })
db.agent_executions.createIndex({ division: 1, startedAt: -1 })

// Indexes — cost_analytics (TTL 365 days)
db.cost_analytics.createIndex({ tenantId: 1, timestamp: -1 })
db.cost_analytics.createIndex({ taskId: 1 })
db.cost_analytics.createIndex({ userId: 1 })
db.cost_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 31536000 })

// Indexes — outbox
db.outbox.createIndex({ status: 1, nextAttemptAt: 1 })
db.outbox.createIndex({ outboxId: 1 }, { unique: true })

// Indexes — api_keys
db.api_keys.createIndex({ keyHash: 1 }, { unique: true })
db.api_keys.createIndex({ ownerId: 1 })

// Indexes — user_provider_keys
db.user_provider_keys.createIndex({ userId: 1, provider: 1 }, { unique: true })

print('Bureau database initialized successfully')
