/**
 * API Key management — hashing, validation, generation.
 *
 * CRITICAL: NEVER store plaintext API keys. Only store SHA-256 hash.
 * Format: bureau_live_<random32bytes_base62>
 * Example: bureau_live_aBcD1234XyZw...
 *
 * The key is shown to the user ONCE on creation.
 * Subsequent validation: hash incoming key, compare with stored hash.
 */
import { createHash, randomBytes } from "node:crypto";
import { type Result, ok, err } from "@bureau/shared-kernel";

export type ApiKeyEnvironment = "live" | "test";

export interface GeneratedApiKey {
  /** The full key — show to user ONCE, never store this */
  plaintext: string;
  /** SHA-256 hash — store in DB */
  hash: string;
  /** First 16 chars — store in DB for UI display */
  prefix: string;
  environment: ApiKeyEnvironment;
}

/**
 * Generate a new API key.
 * Returns both plaintext (show once) and hash (store in DB).
 */
export function generateApiKey(
  environment: ApiKeyEnvironment = "live",
): GeneratedApiKey {
  const randomPart = randomBytes(32).toString("base64url");
  const plaintext = `bureau_${environment}_${randomPart}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.substring(0, 16);

  return { plaintext, hash, prefix, environment };
}

/**
 * Hash an API key for storage/comparison.
 * Uses SHA-256 — not bcrypt, because API keys are already high-entropy random.
 */
export function hashApiKey(plaintext: string): string {
  return `sha256:${createHash("sha256").update(plaintext).digest("hex")}`;
}

/**
 * Validate format of an API key (cheap pre-check before DB lookup).
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^bureau_(live|test)_[A-Za-z0-9_-]{43}$/.test(key);
}

/**
 * Extract prefix from plaintext key (for DB lookup hint).
 */
export function extractKeyPrefix(plaintext: string): string {
  return plaintext.substring(0, 16);
}

/**
 * Encrypt a user-provided LLM API key for storage.
 * Uses AES-256-GCM — REVERSIBLE (unlike hashing), so we can use it for API calls.
 *
 * Key from env: API_KEY_ENCRYPTION_KEY (32-byte hex)
 */
export async function encryptProviderKey(
  plaintext: string,
): Promise<Result<string, Error>> {
  try {
    const encryptionKeyHex = process.env["API_KEY_ENCRYPTION_KEY"];
    if (!encryptionKeyHex) {
      return err(new Error("API_KEY_ENCRYPTION_KEY not set"));
    }

    const keyBuffer = Buffer.from(encryptionKeyHex, "hex");
    const { createCipheriv } = await import("node:crypto");

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: aes256gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>
    const result = `aes256gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Decrypt a stored LLM API key for use.
 */
export async function decryptProviderKey(
  encrypted: string,
): Promise<Result<string, Error>> {
  try {
    const encryptionKeyHex = process.env["API_KEY_ENCRYPTION_KEY"];
    if (!encryptionKeyHex) {
      return err(new Error("API_KEY_ENCRYPTION_KEY not set"));
    }

    const parts = encrypted.split(":");
    if (parts.length !== 4 || parts[0] !== "aes256gcm") {
      return err(new Error("Invalid encrypted key format"));
    }

    const [, ivHex, tagHex, ciphertextHex] = parts;
    if (!ivHex || !tagHex || !ciphertextHex) {
      return err(new Error("Invalid encrypted key parts"));
    }

    const keyBuffer = Buffer.from(encryptionKeyHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const { createDecipheriv } = await import("node:crypto");
    const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return ok(decrypted.toString("utf8"));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
