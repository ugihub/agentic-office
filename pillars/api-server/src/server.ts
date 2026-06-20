/**
 * Bureau API Server — Fastify 5 entry point.
 *
 * Startup order:
 * 1. Build Fastify instance with logging + body size limits
 * 2. Register security plugins (CORS, Helmet, rate-limit)
 * 3. Register auth plugin
 * 4. Register routes (health, tasks, auth-keys)
 * 5. Connect MongoDB
 * 6. Start listening
 * 7. SIGTERM → graceful shutdown (drain in-flight, close connections)
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import mongoose from "mongoose";
import { createLogger } from "@bureau/telemetry";
import { initJwtKeys } from "@bureau/auth";
import {
  installGracefulShutdown,
  registerCleanupHandler,
} from "@bureau/agents-core";
import authPlugin from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { taskRoutes } from "./routes/tasks.js";
import { authKeyRoutes } from "./routes/auth-keys.js";
import { getJwtPemEnv } from "./server-env.js";

const log = createLogger({ division: "Executive" });

// ─── Environment ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const MONGO_URI =
  process.env["MONGO_URI"] ?? "mongodb://localhost:27017/bureau";
const RATE_LIMIT_MAX = parseInt(process.env["RATE_LIMIT_MAX"] ?? "100", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env["RATE_LIMIT_WINDOW_MS"] ?? "60000",
  10,
);

// ─── Build server ─────────────────────────────────────────────────────────────

export async function buildServer() {
  const fastify = Fastify({
    logger: false, // Use Pino from @bureau/telemetry instead
    bodyLimit: 1_048_576, // 1 MB max body
    requestTimeout: 30_000,
  });

  // CORS — allow configured origins
  const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .filter(Boolean);
  await fastify.register(cors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Api-Key",
      "Idempotency-Key",
    ],
    credentials: true,
  });

  // Helmet — security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // API server, no HTML
  });

  // Rate limiting — sliding window via Redis if available, in-memory fallback
  await fastify.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW_MS,
    // Exempt health probes from rate limiting
    skipOnError: true,
    keyGenerator: (request) => {
      const apiKey = request.headers["x-api-key"];
      // BUG-8: previously used `apiKey.slice(0, 16)` as the bucket key.
      // Two problems:
      //   1. The first 16 chars of an API key are a stable, identifiable
      //      fingerprint — storing it in the rate-limit store (typically
      //      Redis) leaks tenant identity to anyone with read access.
      //   2. An attacker can flood with crafted keys whose first 16 chars
      //      collide with a victim's prefix to exhaust the victim's
      //      quota, OR send unique-looking keys to dodge the limit
      //      entirely (each request creates a new bucket).
      // Fix: hash the full key with SHA-256 so the bucket is keyed by a
      // non-reversible, high-entropy digest. Reject obviously malformed
      // keys by routing them to the IP bucket (prevents the dodge
      // attack) — they will still be rejected by auth downstream, but
      // rate limiting applies first.
      if (typeof apiKey === "string" && apiKey.length > 0) {
        const looksValid = /^bureau_(live|test)_[A-Za-z0-9_-]+$/.test(apiKey);
        if (!looksValid) return `ip:${request.ip}`;
        const { createHash } =
          require("node:crypto") as typeof import("node:crypto");
        const digest = createHash("sha256")
          .update(apiKey)
          .digest("hex")
          .slice(0, 32);
        return `apikey:${digest}`;
      }
      return `ip:${request.ip}`;
    },
  });

  // Auth plugin — populates req.authContext
  await fastify.register(authPlugin);

  // Routes — health first (no auth required).
  // BUG-18: routes are intentionally registered TWICE — once at root
  // and once under /api/v1 — to support both legacy callers and
  // versioned API clients without breaking either. The duplication
  // is documented here so future maintainers do not "fix" it.
  // If you need to drop one, ensure no caller in the wild depends
  // on the dropped prefix (check dashboards, mcp-server, scripts).
  await fastify.register(healthRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(authKeyRoutes);
  await fastify.register(healthRoutes, { prefix: "/api/v1" });
  await fastify.register(taskRoutes, { prefix: "/api/v1" });
  await fastify.register(authKeyRoutes, { prefix: "/api/v1" });

  // Global error handler
  fastify.setErrorHandler((error: Error, request, reply) => {
    // Auth/permission throws are caught here
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return; // Reply already sent by requireAuth/requirePermission
    }
    log.error(
      { err: error.message, path: request.url, method: request.method },
      "Unhandled route error",
    );
    void reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((_request, reply) => {
    void reply
      .status(404)
      .send({ error: "NOT_FOUND", message: "Route not found" });
  });

  return fastify;
}

// ─── MongoDB connection ───────────────────────────────────────────────────────

async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 2,
  });
  log.info(
    { uri: MONGO_URI.replace(/\/\/.*@/, "//***@") },
    "MongoDB connected",
  );
}

// ─── JWT key initialization ───────────────────────────────────────────────────

async function initAuth(): Promise<void> {
  const { privateKeyPem, publicKeyPem } = getJwtPemEnv();

  if (privateKeyPem === "" || publicKeyPem === "") {
    log.warn(
      {},
      "JWT keys not configured — auth will fail for JWT tokens (dev mode)",
    );
    return;
  }

  const result = await initJwtKeys(privateKeyPem, publicKeyPem);
  if (!result.ok) {
    throw new Error(`JWT key initialization failed: ${result.error.message}`);
  }
  log.info({}, "JWT RS256 keys loaded");
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function setupGracefulShutdown(
  fastify: Awaited<ReturnType<typeof buildServer>>,
): void {
  // Register cleanup in shutdown order
  registerCleanupHandler("fastify", async () => {
    await fastify.close();
    log.info({}, "Fastify closed — all in-flight requests drained");
  });
  registerCleanupHandler("mongodb", async () => {
    await mongoose.disconnect();
    log.info({}, "MongoDB disconnected");
  });

  installGracefulShutdown({
    drainTimeoutMs: parseInt(process.env["SHUTDOWN_DRAIN_MS"] ?? "30000", 10),
    log: (msg: string, meta?: Record<string, unknown>) =>
      log.info(meta ?? {}, msg),
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await initAuth();
    await connectMongo();

    const server = await buildServer();
    setupGracefulShutdown(server);

    await server.listen({ port: PORT, host: HOST });
    log.info({ port: PORT, host: HOST }, "Bureau API server listening");
  } catch (err) {
    log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

void main();
