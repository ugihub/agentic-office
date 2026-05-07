/**
 * Bureau SDK — BureauClient
 *
 * Main client class for the Bureau API.
 * Zero runtime dependencies (uses native fetch).
 *
 * Usage:
 *   const bureau = new BureauClient({ apiKey: 'bureau_live_...' })
 *   const task = await bureau.submitTask({ prompt: 'Write a report on...' })
 *   for await (const event of bureau.streamTask(task.taskId)) {
 *     if (event.event === 'task.completed') console.log(event.output)
 *   }
 */
import type {
  BureauClientOptions,
  SubmitTaskOptions,
  TaskEnvelope,
  TaskStatus,
  ApiKey,
  CreateApiKeyResult,
  DecisionAction,
  BureauSSEEvent,
} from "./types.js";
import { streamSSE } from "./streaming.js";

const DEFAULT_BASE_URL = "https://api.bureau.id";
const API_PREFIX = "/api/v1";

type ListTasksResponse = { tasks: TaskEnvelope[] };
type ListApiKeysResponse = { keys: ApiKey[] };
type CreateApiKeyApiResponse = CreateApiKeyResult & { prefix?: string };

export class BureauError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "BureauError";
  }
}

export class BureauClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(options: BureauClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? 30_000;

    this.headers = { "Content-Type": "application/json" };
    if (options.apiKey) this.headers["X-Api-Key"] = options.apiKey;
    if (options.jwt) this.headers["Authorization"] = `Bearer ${options.jwt}`;
  }

  // ─── Core fetch ──────────────────────────────────────────────────────────────

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...this.headers,
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new BureauError(
          `Bureau API error ${res.status}`,
          res.status,
          text,
        );
      }

      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────────

  /**
   * Submit a task to Bureau.
   * Returns the task envelope immediately — task executes asynchronously.
   */
  async submitTask(options: SubmitTaskOptions): Promise<TaskEnvelope> {
    const extraHeaders: Record<string, string> = {};
    if (options.idempotencyKey) {
      extraHeaders["Idempotency-Key"] = options.idempotencyKey;
    }

    return this.fetch<TaskEnvelope>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: options.prompt,
        constraints: options.constraints ?? {},
        outputFormat: options.outputFormat ?? "markdown",
        metadata: options.metadata ?? {},
      }),
      headers: extraHeaders,
    });
  }

  /**
   * List tasks (most recent first).
   */
  async listTasks(opts?: {
    limit?: number;
    stage?: string;
  }): Promise<TaskEnvelope[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.stage) params.set("stage", opts.stage);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    const result = await this.fetch<TaskEnvelope[] | ListTasksResponse>(
      `/tasks${qs}`,
    );
    return Array.isArray(result) ? result : result.tasks;
  }

  /**
   * Get full task envelope.
   */
  async getTask(taskId: string): Promise<TaskEnvelope> {
    return this.fetch<TaskEnvelope>(`/tasks/${taskId}`);
  }

  /**
   * Get task status (lighter than full envelope).
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    return this.fetch<TaskStatus>(`/tasks/${taskId}/status`);
  }

  /**
   * Cancel a running task.
   */
  async cancelTask(taskId: string): Promise<{ cancelled: boolean }> {
    return this.fetch<{ cancelled: boolean }>(`/tasks/${taskId}/cancel`, {
      method: "POST",
    });
  }

  /**
   * Respond to an AwaitingUserDecision state.
   */
  async submitDecision(
    taskId: string,
    action: DecisionAction,
  ): Promise<{ accepted: boolean }> {
    return this.fetch<{ accepted: boolean }>(`/tasks/${taskId}/decision`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  }

  /**
   * Submit rating feedback for a completed task.
   */
  async submitFeedback(
    taskId: string,
    rating: 1 | 2 | 3 | 4 | 5,
    comment?: string,
  ): Promise<{ recorded: boolean }> {
    return this.fetch<{ recorded: boolean }>(`/tasks/${taskId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating, comment }),
    });
  }

  /**
   * Stream real-time SSE events for a task.
   *
   * Automatically terminates on task.completed or task.failed.
   *
   * @example
   * for await (const event of bureau.streamTask(taskId)) {
   *   if (event.event === 'task.completed') console.log(event.output)
   * }
   */
  streamTask(
    taskId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<BureauSSEEvent> {
    const url = `${this.baseUrl}${API_PREFIX}/tasks/${taskId}/stream`;
    // Clone headers without Content-Type (SSE is GET)
    const sseHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.headers)) {
      if (k !== "Content-Type") sseHeaders[k] = v;
    }
    return streamSSE(url, sseHeaders, signal);
  }

  /**
   * Wait for a task to complete, polling status every intervalMs.
   * Returns final TaskStatus when stage is terminal.
   *
   * Throws if task fails or is cancelled.
   */
  async waitForTask(
    taskId: string,
    opts?: {
      intervalMs?: number;
      timeoutMs?: number;
      onStatus?: (status: TaskStatus) => void;
    },
  ): Promise<TaskStatus> {
    const intervalMs = opts?.intervalMs ?? 3_000;
    const timeoutMs = opts?.timeoutMs ?? 300_000; // 5 min default
    const deadline = Date.now() + timeoutMs;
    const terminal = new Set(["Completed", "Failed", "Cancelled"]);

    while (Date.now() < deadline) {
      const status = await this.getTaskStatus(taskId);
      opts?.onStatus?.(status);

      if (terminal.has(status.currentStage)) {
        if (status.currentStage === "Failed") {
          throw new BureauError(
            `Task ${taskId} failed`,
            0,
            status.currentStage,
          );
        }
        if (status.currentStage === "Cancelled") {
          throw new BureauError(
            `Task ${taskId} was cancelled`,
            0,
            status.currentStage,
          );
        }
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new BureauError(
      `Task ${taskId} timed out after ${timeoutMs}ms`,
      0,
      "timeout",
    );
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────────

  /**
   * Create a new API key.
   * The plaintext key is returned ONCE — store it securely.
   */
  async createApiKey(opts: {
    name: string;
    permissions?: string[];
    expiresInDays?: number;
  }): Promise<CreateApiKeyResult> {
    const result = await this.fetch<CreateApiKeyApiResponse>("/auth/keys", {
      method: "POST",
      body: JSON.stringify({
        name: opts.name,
        permissions: opts.permissions ?? ["task:read", "task:write"],
        expiresInDays: opts.expiresInDays,
      }),
    });

    return {
      ...result,
      keyPrefix: result.keyPrefix ?? result.prefix ?? "",
    };
  }

  /**
   * List API keys (without plaintext).
   */
  async listApiKeys(): Promise<ApiKey[]> {
    const result = await this.fetch<ApiKey[] | ListApiKeysResponse>(
      "/auth/keys",
    );
    return Array.isArray(result) ? result : result.keys;
  }

  /**
   * Revoke an API key.
   */
  async revokeApiKey(keyId: string): Promise<{ revoked: boolean }> {
    const result = await this.fetch<{ revoked?: boolean; status?: string }>(
      `/auth/keys/${keyId}`,
      {
        method: "DELETE",
      },
    );
    return { revoked: result.revoked ?? result.status === "revoked" };
  }

  /**
   * Store an encrypted LLM provider API key.
   * Stored encrypted server-side (AES-256-GCM).
   */
  async storeProviderKey(
    provider: string,
    plaintext: string,
  ): Promise<{ stored: boolean }> {
    const result = await this.fetch<{ stored?: boolean; isActive?: boolean }>(
      "/auth/provider-keys",
      {
        method: "POST",
        body: JSON.stringify({ provider, plaintext }),
      },
    );
    return { stored: result.stored ?? result.isActive ?? true };
  }

  /**
   * Remove a stored LLM provider key.
   */
  async removeProviderKey(provider: string): Promise<{ removed: boolean }> {
    return this.fetch<{ removed: boolean }>(`/auth/provider-keys/${provider}`, {
      method: "DELETE",
    });
  }

  // ─── Health ───────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: "ready" | "degraded" }> {
    return this.fetch<{ status: "ready" | "degraded" }>("/health/ready");
  }
}
