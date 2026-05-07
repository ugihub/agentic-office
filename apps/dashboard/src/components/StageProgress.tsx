import type { TaskStage } from "@bureau/sdk";

const FLOW_STAGES: TaskStage[] = [
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "Completed",
];

const STAGE_INDEX = new Map<TaskStage, number>(
  FLOW_STAGES.map((s, i) => [s, i]),
);

export function StageProgress({ current }: { current: TaskStage }) {
  const currentIdx = STAGE_INDEX.get(current) ?? -1;

  return (
    <div className="w-full space-y-3">
      {/* Side-state banners */}
      {current === "AwaitingUserDecision" && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-center text-xs font-medium text-yellow-300 animate-pulse">
          ⚠ Agent requires your decision before continuing
        </div>
      )}
      {current === "Failed" && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-center text-xs font-medium text-red-300">
          ✗ Task failed
        </div>
      )}
      {current === "Cancelled" && (
        <div className="rounded-lg bg-raised border border-border px-3 py-2 text-center text-xs font-medium text-muted">
          Task cancelled
        </div>
      )}

      {/* Segmented bar */}
      <div className="flex items-stretch gap-0.5">
        {FLOW_STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const pending = idx > currentIdx;

          return (
            <div key={stage} className="flex-1 flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-sm overflow-hidden ${
                  done
                    ? "bg-success"
                    : active
                      ? "shimmer-bg animate-shimmer"
                      : "bg-raised"
                }`}
              />
              <p
                className={`text-[10px] text-center truncate ${
                  active
                    ? "text-brand-400 font-medium"
                    : done
                      ? "text-success"
                      : pending
                        ? "text-muted"
                        : "text-muted"
                }`}
              >
                {stage}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
