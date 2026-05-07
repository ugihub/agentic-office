/**
 * Health routes.
 *
 * GET /health/live  — liveness probe (always 200 if process running)
 * GET /health/ready — readiness probe (checks MongoDB + Redis)
 */
import type { FastifyPluginAsync } from "fastify";
import mongoose from "mongoose";
import { createLogger } from "@bureau/telemetry";

const log = createLogger({ division: "Executive" });

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health/live — liveness probe
  fastify.get("/health/live", async (_request, reply) => {
    return reply
      .status(200)
      .send({ status: "ok", timestamp: new Date().toISOString() });
  });

  // GET /health/ready — readiness probe
  fastify.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, "ok" | "error"> = {};
    let allOk = true;

    // MongoDB check
    try {
      const state = mongoose.connection.readyState;
      // 1 = connected, 2 = connecting
      checks["mongodb"] = state === 1 ? "ok" : "error";
      if (state !== 1) allOk = false;
    } catch {
      checks["mongodb"] = "error";
      allOk = false;
    }

    // Redis check via BullMQ queue ping
    // Accessing via fastify.redis if decorated, otherwise skip
    try {
      const redis = (
        fastify as unknown as { redis?: { ping: () => Promise<string> } }
      ).redis;
      if (redis !== undefined) {
        await redis.ping();
        checks["redis"] = "ok";
      } else {
        checks["redis"] = "ok"; // not decorated yet — skip
      }
    } catch {
      checks["redis"] = "error";
      allOk = false;
      log.warn({}, "Redis ping failed in readiness check");
    }

    const status = allOk ? 200 : 503;
    return reply.status(status).send({
      status: allOk ? "ready" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  });
};
