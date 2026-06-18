import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.resetModules();
});

describe("API server environment contract", () => {
  it("accepts JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM in production", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY_PEM: "[REDACTED BEGIN PRIVATE KEY]\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
      JWT_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg\n-----END PUBLIC KEY-----",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(getJwtPemEnv()).toEqual({
      privateKeyPem: "[REDACTED BEGIN PRIVATE KEY]\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg\n-----END PUBLIC KEY-----",
    });
  });

  it("does not use legacy JWT_PRIVATE_KEY names silently in production when PEM vars are empty", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY: "private",
      JWT_PUBLIC_KEY: "public",
      JWT_PRIVATE_KEY_PEM: "",
      JWT_PUBLIC_KEY_PEM: "",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(() => getJwtPemEnv()).toThrow(/JWT_PRIVATE_KEY_PEM/);
    expect(() => getJwtPemEnv()).toThrow(/JWT_PUBLIC_KEY_PEM/);
  });

  it("does not use legacy JWT_PRIVATE_KEY names silently in production when PEM vars are missing", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY: "private",
      JWT_PUBLIC_KEY: "public",
    };
    delete process.env["JWT_PRIVATE_KEY_PEM"];
    delete process.env["JWT_PUBLIC_KEY_PEM"];

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(() => getJwtPemEnv()).toThrow(/JWT_PRIVATE_KEY_PEM/);
    expect(() => getJwtPemEnv()).toThrow(/JWT_PUBLIC_KEY_PEM/);
  });

  it("allows empty JWT PEM values outside production", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      JWT_PRIVATE_KEY_PEM: "",
      JWT_PUBLIC_KEY_PEM: "",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(getJwtPemEnv()).toEqual({ privateKeyPem: "", publicKeyPem: "" });
  });

  it("throws in production when JWT_PRIVATE_KEY_PEM contains literal '\\n' escape sequences (escaped-newline bug class)", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----",
      JWT_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\\nMIIE...\\n-----END PUBLIC KEY-----",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(() => getJwtPemEnv()).toThrow(/literal '\\n' escape sequences/);
  });

  it("throws in production when JWT_PRIVATE_KEY_PEM is set but not a real PEM (missing header)", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY_PEM: "not-a-pem-at-all",
      JWT_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nMIIE...\n-----END PUBLIC KEY-----",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(() => getJwtPemEnv()).toThrow(/does not look like a PKCS#8 PEM/);
  });

  it("accepts well-formed PEMs in production (header + footer present)", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      JWT_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      JWT_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nMIIE\n-----END PUBLIC KEY-----",
    };

    const { getJwtPemEnv } = await import("../server-env.js");

    expect(() => getJwtPemEnv()).not.toThrow();
  });
});
