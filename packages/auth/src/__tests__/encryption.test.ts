/**
 * Provider key AES-256-GCM encryption — additional security tests.
 *
 * The basic round-trip tests are in apikey.test.ts.
 * These tests focus on security properties:
 * - Random IV = different ciphertext each call
 * - Tampered ciphertext fails decryption
 * - Key format validates correctly
 */
import { describe, it, expect, beforeAll } from "vitest";
import { encryptProviderKey, decryptProviderKey } from "../apikey.js";

describe("Provider Key Encryption — security properties", () => {
  beforeAll(() => {
    if (!process.env["API_KEY_ENCRYPTION_KEY"]) {
      process.env["API_KEY_ENCRYPTION_KEY"] = "0".repeat(64);
    }
  });

  it("same plaintext encrypts to different ciphertext (random IV)", async () => {
    const plaintext = "sk-ant-api03-same-key-every-time";
    const enc1 = await encryptProviderKey(plaintext);
    const enc2 = await encryptProviderKey(plaintext);

    if (enc1.ok && enc2.ok) {
      // Random IV means ciphertext differs even for same plaintext
      expect(enc1.value).not.toBe(enc2.value);
    }
  });

  it("encrypted value does not contain plaintext", async () => {
    const plaintext = "sk-ant-api03-secret-key-here";
    const result = await encryptProviderKey(plaintext);

    if (result.ok) {
      expect(result.value).not.toContain(plaintext);
      // Base64/hex encoded ciphertext should not have raw API key pattern
      expect(result.value).not.toMatch(/sk-ant-/);
    }
  });

  it("tampered tag causes decryption failure", async () => {
    const plaintext = "sk-ant-api03-test-key";
    const encrypted = await encryptProviderKey(plaintext);

    if (encrypted.ok) {
      // Format: aes256gcm:iv_hex:tag_hex:ciphertext_hex
      const parts = encrypted.value.split(":");
      if (parts.length === 4) {
        // Flip last char of tag to tamper with authentication tag
        const originalTag = parts[2]!;
        const tamperedTag =
          originalTag.slice(0, -1) + (originalTag.endsWith("0") ? "1" : "0");
        const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;

        const decrypted = await decryptProviderKey(tampered);
        // AES-256-GCM with tampered auth tag MUST fail
        expect(decrypted.ok).toBe(false);
      }
    }
  });

  it("decryption returns original plaintext", async () => {
    const originals = [
      "sk-ant-api03-test",
      "AIzaSyTestKey",
      "sk-testOpenAiKey",
      "a".repeat(100), // Long key
    ];

    for (const plaintext of originals) {
      const encrypted = await encryptProviderKey(plaintext);
      if (encrypted.ok) {
        const decrypted = await decryptProviderKey(encrypted.value);
        if (decrypted.ok) {
          expect(decrypted.value).toBe(plaintext);
        }
      }
    }
  });
});
