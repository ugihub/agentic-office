/**
 * @bureau/core
 *
 * Framework-agnostic multi-agent orchestration.
 * MUST NOT import from NestJS, Next.js, Fastify, or any web framework.
 *
 * This package must be usable in:
 * - Claude Code MCP (stdio, no server)
 * - Fastify API server
 * - Docker self-hosted
 */

export * from './path-classifier/index.js'
export * from './agents/ssc/index.js'
export * from './agents/csuite/index.js'
export * from './agents/core/index.js'
