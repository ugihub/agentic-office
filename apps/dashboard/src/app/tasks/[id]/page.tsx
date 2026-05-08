"use client";
import { use, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { createBureauClient } from "@/lib/bureau-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { StageProgress } from "@/components/StageProgress";
import { DivisionCards } from "@/components/DivisionCards";
import { DecisionPanel } from "@/components/DecisionPanel";
import { TerminalLog } from "@/components/TerminalLog";
import { StageBadge } from "@/components/StageBadge";
import { StageOverlay } from "@/components/StageOverlay";
import { AgentThinkingDots } from "@/components/AgentThinkingDots";
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
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">Error: {loadError}</p>
      </div>
    );
  }

  if (!task) {
    return <div className="text-center py-12 text-secondary">Loading…</div>;
  }

  const isRunning = !stream.done && streaming;

  return (
    <>
      <StageOverlay currentStage={currentStage} />

      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">Task Detail</h1>
            <p className="text-xs font-mono text-muted mt-0.5">{taskId}</p>
          </div>
          <div className="flex items-center gap-3">
            {currentStage && <StageBadge stage={currentStage} />}
            {isRunning && (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-danger/10"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Agent thinking indicator */}
        {isRunning && stream.activeDivision !== null && <AgentThinkingDots />}

        {/* Stage progress */}
        {currentStage && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-secondary mb-4">
              Progress
            </h2>
            <StageProgress current={currentStage} />
          </div>
        )}

        {/* Decision panel */}
        {currentStage === "AwaitingUserDecision" && stream.pendingDecision && (
          <DecisionPanel
            taskId={taskId}
            decision={stream.pendingDecision}
            onSubmit={handleDecision}
          />
        )}

        {/* Division cards */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-secondary mb-4">
            Agent Divisions
            {isRunning && (
              <span className="ml-2 text-xs font-normal text-brand-400">
                ● live
              </span>
            )}
          </h2>
          <DivisionCards
            activeDivision={stream.activeDivision}
            divisionMessages={stream.divisionMessages}
          />
        </div>

        {/* Terminal log */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">
            System Log
          </h2>
          <TerminalLog events={stream.events} isStreaming={isRunning} />
        </div>

        {/* Final output */}
        {finalOutput && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-6">
            <h2 className="text-sm font-semibold text-green-300 mb-3">
              ✓ Final Output
            </h2>
            <div className="prose prose-sm prose-invert max-w-none text-primary/80">
              <ReactMarkdown>{finalOutput}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Error */}
        {stream.error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
            <p className="text-sm text-red-400">✗ {stream.error}</p>
          </div>
        )}
      </div>
    </>
  );
}
