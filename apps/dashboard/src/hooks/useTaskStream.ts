"use client";
import { useEffect, useState, useRef } from "react";
import type { BureauSSEEvent, TaskStage, PendingDecision } from "@bureau/sdk";
import { createBureauClient } from "@/lib/bureau-client";

export interface StreamState {
  events: BureauSSEEvent[];
  currentStage: TaskStage | null;
  activeDivision: string | null;
  divisionMessages: Record<string, string>;
  pendingDecision: PendingDecision | null;
  finalOutput: string | null;
  error: string | null;
  done: boolean;
}

const INITIAL: StreamState = {
  events: [],
  currentStage: null,
  activeDivision: null,
  divisionMessages: {},
  pendingDecision: null,
  finalOutput: null,
  error: null,
  done: false,
};

export function useTaskStream(taskId: string, active: boolean): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) return;
    setState(INITIAL);

    const controller = new AbortController();
    abortRef.current = controller;
    const client = createBureauClient();

    async function run() {
      try {
        for await (const event of client.streamTask(
          taskId,
          controller.signal,
        )) {
          setState((prev) => {
            const next: StreamState = {
              ...prev,
              events: [...prev.events, event],
            };

            if (event.event === "task.stage.changed") {
              next.currentStage = event.to;
              if (event.to !== "AwaitingUserDecision") {
                next.pendingDecision = null;
              }
            }

            if (event.event === "division.progress") {
              next.activeDivision = event.division;
              const msg = (event as { message?: string }).message;
              if (msg !== undefined) {
                next.divisionMessages = {
                  ...prev.divisionMessages,
                  [event.division]: msg,
                };
              }
            }

            if (event.event === "decision_required") {
              next.pendingDecision = event.pendingDecision;
            }

            if (event.event === "task.completed") {
              next.finalOutput = event.output;
              next.done = true;
              next.activeDivision = null;
            }

            if (event.event === "task.failed") {
              next.error = event.reason;
              next.done = true;
              next.activeDivision = null;
            }

            return next;
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Stream error",
          done: true,
        }));
      }
    }

    void run();
    return () => {
      controller.abort();
    };
  }, [taskId, active]);

  return state;
}
