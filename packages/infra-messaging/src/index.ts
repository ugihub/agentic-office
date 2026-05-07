/**
 * @bureau/infra-messaging
 *
 * BullMQ-based messaging infrastructure.
 * ADR-001: BullMQ-only. No RabbitMQ. Redis boundary rule enforced here.
 */

export {
  getRedisConnection,
  createRedisConnection,
  closeRedisConnection,
  type RedisConnectionOptions,
} from "./redis.js";

export { getQueue, enqueueJob, closeAllQueues } from "./queues.js";

export {
  createWorker,
  getAttemptReason,
  BUREAU_WORKER_OPTIONS,
  type BureauWorkerOptions,
} from "./worker.js";
