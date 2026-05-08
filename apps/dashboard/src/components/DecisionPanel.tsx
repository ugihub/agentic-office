"use client";
import { useState, useEffect } from "react";
import type { PendingDecision, DecisionAction } from "@bureau/sdk";

interface Props {
  taskId: string;
  decision: PendingDecision;
  onSubmit: (action: DecisionAction) => Promise<void>;
}

export function DecisionPanel({ taskId: _taskId, decision, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState<DecisionAction | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const expiresAt = new Date(decision.expiresAt).getTime();
    function tick() {
      setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [decision.expiresAt]);

  async function handleAction(action: DecisionAction) {
    setSubmitting(action);
    try {
      await onSubmit(action);
    } finally {
      setSubmitting(null);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="rounded-xl border-2 border-warning/50 bg-warning/5 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 mr-4">
          <h3 className="text-lg font-bold text-yellow-300">
            ⚠ Decision Required
          </h3>
          <p className="mt-1 text-sm text-secondary">{decision.reason}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted">Expires in</p>
          <p className="text-2xl font-mono font-bold text-yellow-300">
            {minutes}:{String(seconds).padStart(2, "0")}
          </p>
        </div>
      </div>

      {decision.bestEffortOutput?.available === true && (
        <div className="rounded-lg bg-raised border border-border p-3">
          <p className="text-xs text-secondary">
            Best-effort quality estimate:{" "}
            <span className="font-bold text-primary">
              {Math.round(
                (decision.bestEffortOutput.qualityEstimate ?? 0) * 100,
              )}
              %
            </span>
          </p>
        </div>
      )}

      {decision.escalationOption?.available === true && (
        <div className="rounded-lg bg-raised border border-border p-3">
          <p className="text-xs text-secondary">
            Escalate to{" "}
            <span className="font-medium text-primary">
              {decision.escalationOption.targetModel}
            </span>{" "}
            — additional cost:{" "}
            <span className="font-bold text-yellow-300">
              ${decision.escalationOption.additionalCostUsd}
            </span>
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("add_budget")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting === "add_budget" ? "Approving…" : "Approve & Escalate"}
        </button>
        <button
          onClick={() => handleAction("best_effort")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-raised disabled:opacity-50"
        >
          {submitting === "best_effort" ? "Accepting…" : "Use Best Effort"}
        </button>
        <button
          onClick={() => handleAction("cancel")}
          disabled={submitting !== null}
          className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-red-400 hover:bg-danger/10 disabled:opacity-50"
        >
          {submitting === "cancel" ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
