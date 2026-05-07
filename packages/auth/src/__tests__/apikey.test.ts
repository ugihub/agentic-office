import { describe, it, expect, beforeEach } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  extractKeyPrefix,
  encryptProviderKey,
  decryptProviderKey,
} from "../apikey.js";

describe("API Key management", () => {
  describe("generateApiKey()", () => {
    it("generates live key with correct format", () => {
      const { plaintext, hash, prefix, environment } = generateApiKey("live");
      expect(plaintext).toMatch(/^bureau_live_/);
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(prefix).toBe(plaintext.substring(0, 16));
      expect(environment).toBe("live");
    });

    it("generates test key with correct format", () => {
      const { plaintext } = generateApiKey("test");
      expect(plaintext).toMatch(/^bureau_test_/);
    });

    it("generates unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1.plaintext).not.toBe(key2.plaintext);
      expect(key1.hash).not.toBe(key2.hash);
    });

    it("hash does not equal plaintext", () => {
      const { plaintext, hash } = generateApiKey();
      expect(hash).not.toBe(plaintext);
    });
  });

  describe("hashApiKey()", () => {
    it("produces consistent hash for same input", () => {
      const key = "bureau_live_testkey123";
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it("produces different hashes for different inputs", () => {
      expect(hashApiKey("key1")).not.toBe(hashApiKey("key2"));
    });

    it("produces sha256: prefixed output", () => {
      expect(hashApiKey("test")).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe("isValidApiKeyFormat()", () => {
    it("accepts valid live key", () => {
      const { plaintext } = generateApiKey("live");
      expect(isValidApiKeyFormat(plaintext)).toBe(true);
    });

    it("rejects empty string", () => {
      expect(isValidApiKeyFormat("")).toBe(false);
    });

    it("rejects key without prefix", () => {
      expect(isValidApiKeyFormat("randomstring123")).toBe(false);
    });

    it("rejects key with wrong prefix", () => {
      expect(isValidApiKeyFormat("notbureau_live_abc123")).toBe(false);
    });
  });

  describe("encrypt/decrypt provider key", () => {
    beforeEach(() => {
      // Set test encryption key (32 bytes = 64 hex chars)
      process.env["API_KEY_ENCRYPTION_KEY"] = "a".repeat(64);
    });

    it("encrypts and decrypts a provider key", async () => {
      const plaintext = "sk-ant-api03-supersecretkey123";
      const encrypted = await encryptProviderKey(plaintext);
      expect(encrypted.ok).toBe(true);

      if (!encrypted.ok) return;
      expect(encrypted.value).toMatch(/^aes256gcm:/);

      const decrypted = await decryptProviderKey(encrypted.value);
      expect(decrypted.ok).toBe(true);
      if (decrypted.ok) expect(decrypted.value).toBe(plaintext);
    });

    it("fails without encryption key", async () => {
      const savedKey = process.env["API_KEY_ENCRYPTION_KEY"];
      delete process.env["API_KEY_ENCRYPTION_KEY"];

      const result = await encryptProviderKey("test");
      expect(result.ok).toBe(false);

      process.env["API_KEY_ENCRYPTION_KEY"] = savedKey;
    });

    it("fails decryption of tampered ciphertext", async () => {
      const plaintext = "sk-test-key";
      const encrypted = await encryptProviderKey(plaintext);
      if (!encrypted.ok) return;

      // Tamper with ciphertext
      const tampered = encrypted.value.slice(0, -4) + "ffff";
      const result = await decryptProviderKey(tampered);
      expect(result.ok).toBe(false);
    });
  });
});
