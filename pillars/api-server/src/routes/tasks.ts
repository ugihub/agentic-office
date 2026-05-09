/**
 * Task routes — all task-related endpoints.
 *
 * POST   /tasks              — create task
 * GET    /tasks              — list tasks for tenant
 * GET    /tasks/:taskId      — full envelope
 * GET    /tasks/:taskId/status — status + pending decision
 * GET    /tasks/:taskId/stream — SSE real-time
 * POST   /tasks/:taskId/cancel
 * POST   /tasks/:taskId/decision
 * POST   /tasks/:taskId/feedback
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateTaskRequestSchema,
  TaskDecisionRequestSchema,
  TaskFeedbackRequestSchema,
  QUEUE_NAMES,
} from "@bureau/contracts";
import { TaskEnvelopeModel } from "@bureau/models";
import { newId, EntityPrefix } from "@bureau/shared-kernel";
import { classifyTask } from "@bureau/core";
import { createLogger } from "@bureau/telemetry";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { createOutboxEntry } from "@bureau/infra-mongo";

const log = createLogger({ division: "Executive" });

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /tasks — Submit new task
  fastify.post(
    "/tasks",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:write", reply);

      // Idempotency-Key handling
      const idempotencyKey = request.headers["idempotency-key"];

      if (typeof idempotencyKey === "string") {
        // Check if we already processed this request
        const existing = await TaskEnvelopeModel.findOne({
          idempotencyKey,
          tenantId: auth.tenantId,
        })
          .select("taskId currentStage submittedAt")
          .lean()
          .exec();

        if (existing !== null) {
          return reply.status(200).send({
            taskId: existing.taskId,
            currentStage: existing.currentStage,
            idempotent: true,
          });
        }
      }

      // Validate request body
      const parsed = CreateTaskRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          issues: parsed.error.issues,
        });
      }

      const body = parsed.data;
      const { path: executionPath, tokenCount } = classifyTask(body.prompt);
      const taskId = newId(EntityPrefix.TASK);

      log.info(
        { taskId, tenantId: auth.tenantId, executionPath, tokenCount },
        "Task submitted",
      );

      // Create task envelope
      const maxCostUsd = body.constraints?.maxCostUsd ?? "0.50";

      await TaskEnvelopeModel.create({
        taskId,
        tenantId: auth.tenantId,
        userId: auth.userId,
        submittedAt: new Date(),
        completedAt: null,
        currentStage: "Submitted",
        stageVersion: 0,
        executionPath,
        originalRequest: {
          prompt: body.prompt,
          constraints: {
            maxCostUsd,
            maxLatencyMs: body.constraints?.maxLatencyMs ?? 30000,
            preferredModelTier:
              body.constraints?.preferredModelTier ?? "standard",
          },
          outputFormat: body.outputFormat,
          metadata: body.metadata ?? {},
        },
        routing: null,
        budget: {
          maxCostUsd,
          reservedUsd: "0",
          consumed: { tokensIn: 0, tokensOut: 0, costUsd: "0" },
          reservations: [],
        },
        pendingDecision: null,
        intermediateOutputs: { research: null, production: null, qa: null },
        finalOutput: null,
        outputQuality: null,
        stateTransitions: [],
        retryCount: { production: 0, qa: 0 },
        cancellationRequested: false,
        idempotencyKey:
          typeof idempotencyKey === "string" ? idempotencyKey : null,
        schemaVersion: "v1",
      });

      // Dispatch to CEO queue via outbox pattern (guarantees at-least-once delivery)
      const correlationId = newId(EntityPrefix.CORRELATION);
      const outboxResult = await createOutboxEntry({
        targetQueue: QUEUE_NAMES.CEO,
        jobName: "SubmitTaskCommand",
        jobData: {
          _type: "SubmitTaskCommand",
          taskId,
          tenantId: auth.tenantId,
          userId: auth.userId,
          correlationId,
          header: {
            correlationId,
            causationId: null,
            traceparent: null,
            schemaVersion: "v1",
          },
        },
        correlationId,
      });

      if (!outboxResult.ok) {
        log.error(
          { taskId, err: outboxResult.error.message },
          "Failed to create outbox entry — task created but not dispatched",
        );
        // Task is in MongoDB but not queued — return 202 with a warning
        // Outbox publisher will retry if the DB write succeeded
      } else {
        log.info(
          { taskId, outboxId: outboxResult.value, executionPath },
          "Task queued via outbox",
        );
      }

      return reply.status(202).send({
        taskId,
        currentStage: "Submitted",
        executionPath,
        message: "Task submitted successfully",
      });
    },
  );

  // GET /tasks — List tasks for tenant
  fastify.get(
    "/tasks",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:read", reply);

      const query = request.query as {
        limit?: string;
        skip?: string;
        stage?: string;
      };
      const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
      const skip = parseInt(query.skip ?? "0", 10);

      const filter: Record<string, unknown> = { tenantId: auth.tenantId };
      if (query.stage) filter["currentStage"] = query.stage;

      const rawTasks = await TaskEnvelopeModel.find(filter)
        .select(
          "taskId tenantId currentStage executionPath submittedAt completedAt updatedAt outputQuality pendingDecision budget.consumed.costUsd originalRequest.prompt",
        )
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      const tasks = rawTasks.map((t) => {
        const budget = t.budget as
          | { consumed: { costUsd: { toString(): string } } }
          | undefined;
        const req = t.originalRequest as { prompt?: string } | undefined;
        return {
          taskId: t.taskId,
          tenantId: t.tenantId,
          currentStage: t.currentStage,
          executionPath: t.executionPath,
          submittedAt: t.submittedAt,
          createdAt: t.submittedAt, // alias — SDK TaskEnvelope uses createdAt
          updatedAt: t.updatedAt,
          completedAt: t.completedAt,
          outputQuality: t.outputQuality ?? null,
          pendingDecision:
            (t.pendingDecision as unknown as Record<string, unknown> | null) ??
            null,
          promptPreview: req?.prompt?.slice(0, 60) ?? null,
          costUsd: budget?.consumed.costUsd?.toString() ?? null,
        };
      });

      return reply.send({ tasks, limit, skip });
    },
  );

  // GET /tasks/:taskId — Full envelope
  fastify.get(
    "/tasks/:taskId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:read", reply);
      const { taskId } = request.params as { taskId: string };

      const task = await TaskEnvelopeModel.findOne({
        taskId,
        tenantId: auth.tenantId,
      })
        .lean()
        .exec();

      if (task === null) {
        return reply.status(404).send({ error: "TASK_NOT_FOUND", taskId });
      }

      return reply.send(task);
    },
  );

  // GET /tasks/:taskId/status
  fastify.get(
    "/tasks/:taskId/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:read", reply);
      const { taskId } = request.params as { taskId: string };

      const task = await TaskEnvelopeModel.findOne({
        taskId,
        tenantId: auth.tenantId,
      })
        .select(
          "taskId currentStage executionPath stageVersion submittedAt completedAt outputQuality pendingDecision retryCount",
        )
        .lean()
        .exec();

      if (task === null) {
        return reply.status(404).send({ error: "TASK_NOT_FOUND", taskId });
      }

      return reply.send({
        taskId: task.taskId,
        currentStage: task.currentStage,
        executionPath: task.executionPath,
        stageVersion: task.stageVersion,
        submittedAt: task.submittedAt,
        completedAt: task.completedAt,
        outputQuality: task.outputQuality,
        pendingDecision: task.pendingDecision ?? null,
        retryCount: task.retryCount,
      });
    },
  );

  // GET /tasks/:taskId/stream — SSE
  fastify.get(
    "/tasks/:taskId/stream",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:read", reply);
      const { taskId } = request.params as { taskId: string };

      // Verify task exists and belongs to tenant
      const task = await TaskEnvelopeModel.findOne({
        taskId,
        tenantId: auth.tenantId,
      })
        .select("taskId currentStage")
        .lean()
        .exec();

      if (task === null) {
        return reply.status(404).send({ error: "TASK_NOT_FOUND", taskId });
      }

      // Set SSE headers
      void reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send initial status
      const sendEvent = (eventType: string, data: unknown): void => {
        reply.raw.write(
          `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
        );
      };

      sendEvent("connected", { taskId, currentStage: task.currentStage });

      // Poll for updates (simplified — production would use MongoDB change streams)
      let lastStageVersion = -1;
      let lastStage: string = task.currentStage;
      const poll = setInterval(async () => {
        const current = await TaskEnvelopeModel.findOne({
          taskId,
          tenantId: auth.tenantId,
        })
          .select(
            "currentStage stageVersion pendingDecision finalOutput outputQuality budget.consumed.costUsd intermediateOutputs.qa retryCount",
          )
          .lean()
          .exec();

        if (current === null) {
          clearInterval(poll);
          reply.raw.end();
          return;
        }

        if (current.stageVersion !== lastStageVersion) {
          const prevStage = lastStage;
          lastStageVersion = current.stageVersion;
          lastStage = current.currentStage;
          const at = new Date().toISOString();

          if (current.currentStage === "AwaitingUserDecision") {
            sendEvent("decision_required", {
              taskId,
              pendingDecision: current.pendingDecision,
            });
          } else if (current.currentStage === "Completed") {
            sendEvent("task.completed", {
              taskId,
              output: current.finalOutput,
              outputQuality: current.outputQuality,
              costUsd: String(
                (
                  current.budget as {
                    consumed: { costUsd: { toString(): string } };
                  }
                ).consumed.costUsd,
              ),
            });
            clearInterval(poll);
            reply.raw.end();
          } else if (current.currentStage === "Failed") {
            const qaOutput = current.intermediateOutputs?.qa as
              | { failureReason?: string }
              | null
              | undefined;
            sendEvent("task.failed", {
              taskId,
              reason: qaOutput?.failureReason ?? "Task failed",
              attempts:
                (current.retryCount as { production: number }).production + 1,
            });
            clearInterval(poll);
            reply.raw.end();
          } else if (current.currentStage === "Cancelled") {
            sendEvent("task.cancelled", { taskId });
            clearInterval(poll);
            reply.raw.end();
          } else {
            sendEvent("task.stage.changed", {
              taskId,
              from: prevStage,
              to: current.currentStage,
              at,
            });
          }
        }
      }, 1000);

      // Cleanup on disconnect
      request.raw.on("close", () => {
        clearInterval(poll);
      });

      // Keep connection alive
      await new Promise<void>((resolve) => {
        request.raw.on("close", resolve);
      });
    },
  );

  // POST /tasks/:taskId/cancel
  fastify.post(
    "/tasks/:taskId/cancel",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:write", reply);
      const { taskId } = request.params as { taskId: string };

      const result = await TaskEnvelopeModel.findOneAndUpdate(
        {
          taskId,
          tenantId: auth.tenantId,
          currentStage: {
            $nin: ["Completed", "Failed", "Cancelled"],
          },
        },
        {
          $set: {
            cancellationRequested: true,
            currentStage: "Cancelled",
          },
          $inc: { stageVersion: 1 },
          $push: {
            stateTransitions: {
              from: "unknown",
              to: "Cancelled",
              at: new Date(),
              byAgent: "user",
              correlationId: auth.userId,
            },
          },
        },
        { new: true },
      ).exec();

      if (result === null) {
        return reply.status(409).send({
          error: "CONFLICT",
          message: "Task not found or already in terminal state",
        });
      }

      return reply.send({ taskId, currentStage: "Cancelled", cancelled: true });
    },
  );

  // POST /tasks/:taskId/decision
  fastify.post(
    "/tasks/:taskId/decision",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:write", reply);
      const { taskId } = request.params as { taskId: string };

      const parsed = TaskDecisionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues,
        });
      }

      const { action } = parsed.data;

      // Verify task is in AwaitingUserDecision
      const task = await TaskEnvelopeModel.findOne({
        taskId,
        tenantId: auth.tenantId,
        currentStage: "AwaitingUserDecision",
      })
        .select("pendingDecision currentStage")
        .lean()
        .exec();

      if (task === null) {
        return reply.status(409).send({
          error: "CONFLICT",
          message: "Task not in AwaitingUserDecision state or not found",
        });
      }

      // Check expiry
      if (
        task.pendingDecision?.expiresAt &&
        task.pendingDecision.expiresAt < new Date()
      ) {
        return reply.status(409).send({
          error: "DECISION_EXPIRED",
          message:
            "Decision window has expired. Default action was auto-executed.",
        });
      }

      // Apply decision
      const newStage =
        action === "cancel"
          ? "Cancelled"
          : action === "add_budget"
            ? "Submitted"
            : "Formatting";
      const correlationId = newId(EntityPrefix.CORRELATION);

      await TaskEnvelopeModel.updateOne(
        {
          taskId,
          tenantId: auth.tenantId,
          currentStage: "AwaitingUserDecision",
        },
        {
          $set: {
            currentStage: newStage,
            pendingDecision: null,
            ...(action === "best_effort"
              ? { outputQuality: "best_effort" }
              : {}),
          },
          $inc: { stageVersion: 1 },
          $push: {
            stateTransitions: {
              from: "AwaitingUserDecision",
              to: newStage,
              at: new Date(),
              byAgent: "user",
              correlationId,
            },
          },
        },
      ).exec();

      if (action !== "cancel") {
        const outboxResult = await createOutboxEntry({
          targetQueue: QUEUE_NAMES.CEO,
          jobName: "ResumeTaskCommand",
          jobData: {
            _type: "SubmitTaskCommand",
            taskId,
            tenantId: auth.tenantId,
            userId: auth.userId,
            correlationId,
            header: {
              correlationId,
              causationId: null,
              traceparent: null,
              schemaVersion: "v1",
            },
          },
          correlationId,
        });

        if (!outboxResult.ok) {
          log.error(
            { taskId, err: outboxResult.error.message },
            "User decision applied but resume outbox entry failed",
          );
          return reply.status(500).send({
            error: "RESUME_DISPATCH_FAILED",
            message: "Decision saved, but task resume dispatch failed",
          });
        }
      }

      log.info({ taskId, action, newStage }, "User decision applied");

      return reply.send({ taskId, action, newStage, accepted: true });
    },
  );

  // POST /tasks/:taskId/feedback
  fastify.post(
    "/tasks/:taskId/feedback",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request, reply);
      requirePermission(auth, "task:write", reply);
      const { taskId } = request.params as { taskId: string };

      const parsed = TaskFeedbackRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues,
        });
      }

      // Verify task completed
      const task = await TaskEnvelopeModel.findOne({
        taskId,
        tenantId: auth.tenantId,
        currentStage: "Completed",
      })
        .select("taskId")
        .lean()
        .exec();

      if (task === null) {
        return reply.status(404).send({
          error: "TASK_NOT_FOUND",
          message: "Task not found or not yet completed",
        });
      }

      // Persist feedback to task envelope — used for complexity scoring validation
      await TaskEnvelopeModel.updateOne(
        { taskId, tenantId: auth.tenantId },
        {
          $set: {
            feedback: {
              rating: parsed.data.rating,
              comment: parsed.data.comment ?? null,
              submittedAt: new Date(),
              userId: auth.userId,
            },
          },
        },
      ).exec();

      log.info({ taskId, rating: parsed.data.rating }, "Task feedback saved");

      return reply.status(201).send({ taskId, received: true, recorded: true });
    },
  );
};
