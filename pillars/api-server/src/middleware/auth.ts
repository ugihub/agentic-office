/**
 * Auth middleware — JWT RS256 + API key validation.
 *
 * Priority:
 * 1. X-Api-Key header → lookup hash in DB, validate status + permissions
 * 2. Authorization: Bearer <JWT> → verify RS256 signature
 *
 * Both paths set req.authContext with tenantId, userId, permissions.
 * No auth → 401. Wrong permissions → 403.
 */
import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { verifyJwt } from "@bureau/auth";
import { hashApiKey } from "@bureau/auth";
import { ApiKeyModel } from "@bureau/models";
import { createLogger } from "@bureau/telemetry";

export interface AuthContext {
  tenantId: string;
  userId: string;
  permissions: string[];
  authMethod: "jwt" | "api_key";
}

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}

const log = createLogger({ division: "ITSSC" });

/**
 * Lookup API key from DB.
 * Returns null if not found or revoked.
 */
async function lookupApiKey(plaintext: string): Promise<AuthContext | null> {
  const hash = hashApiKey(plaintext);

  const key = await ApiKeyModel.findOne({
    keyHash: hash,
    status: "active",
  })
    .select("ownerId tenantId permissions expiresAt")
    .lean()
    .exec();

  if (key === null) return null;

  // Check expiry
  if (key.expiresAt !== null && key.expiresAt < new Date()) return null;

  // Update last used (fire and forget — don't block response)
  void ApiKeyModel.updateOne(
    { keyHash: hash },
    { $set: { lastUsedAt: new Date() } },
  ).exec();

  return {
    tenantId: key.tenantId,
    userId: key.ownerId,
    permissions: key.permissions,
    authMethod: "api_key",
  };
}

/**
 * Auth middleware plugin.
 * Adds req.authContext to every request.
 * Routes that require auth should call requireAuth() in their handler.
 */
export const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("authContext", null);

  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const apiKey = request.headers["x-api-key"];
      const authHeader = request.headers.authorization;

      if (typeof apiKey === "string" && apiKey.length > 0) {
        // API key auth
        const ctx = await lookupApiKey(apiKey);
        if (ctx !== null) {
          request.authContext = ctx;
          return;
        }
        log.warn({ path: request.url }, "Invalid API key");
      } else if (
        typeof authHeader === "string" &&
        authHeader.startsWith("Bearer ")
      ) {
        // JWT auth
        const token = authHeader.slice(7);
        const result = await verifyJwt(token);
        if (result.ok) {
          request.authContext = {
            tenantId: result.value.tenantId,
            userId: result.value.sub,
            permissions: result.value.permissions,
            authMethod: "jwt",
          };
          return;
        }
        log.warn(
          { path: request.url, err: result.error.message },
          "Invalid JWT",
        );
      }

      // No auth provided — leave authContext as null
      // Routes requiring auth should call requireAuth()
    },
  );
};

/** Require auth context. Call at start of route handlers that need auth. */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): AuthContext {
  if (request.authContext === null) {
    void reply.status(401).send({
      error: "UNAUTHORIZED",
      message:
        "Authentication required. Provide X-Api-Key or Authorization: Bearer <JWT>",
    });
    throw new Error("UNAUTHORIZED"); // Fastify catches this
  }
  return request.authContext;
}

/** Check permission. Returns 403 if missing. */
export function requirePermission(
  ctx: AuthContext,
  permission: string,
  reply: FastifyReply,
): void {
  if (!ctx.permissions.includes(permission)) {
    void reply.status(403).send({
      error: "FORBIDDEN",
      message: `Permission required: ${permission}`,
    });
    throw new Error("FORBIDDEN");
  }
}

export default fp(authPlugin, { name: "bureau-auth" });
