/**
 * MongoContext — singleton connection manager for Mongoose.
 *
 * Rules:
 * - Single connection per process
 * - Expose connection state for health checks
 * - Never expose raw mongoose to business logic — use repositories
 */
import mongoose, { type Connection, type ConnectOptions } from 'mongoose'
import { DatabaseConnectionError } from '@bureau/shared-kernel'

export type MongoConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

export interface MongoContextOptions {
  uri: string
  dbName?: string
  connectOptions?: ConnectOptions
}

const DEFAULT_CONNECT_OPTIONS: ConnectOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: 'majority',
}

let _connection: typeof mongoose | null = null
let _uri: string | null = null

/**
 * Connect to MongoDB. Idempotent — safe to call multiple times.
 * Throws DatabaseConnectionError on failure.
 */
export async function connectMongo(options: MongoContextOptions): Promise<typeof mongoose> {
  if (_connection?.connection.readyState === 1) {
    return _connection
  }

  const connectOptions = {
    ...DEFAULT_CONNECT_OPTIONS,
    ...options.connectOptions,
    dbName: options.dbName ?? 'bureau',
  }

  try {
    _uri = options.uri
    _connection = await mongoose.connect(options.uri, connectOptions)
    return _connection
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new DatabaseConnectionError(message, { cause: e instanceof Error ? e : undefined })
  }
}

/** Disconnect from MongoDB. Safe to call if not connected. */
export async function disconnectMongo(): Promise<void> {
  if (_connection) {
    await mongoose.disconnect()
    _connection = null
    _uri = null
  }
}

/** Get current connection state */
export function getConnectionState(): MongoConnectionState {
  const state = mongoose.connection.readyState
  const states: Record<number, MongoConnectionState> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }
  return states[state] ?? 'disconnected'
}

/** Is the connection healthy? Use for readiness probes. */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1
}

/** Expose connection for registering models */
export function getConnection(): Connection {
  return mongoose.connection
}

/** Ping MongoDB — use for health checks */
export async function pingMongo(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().ping()
    return true
  } catch {
    return false
  }
}
