/**
 * Decision Timeout Worker.
 *
 * Scans for AwaitingUserDecision tasks whose pendingDecision.expiresAt has passed.
 * Auto-executes the defaultAction (typically 'best_effort') and transitions to next stage.
 *
 * Runs every 60 seconds. Designed for single-instance. In multi-instance deployments,
 * use MongoDB findOneAndUpdate atomic claim to avoid double-processing.
 *
 * Decision timeout default: 24h (from plan spec).
 * Default action: best_effort → Formatting stage.
 */
import mongoose from "mongoose";
import { TaskEnvelopeModel } from "@bureau/models";
import { createOutboxEntry } from "@bureau/infra-mongo";
import { QUEUE_NAMES } from "@bureau/contracts";
import { newId, EntityPrefix } from "@bureau/shared-kernel";
import { createLogger } from "@bureau/telemetry";
import { sendDecisionRequiredEmail } from "./email.js";

const log = createLogger({ division: "Executive" });

const SCAN_INTERVAL_MS = 60_000; // 1 minute
const BATCH_LIMIT = 100;

type DefaultAction = "best_effort" | "cancel";

/**
 * Map defaultAction → next stage.
 * Mirrors the decision route logic in tasks.ts.
 */
function resolveNextStage(action: DefaultAction): string {
  if (action === "cancel") return "Cancelled";
  return "Formatting"; // best_effort
}

/**
 * Notify users whose tasks entered AwaitingUserDecision but haven't been notified yet.
 * Uses notifiedAt field to prevent duplicate sends.
 */
async function sendPendingNotifications(): Promise<void> {
  const unnotified = await TaskEnvelopeModel.find({
    currentStage: "AwaitingUserDecision",
    "pendingDecision.notifiedAt": null,
  })
    .select("taskId userId pendingDecision originalRequest")
    .limit(50)
    .lean()
    .exec();

  if (unnotified.length === 0) return;

  log.info(
    { count: unnotified.length },
    "Sending pending AwaitingUserDecision notifications",
  );

  await Promise.all(
    unnotified.map(async (task) => {
      // Atomic claim: mark notifiedAt before sending to prevent duplicate sends
      const claimed = await TaskEnvelopeModel.findOneAndUpdate(
        {
          taskId: task.taskId,
          currentStage: "AwaitingUserDecision",
          "pendingDecision.notifiedAt": null,
        },
        { $set: { "pendingDecision.notifiedAt": new Date() } },
        { new: true },
      ).exec();

      if (claimed === null) return; // Another instance claimed it

      // BUG-20: cross-tenant email leak. Previously every tenant's
      // decision-timeout email went to one shared inbox (the first
      // NOTIFICATION_EMAIL/ADMIN_EMAIL), letting one operator see every
      // tenant's prompts and task IDs. In MVP there is no UserProfile
      // collection, so we cannot resolve a per-tenant recipient.
      // Until that lands, only allow notifications for the explicitly
      // opted-in tenant (BUREAU_DECISION_NOTIFY_TENANT) — and route the
      // email through a per-tenant override (BUREAU_DECISION_NOTIFY_<TENANT>)
      // so multiple opt-in tenants do not collide on a single address.
      const isOptInTenant =
        process.env["BUREAU_DECISION_NOTIFY_TENANT"] === task.tenantId;
      if (!isOptInTenant) {
        log.warn(
          {
            taskId: task.taskId,
            tenantId: task.tenantId,
          },
          "Tenant not opted in for decision notifications — email skipped (notifiedAt still marked). Set BUREAU_DECISION_NOTIFY_TENANT to opt this tenant in.",
        );
        return;
      }

      const envKey = `BUREAU_DECISION_NOTIFY_${task.tenantId.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
      const recipientEmail = process.env[envKey];
      if (!recipientEmail) {
        log.warn(
          { taskId: task.taskId, envKey },
          "Tenant opted in but no per-tenant recipient configured — decision email skipped (notifiedAt still marked)",
        );
        return;
      }

      const expiresAt =
        (task.pendingDecision as { expiresAt: Date } | null)?.expiresAt ??
        new Date();
      const defaultAction =
        (task.pendingDecision as { defaultAction?: string } | null)
          ?.defaultAction ?? "best_effort";
      const prompt =
        (task.originalRequest as { prompt?: string } | undefined)?.prompt ?? "";

      void sendDecisionRequiredEmail({
        to: recipientEmail,
        userName: task.userId,
        taskId: task.taskId,
        taskPrompt: prompt,
        options: [
          {
            action: "best_effort",
            label: "Accept Best Effort",
            description: "Deliver available output with lower quality label",
          },
          {
            action: "add_budget",
            label: "Add Budget & Retry",
            description: "Continue with a higher-tier model",
          },
          {
            action: "cancel",
            label: "Cancel Task",
            description: "Cancel and receive a full refund",
          },
        ],
        expiresAt,
        defaultAction,
      }).then((result) => {
        if (!result.ok) {
          log.error(
            { taskId: task.taskId, err: result.error.message },
            "Failed to send decision email",
          );
        }
      });
    }),
  );
}

async function processExpiredDecisions(): Promise<void> {
  const now = new Date();

  // Find expired AwaitingUserDecision tasks (batch)
  const expired = await TaskEnvelopeModel.find({
    currentStage: "AwaitingUserDecision",
    "pendingDecision.expiresAt": { $lte: now },
  })
    .select("taskId tenantId userId pendingDecision")
    .limit(BATCH_LIMIT)
    .lean()
    .exec();

  if (expired.length === 0) return;

  log.info(
    { count: expired.length },
    "Decision timeout: auto-executing default actions",
  );

  await Promise.all(
    expired.map(async (task) => {
      // Atomic: claim the task (prevent race with concurrent scan instances)
      const action: DefaultAction =
        (task.pendingDecision?.defaultAction as DefaultAction | undefined) ??
        "best_effort";
      const newStage = resolveNextStage(action);

      const updated = await TaskEnvelopeModel.findOneAndUpdate(
        {
          taskId: task.taskId,
          currentStage: "AwaitingUserDecision", // re-check — only update if still in this stage
          "pendingDecision.expiresAt": { $lte: now },
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
              at: now,
              byAgent: "decision-timeout-worker",
              correlationId: task.taskId,
            },
          },
        },
        { new: true },
      ).exec();

      if (updated !== null) {
        log.info(
          { taskId: task.taskId, action, newStage },
          "Decision auto-executed on timeout",
        );

        // BUG-2: previously the worker only mutated the stage. For non-cancel
        // actions the task is now in a non-terminal stage (Submitted for
        // add_budget, Formatting for best_effort) but nothing re-enters the
        // pipeline → the task was stuck forever. Re-dispatch via outbox so
        // the task processor resumes it (mirrors the /tasks/:id/decision
        // route handler in api-server).
        if (action !== "cancel") {
          const correlationId = newId(EntityPrefix.CORRELATION);
          const outboxResult = await createOutboxEntry({
            targetQueue: QUEUE_NAMES.CEO,
            jobName: "ResumeTaskCommand",
            jobData: {
              _type: "SubmitTaskCommand",
              taskId: task.taskId,
              tenantId: task.tenantId,
              userId: task.userId,
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
            // The stage is already transitioned; log loudly so on-call can
            // re-dispatch manually. We do NOT roll back — the user-facing
            // default action is what matters and is recorded.
            log.error(
              {
                taskId: task.taskId,
                action,
                err: outboxResult.error.message,
              },
              "Decision timeout: stage transitioned but resume outbox entry failed",
            );
          }
        }
      }
      // If null: another instance claimed it first — safe to ignore
    }),
  );
}

let _running = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

/** Start the decision timeout watcher. Idempotent. */
export function startDecisionTimeoutWorker(): void {
  if (_running) return;
  _running = true;
  log.info({}, "Decision timeout worker started");

  const tick = async () => {
    if (!_running) return;
    try {
      if (mongoose.connection.readyState === 1) {
        await sendPendingNotifications();
        await processExpiredDecisions();
      }
    } catch (e) {
      log.error(
        { err: e instanceof Error ? e.message : String(e) },
        "Decision timeout tick failed",
      );
    }
    if (_running) {
      _timer = setTimeout(tick, SCAN_INTERVAL_MS);
    }
  };

  // Stagger first run by 10s to let DB connect
  _timer = setTimeout(tick, 10_000);
}

/** Stop the worker gracefully. */
export function stopDecisionTimeoutWorker(): void {
  _running = false;
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
  log.info({}, "Decision timeout worker stopped");
}
