/**
 * Graceful shutdown handler for all Bureau services.
 *
 * SIGTERM flow (Kubernetes-safe):
 * 1. Stop accepting new requests
 * 2. Drain in-flight BullMQ jobs (wait up to drainTimeoutMs)
 * 3. Close MongoDB connection
 * 4. Close Redis connection
 * 5. Exit 0
 *
 * AbortController propagation:
 * - Root AbortController created on SIGTERM
 * - Signal passed into all AgentContext
 * - Every agent checks signal before expensive operations
 */

export interface ShutdownOptions {
  /** Max ms to wait for in-flight work to complete (default: 30000) */
  drainTimeoutMs?: number | undefined
  /** Custom log function (default: console.error) */
  log?: ((msg: string, meta?: Record<string, unknown>) => void) | undefined
}

export interface CleanupHandler {
  name: string
  handler: () => Promise<void>
}

const _cleanupHandlers: CleanupHandler[] = []
let _isShuttingDown = false
let _rootAbortController: AbortController | null = null

/**
 * Register a cleanup handler to run on shutdown.
 * Handlers run in registration order.
 */
export function registerCleanupHandler(name: string, handler: () => Promise<void>): void {
  _cleanupHandlers.push({ name, handler })
}

/**
 * Get the root AbortSignal for propagating cancellation to agents.
 * Returns an already-aborted signal if shutdown is in progress.
 */
export function getRootAbortSignal(): AbortSignal {
  if (_rootAbortController === null) {
    _rootAbortController = new AbortController()
  }
  return _rootAbortController.signal
}

/**
 * Install SIGTERM and SIGINT handlers.
 * Call this once at process startup in each service.
 *
 * @example
 * ```ts
 * import { installGracefulShutdown, registerCleanupHandler } from '@bureau/agents-core'
 *
 * registerCleanupHandler('mongodb', () => disconnectMongo())
 * registerCleanupHandler('redis', () => redis.quit())
 * registerCleanupHandler('bullmq-workers', () => Promise.all(workers.map(w => w.close())))
 *
 * installGracefulShutdown({ drainTimeoutMs: 30000 })
 * ```
 */
export function installGracefulShutdown(options: ShutdownOptions = {}): void {
  const { drainTimeoutMs = 30_000, log = console.error } = options

  const shutdown = async (signal: string): Promise<void> => {
    if (_isShuttingDown) {
      log(`[shutdown] Already shutting down, ignoring ${signal}`)
      return
    }

    _isShuttingDown = true
    log(`[shutdown] ${signal} received — starting graceful shutdown`, {
      drainTimeoutMs,
      handlerCount: _cleanupHandlers.length,
    })

    // Abort all in-flight agent work
    if (_rootAbortController === null) {
      _rootAbortController = new AbortController()
    }
    _rootAbortController.abort()
    log('[shutdown] Root AbortController aborted — signalling all agents')

    // Allow drain window
    const drainStart = Date.now()
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(drainTimeoutMs, 5000)))

    log('[shutdown] Running cleanup handlers', {
      elapsed: Date.now() - drainStart,
    })

    // Run cleanup handlers sequentially (order matters: workers → redis → mongo)
    for (const { name, handler } of _cleanupHandlers) {
      try {
        await Promise.race([
          handler(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('cleanup timeout')), 10_000),
          ),
        ])
        log(`[shutdown] Cleanup completed: ${name}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log(`[shutdown] Cleanup failed (non-fatal): ${name}`, { err: msg })
      }
    }

    log('[shutdown] All cleanup done — exiting', {
      totalMs: Date.now() - drainStart,
    })

    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Unhandled rejection guard — log but don't crash
  process.on('unhandledRejection', (reason: unknown) => {
    log('[process] Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    })
  })

  process.on('uncaughtException', (error: Error) => {
    log('[process] Uncaught exception — initiating shutdown', {
      err: error.message,
      stack: error.stack,
    })
    void shutdown('uncaughtException')
  })
}

/** Check if shutdown is in progress */
export function isShuttingDown(): boolean {
  return _isShuttingDown
}

/**
 * Create a child AbortController that is also aborted when the root shuts down.
 * Use for per-task cancellation that respects both task cancel AND global shutdown.
 */
export function createTaskAbortController(
  taskAbortSignal?: AbortSignal | undefined,
): AbortController {
  const controller = new AbortController()
  const rootSignal = getRootAbortSignal()

  // Abort child if root shuts down
  if (rootSignal.aborted) {
    controller.abort()
    return controller
  }

  rootSignal.addEventListener('abort', () => controller.abort(), { once: true })

  // Also abort child if task-level cancel is requested
  if (taskAbortSignal) {
    if (taskAbortSignal.aborted) {
      controller.abort()
    } else {
      taskAbortSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  return controller
}
