/**
 * ApiKey model + UserProviderKey model.
 * ApiKey: hashed, for authenticating Bureau API requests.
 * UserProviderKey: AES-256-GCM encrypted, user's own LLM provider key.
 */
import { Schema, Types, model, type Document } from 'mongoose'

export interface ApiKeyDocument extends Document {
  keyId: string
  keyHash: string            // sha256:<hex> — NEVER store plaintext
  keyPrefix: string          // First 16 chars for UI display
  ownerId: string
  tenantId: string
  name: string
  status: 'active' | 'revoked'
  permissions: string[]
  rateLimit: {
    requestsPerMinute: number
    requestsPerDay: number
  }
  usage: {
    totalRequests: number
    totalCostUsd: Types.Decimal128
  }
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  schemaVersion: 'v1'
}

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    keyId: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
    status: { type: String, required: true, enum: ['active', 'revoked'], default: 'active' },
    permissions: [{ type: String }],
    rateLimit: {
      requestsPerMinute: { type: Number, required: true, default: 60 },
      requestsPerDay: { type: Number, required: true, default: 500 },
    },
    usage: {
      totalRequests: { type: Number, default: 0 },
      totalCostUsd: {
        type: Schema.Types.Decimal128,
        default: new Types.Decimal128('0'),
      },
    },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    schemaVersion: { type: String, required: true, default: 'v1' },
  },
  {
    strict: true,
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'api_keys',
  },
)

export const ApiKeyModel = model<ApiKeyDocument>('ApiKey', apiKeySchema)

export interface UserProviderKeyDocument extends Document {
  userId: string
  provider: 'anthropic' | 'google' | 'openai' | 'deepseek' | 'mistral' | 'qwen'
  encryptedKey: string       // aes256gcm:iv:tag:ciphertext — reversible
  keyPreview: string         // Last 4 chars only, for UI
  isActive: boolean
  createdAt: Date
  lastUsedAt: Date | null
  schemaVersion: 'v1'
}

const userProviderKeySchema = new Schema<UserProviderKeyDocument>(
  {
    userId: { type: String, required: true },
    provider: {
      type: String,
      required: true,
      enum: ['anthropic', 'google', 'openai', 'deepseek', 'mistral', 'qwen'],
    },
    encryptedKey: { type: String, required: true },
    keyPreview: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
    schemaVersion: { type: String, required: true, default: 'v1' },
  },
  {
    strict: true,
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'user_provider_keys',
  },
)

userProviderKeySchema.index({ userId: 1, provider: 1 }, { unique: true })

export const UserProviderKeyModel = model<UserProviderKeyDocument>(
  'UserProviderKey',
  userProviderKeySchema,
)
