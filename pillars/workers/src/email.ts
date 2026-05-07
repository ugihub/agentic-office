/**
 * Email notification service — Resend SDK.
 *
 * Used for:
 * - AwaitingUserDecision: notify user their task needs input
 * - Task completion: optional notify on long-running tasks
 *
 * CRITICAL: Email send failure must NEVER block task pipeline.
 * All functions return Result<T,E> and log errors silently.
 */
import { Resend } from "resend";
import { type Result, ok, err } from "@bureau/shared-kernel";
import { createLogger } from "@bureau/telemetry";

const log = createLogger({ division: "Executive" });

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend !== null) return _resend;
  const apiKey = process.env["RESEND_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    throw new Error("RESEND_API_KEY not configured");
  }
  _resend = new Resend(apiKey);
  return _resend;
}

const FROM_EMAIL = process.env["EMAIL_FROM"] ?? "Bureau <noreply@bureau.ai>";
const APP_URL = process.env["APP_URL"] ?? "https://app.bureau.ai";

export interface DecisionRequiredEmailParams {
  to: string;
  userName: string;
  taskId: string;
  taskPrompt: string;
  options: Array<{
    action: "approve" | "cancel" | "best_effort" | "add_budget";
    label: string;
    description: string;
  }>;
  expiresAt: Date;
  defaultAction: string;
}

/**
 * Send AwaitingUserDecision notification.
 * Returns ok(messageId) or err(Error).
 * Caller must handle failure gracefully — do NOT throw.
 */
export async function sendDecisionRequiredEmail(
  params: DecisionRequiredEmailParams,
): Promise<Result<string, Error>> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (resendKey === undefined || resendKey === "") {
    // Email not configured — log and skip
    log.warn(
      { taskId: params.taskId },
      "RESEND_API_KEY not configured, skipping decision email",
    );
    return ok("email-skipped");
  }

  try {
    const resend = getResend();
    const decisionUrl = `${APP_URL}/tasks/${params.taskId}/decision`;
    const expiresFormatted = params.expiresAt.toUTCString();

    const optionRows = params.options
      .map(
        (o) =>
          `<tr>
            <td style="padding:8px">
              <a href="${decisionUrl}?action=${o.action}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:white;border-radius:4px;text-decoration:none;font-weight:bold">${o.label}</a>
            </td>
            <td style="padding:8px;color:#6b7280">${o.description}</td>
          </tr>`,
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#111827">Action Required: Task Awaiting Your Decision</h2>
  <p>Hi ${params.userName},</p>
  <p>Your task has reached a decision point and needs your input to continue.</p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
    <strong>Task:</strong> ${params.taskId}<br/>
    <strong>Request:</strong> ${params.taskPrompt.slice(0, 200)}${params.taskPrompt.length > 200 ? "..." : ""}
  </div>

  <h3>Choose an action:</h3>
  <table>${optionRows}</table>

  <p style="color:#6b7280;font-size:14px;margin-top:24px">
    This decision expires at: <strong>${expiresFormatted}</strong><br/>
    If no action is taken, the default action (<strong>${params.defaultAction}</strong>) will be executed automatically.
  </p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">Bureau AI Platform — automated message, do not reply</p>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `[Bureau] Action Required: Task ${params.taskId.slice(0, 16)}`,
      html,
    });

    if (error !== null && error !== undefined) {
      log.error(
        { taskId: params.taskId, resendError: error },
        "Resend API error",
      );
      return err(new Error(`Resend error: ${JSON.stringify(error)}`));
    }

    log.info(
      { taskId: params.taskId, emailId: data?.id },
      "Decision email sent",
    );
    return ok(data?.id ?? "unknown");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error({ taskId: params.taskId, err: msg }, "Email send threw");
    return err(new Error(msg));
  }
}

export interface TaskCompletedEmailParams {
  to: string;
  userName: string;
  taskId: string;
  taskPrompt: string;
  quality: string;
}

/**
 * Send task completion notification (optional, only if user opted in).
 */
export async function sendTaskCompletedEmail(
  params: TaskCompletedEmailParams,
): Promise<Result<string, Error>> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (resendKey === undefined || resendKey === "") {
    return ok("email-skipped");
  }

  try {
    const resend = getResend();
    const viewUrl = `${APP_URL}/tasks/${params.taskId}`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `[Bureau] Task Completed — ${params.taskId.slice(0, 16)}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#111827">Your Task is Complete</h2>
  <p>Hi ${params.userName},</p>
  <p>Your task has been completed successfully.</p>
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:16px 0">
    <strong>Task:</strong> ${params.taskId}<br/>
    <strong>Quality:</strong> ${params.quality}<br/>
    <strong>Request:</strong> ${params.taskPrompt.slice(0, 200)}${params.taskPrompt.length > 200 ? "..." : ""}
  </div>
  <a href="${viewUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;border-radius:4px;text-decoration:none;font-weight:bold">View Results</a>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">Bureau AI Platform</p>
</body>
</html>`,
    });

    if (error !== null && error !== undefined) {
      return err(new Error(`Resend error: ${JSON.stringify(error)}`));
    }

    return ok(data?.id ?? "unknown");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(new Error(msg));
  }
}
