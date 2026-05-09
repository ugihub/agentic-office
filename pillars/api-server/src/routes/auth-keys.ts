/**
 * API key management routes.
 *
 * POST   /auth/keys           — create API key (returns plaintext once)
 * GET    /auth/keys           — list keys for user (hashed/masked)
 * DELETE /auth/keys/:keyId    — revoke key
 * POST   /auth/provider-keys  — store encrypted LLM provider key
 * DELETE /auth/provider-keys/:provider — remove provider key
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { ApiKeyModel, UserProviderKeyModel } from "@bureau/models";
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  encryptProviderKey,
} from "@bureau/auth";
import { newId, EntityPrefix } from "@bureau/shared-kernel";
import { createLogger } from "@bureau/telemetry";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const log = createLogger({ division: "ITSSC" });

const CreateApiKeySchema = z
  .object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.string().min(1)).min(1),
    expiresInDays: z.number().int().positive().max(365).optional(),
    rateLimit: z
      .object({
        requestsPerMinute: z.number().int().positive().max(10000).default(60),
        requestsPerDay: z.number().int().positive().max(100000).default(500),
      })
      .optional(),
  })
  .strip();

const StoreProviderKeySchema = z
  .object({
    provider: z.enum([
      "anthropic",
      "google",
      "openai",
      "deepseek",
      "mistral",
      "qwen",
    ]),
    plaintext: z.string().min(10).max(500),
  })
  .strip();

export const authKeyRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/keys — create new API key
  fastify.post(
    "/auth/keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "keys:write", reply);

      const parsed = CreateApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues,
        });
      }

      const { name, permissions, expiresInDays, rateLimit } = parsed.data;
      const generated = generateApiKey(
        auth.tenantId.startsWith("tenant_prod") ? "live" : "test",
      );
      const keyId = newId(EntityPrefix.API_KEY);

      const expiresAt =
        expiresInDays !== undefined
          ? new Date(Date.now() + expiresInDays * 86_400_000)
          : null;

      await ApiKeyModel.create({
        keyId,
        keyHash: hashApiKey(generated.plaintext),
        keyPrefix: extractKeyPrefix(generated.plaintext),
        ownerId: auth.userId,
        tenantId: auth.tenantId,
        name,
        status: "active",
        permissions,
        rateLimit: rateLimit ?? { requestsPerMinute: 60, requestsPerDay: 500 },
        usage: { totalRequests: 0, totalCostUsd: "0" },
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt,
        schemaVersion: "v1",
      });

      log.info({ keyId, tenantId: auth.tenantId, name }, "API key created");

      // Return plaintext ONCE — never retrievable again
      return reply.status(201).send({
        keyId,
        name,
        plaintext: generated.plaintext, // only time this is exposed
        keyPrefix: extractKeyPrefix(generated.plaintext),
        prefix: extractKeyPrefix(generated.plaintext),
        permissions,
        expiresAt: expiresAt?.toISOString() ?? null,
        warning: "Store this key securely. It will not be shown again.",
      });
    },
  );

  // GET /auth/keys — list keys (no plaintext, no hash)
  fastify.get(
    "/auth/keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "keys:read", reply);

      const keys = await ApiKeyModel.find({
        ownerId: auth.userId,
        tenantId: auth.tenantId,
      })
        .select(
          "keyId keyPrefix name status permissions rateLimit usage createdAt lastUsedAt expiresAt",
        )
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      return reply.send({ keys });
    },
  );

  // DELETE /auth/keys/:keyId — revoke
  fastify.delete(
    "/auth/keys/:keyId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "keys:write", reply);
      const { keyId } = request.params as { keyId: string };

      const result = await ApiKeyModel.findOneAndUpdate(
        {
          keyId,
          ownerId: auth.userId,
          tenantId: auth.tenantId,
          status: "active",
        },
        { $set: { status: "revoked" } },
        { new: true },
      ).exec();

      if (result === null) {
        return reply.status(404).send({
          error: "KEY_NOT_FOUND",
          message: "Key not found, already revoked, or access denied",
        });
      }

      log.info({ keyId, userId: auth.userId }, "API key revoked");
      return reply.send({ keyId, status: "revoked", revoked: true });
    },
  );

  // POST /auth/provider-keys — store encrypted provider key
  fastify.post(
    "/auth/provider-keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "provider-keys:write", reply);

      const parsed = StoreProviderKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues,
        });
      }

      const { provider, plaintext } = parsed.data;

      const encResult = await encryptProviderKey(plaintext);
      if (!encResult.ok) {
        log.error(
          { err: encResult.error.message },
          "Provider key encryption failed",
        );
        return reply.status(500).send({ error: "ENCRYPTION_ERROR" });
      }

      const preview = plaintext.slice(-4);

      await UserProviderKeyModel.findOneAndUpdate(
        { userId: auth.userId, provider },
        {
          $set: {
            encryptedKey: encResult.value,
            keyPreview: preview,
            isActive: true,
            lastUsedAt: null,
            schemaVersion: "v1",
          },
          $setOnInsert: {
            userId: auth.userId,
            provider,
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true },
      ).exec();

      log.info({ userId: auth.userId, provider }, "Provider key stored");
      return reply
        .status(201)
        .send({ provider, preview, isActive: true, stored: true });
    },
  );

  // DELETE /auth/provider-keys/:provider — remove provider key
  fastify.delete(
    "/auth/provider-keys/:provider",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "provider-keys:write", reply);
      const { provider } = request.params as { provider: string };

      const result = await UserProviderKeyModel.findOneAndDelete({
        userId: auth.userId,
        provider,
      }).exec();

      if (result === null) {
        return reply
          .status(404)
          .send({ error: "PROVIDER_KEY_NOT_FOUND", provider });
      }

      log.info({ userId: auth.userId, provider }, "Provider key removed");
      return reply.send({ provider, removed: true });
    },
  );

  // GET /auth/provider-keys — list stored provider key metadata (no plaintext)
  fastify.get(
    "/auth/provider-keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "provider-keys:write", reply);

      const keys = await UserProviderKeyModel.find({ userId: auth.userId })
        .select("provider isActive keyPreview lastUsedAt createdAt")
        .lean()
        .exec();

      return reply.send({ keys });
    },
  );
};
