import type { TaskStage } from "@bureau/sdk";

const STAGE_STYLES: Record<TaskStage, string> = {
  Submitted: "bg-blue-900/40 text-blue-300 border border-blue-800",
  Preparing: "bg-running/20 text-purple-300 border border-running/40",
  Researching: "bg-running/20 text-purple-300 border border-running/40",
  Producing: "bg-running/20 text-purple-300 border border-running/40",
  Reviewing: "bg-running/20 text-purple-300 border border-running/40",
  Formatting: "bg-running/20 text-purple-300 border border-running/40",
  AwaitingUserDecision:
    "bg-warning/20 text-yellow-300 border border-warning/40 animate-pulse",
  Completed: "bg-success/20 text-green-300 border border-success/40",
  Failed: "bg-danger/20 text-red-300 border border-danger/40",
  Cancelled: "bg-raised text-muted border border-border",
};

const STAGE_DOTS: Partial<Record<TaskStage, string>> = {
  Preparing: "●",
  Researching: "●",
  Producing: "●",
  Reviewing: "●",
  Formatting: "●",
  AwaitingUserDecision: "⚠",
  Completed: "✓",
  Failed: "✗",
};

export function StageBadge({ stage }: { stage: TaskStage }) {
  const dot = STAGE_DOTS[stage];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {dot && <span className="text-[10px]">{dot}</span>}
      {stage}
    </span>
  );
}
