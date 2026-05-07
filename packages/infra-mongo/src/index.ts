/**
 * @bureau/infra-mongo
 *
 * MongoDB infrastructure layer.
 * IMPORTANT: Never import from business logic — only infra and service layers.
 */

export {
  connectMongo,
  disconnectMongo,
  getConnectionState,
  isMongoConnected,
  getConnection,
  pingMongo,
  type MongoContextOptions,
  type MongoConnectionState,
} from "./context.js";

export { BaseRepository, type FindOptions } from "./repository.js";

export {
  OutboxModel,
  createOutboxEntry,
  getPendingOutboxEntries,
  markOutboxCompleted,
  markOutboxFailed,
  type OutboxDocument,
  type OutboxEntry,
} from "./outbox.js";
