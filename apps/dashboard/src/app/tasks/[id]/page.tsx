"use client";
import { use, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { createBureauClient } from "@/lib/bureau-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { StageProgress } from "@/components/StageProgress";
import { DivisionCards } from "@/components/DivisionCards";
import { DecisionPanel } from "@/components/DecisionPanel";
import { EventLog } from "@/components/EventLog";
import { StageBadge } from "@/components/StageBadge";
import type { TaskEnvelope, DecisionAction } from "@bureau/sdk";

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: taskId } = use(params);
  const [task, setTask] = useState<TaskEnvelope | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    createBureauClient()
      .getTask(taskId)
      .then(setTask)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Not found"),
      );
  }, [taskId]);

  const stream = useTaskStream(taskId, streaming);

  const currentStage = stream.currentStage ?? task?.currentStage ?? null;
  const finalOutput = stream.finalOutput ?? task?.finalOutput ?? null;

  useEffect(() => {
    if (stream.done) setStreaming(false);
  }, [stream.done]);

  async function handleDecision(action: DecisionAction) {
    await createBureauClient().submitDecision(taskId, action);
  }

  async function handleCancel() {
    await createBureauClient().cancelTask(taskId);
    setStreaming(false);
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-600">Error: {loadError}</p>
      </div>
    );
  }

  if (!task) {
    return <div className="text-center py-12 text-gray-400">Loading…</div>;
  }

  const isRunning = !stream.done && streaming;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Task Detail</h1>
          <p className="text-xs font-mono text-gray-400 mt-0.5">{taskId}</p>
        </div>
        <div className="flex items-center gap-3">
          {currentStage && <StageBadge stage={currentStage} />}
          {isRunning && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {currentStage && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Progress</h2>
          <StageProgress current={currentStage} />
        </div>
      )}

      {currentStage === "AwaitingUserDecision" && stream.pendingDecision && (
        <DecisionPanel
          taskId={taskId}
          decision={stream.pendingDecision}
          onSubmit={handleDecision}
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Agent Divisions
          {isRunning && (
            <span className="ml-2 text-xs font-normal text-brand-500">
              ● live
            </span>
          )}
        </h2>
        <DivisionCards
          activeDivision={stream.activeDivision}
          divisionMessages={stream.divisionMessages}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Event Log</h2>
        <EventLog events={stream.events} />
      </div>

      {finalOutput && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h2 className="text-sm font-semibold text-green-800 mb-3">
            ✓ Final Output
          </h2>
          <div className="prose prose-sm max-w-none text-gray-800">
            <ReactMarkdown>{finalOutput}</ReactMarkdown>
          </div>
        </div>
      )}

      {stream.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">✗ {stream.error}</p>
        </div>
      )}
    </div>
  );
}
