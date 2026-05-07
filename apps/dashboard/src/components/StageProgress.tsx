import type { TaskStage } from "@bureau/sdk";

const STAGES: TaskStage[] = [
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "Completed",
];

const STAGE_INDEX: Partial<Record<TaskStage, number>> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
);

export function StageProgress({ current }: { current: TaskStage }) {
  const currentIdx = STAGE_INDEX[current] ?? -1;

  return (
    <div className="w-full">
      <div className="flex items-start">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;

          return (
            <div key={stage} className="flex flex-1 items-center">
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    done
                      ? "bg-green-500 border-green-500 text-white"
                      : active
                        ? "bg-brand-600 border-brand-600 text-white scale-110"
                        : "bg-white border-gray-300 text-gray-400"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                <span
                  className={`mt-1 text-xs font-medium text-center ${
                    active
                      ? "text-brand-700"
                      : done
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {stage}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1 mt-[-16px] transition-colors ${
                    done ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {current === "AwaitingUserDecision" && (
        <p className="mt-4 text-center text-sm font-medium text-amber-600 animate-pulse">
          ⚠ Agent requires your decision before continuing
        </p>
      )}
      {current === "Failed" && (
        <p className="mt-4 text-center text-sm font-medium text-red-600">
          ✗ Task failed
        </p>
      )}
    </div>
  );
}
