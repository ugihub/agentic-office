/**
 * Bureau SDK — SSE streaming support.
 *
 * Parses the EventSource-compatible SSE stream from GET /tasks/:taskId/stream.
 * Works in Node.js 18+ (native fetch + ReadableStream) and browsers.
 *
 * Usage:
 *   for await (const event of streamTask(taskId, headers)) {
 *     if (event.event === 'task.completed') { ... }
 *   }
 */
import type { BureauSSEEvent } from "./types.js";

/**
 * Parse a raw SSE data string into a typed BureauSSEEvent.
 * Returns null for heartbeat/comment lines.
 */
export function parseSSEEvent(raw: string): BureauSSEEvent | null {
  const lines = raw.trim().split("\n");
  let eventType: string | null = null;
  let dataStr: string | null = null;

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr = line.slice(6).trim();
    }
  }

  if (!eventType || !dataStr) return null;

  try {
    const payload = JSON.parse(dataStr) as Record<string, unknown>;
    return { event: eventType, ...payload } as BureauSSEEvent;
  } catch {
    return null;
  }
}

/**
 * Stream SSE events from a Bureau task stream endpoint.
 *
 * @param url  Full URL of the SSE endpoint
 * @param headers  Auth headers (X-Api-Key or Authorization)
 * @param signal  AbortSignal to stop streaming
 *
 * Yields typed BureauSSEEvent objects until stream ends or is aborted.
 * Automatically stops on task.completed or task.failed events.
 */
export async function* streamSSE(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): AsyncGenerator<BureauSSEEvent> {
  const init: RequestInit = {
    headers: { ...headers, Accept: "text/event-stream" },
  };
  if (signal !== undefined) init.signal = signal;

  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(`SSE stream failed: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("SSE response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const event = parseSSEEvent(part);
        if (event) {
          yield event;
          // Auto-stop on terminal events
          if (
            event.event === "task.completed" ||
            event.event === "task.failed" ||
            event.event === "task.cancelled"
          ) {
            return;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
