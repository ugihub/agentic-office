/**
 * ULID — Universally Unique Lexicographically Sortable Identifier
 *
 * Convention: all IDs in Bureau are ULIDs, prefixed by entity type.
 * Format: <prefix>_<ulid>
 * Example: task_01HXYZABC123...
 */
import { ulid as generateUlid, monotonicFactory } from "ulid";

const monotonicUlid = monotonicFactory();

/** Generate a new ULID (monotonic-safe within same millisecond) */
export function newUlid(): string {
  return monotonicUlid();
}

/** Generate a prefixed ID for a specific entity type */
export function newId(prefix: EntityPrefix): string {
  return `${prefix}_${newUlid()}`;
}

/** All entity ID prefixes used in Bureau */
export const EntityPrefix = {
  TASK: "task",
  TENANT: "tenant",
  USER: "user",
  AGENT: "agent",
  EXECUTION: "exec",
  WORKER: "worker",
  MESSAGE: "msg",
  OUTBOX: "out",
  API_KEY: "key",
  COST_EVENT: "evt",
  CORRELATION: "corr",
} as const;

export type EntityPrefix = (typeof EntityPrefix)[keyof typeof EntityPrefix];

/** Type-safe ID branded type */
export type BureauId<P extends EntityPrefix> = `${P}_${string}`;

/** Type-safe ID factory */
export function newTypedId<P extends EntityPrefix>(prefix: P): BureauId<P> {
  return `${prefix}_${newUlid()}` as BureauId<P>;
}

/** Validate that a string is a valid prefixed ULID */
export function isValidId(id: string, prefix: EntityPrefix): boolean {
  const parts = id.split("_");
  if (parts.length !== 2) return false;
  if (parts[0] !== prefix) return false;
  // ULID is 26 chars
  return (parts[1]?.length ?? 0) === 26;
}

/** Extract timestamp from a ULID-based ID */
export function extractTimestamp(id: string): Date {
  const ulidPart = id.includes("_") ? (id.split("_")[1] ?? id) : id;
  // Decode first 10 chars of ULID as timestamp (Crockford base32)
  const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const timeStr = ulidPart.substring(0, 10).toUpperCase();
  let timestamp = 0;
  for (const char of timeStr) {
    const idx = ENCODING.indexOf(char);
    if (idx === -1) throw new Error(`Invalid ULID character: ${char}`);
    timestamp = timestamp * 32 + idx;
  }
  return new Date(timestamp);
}

// Re-export for convenience
export { generateUlid };
