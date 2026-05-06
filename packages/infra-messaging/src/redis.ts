/**
 * Redis connection factory for BullMQ.
 *
 * Redis boundary rule: Redis = ephemeral only.
 * - BullMQ job queues
 * - Cache (TTL-based)
 * - Rate limiting
 * MongoDB = all state that matters
 *
 * @see ADR-001: BullMQ-only
 */
import { Redis, type RedisOptions } from 'ioredis'

const DEFAULT_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,    // Required for BullMQ
  enableReadyCheck: false,        // Required for BullMQ
  lazyConnect: false,
  retryStrategy: (times: number): number | null => {
    if (times > 10) return null   // Give up after 10 retries
    return Math.min(times * 1000, 5000)
  },
  reconnectOnError: (err: Error): boolean => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
    return targetErrors.some((e) => err.message.includes(e))
  },
}

let _redis: Redis | null = null

export interface RedisConnectionOptions {
  url: string
  options?: Partial<RedisOptions>
}

/** Get or create singleton Redis connection */
export function getRedisConnection(options?: RedisConnectionOptions): Redis {
  if (_redis && _redis.status === 'ready') {
    return _redis
  }

  const url = options?.url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  _redis = new Redis(url, {
    ...DEFAULT_REDIS_OPTIONS,
    ...options?.options,
  })

  _redis.on('error', (err) => {
    // Log but don't crash — ioredis handles reconnection
    process.stderr.write(`[Redis] Error: ${err.message}\n`)
  })

  return _redis
}

/** Create a separate Redis connection for subscriptions (pub/sub needs separate conn) */
export function createRedisConnection(url?: string): Redis {
  const redisUrl = url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  return new Redis(redisUrl, DEFAULT_REDIS_OPTIONS)
}

/** Close the singleton Redis connection */
export async function closeRedisConnection(): Promise<void> {
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}
