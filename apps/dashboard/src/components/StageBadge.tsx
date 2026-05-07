import type { TaskStage } from "@bureau/sdk";

const STAGE_STYLES: Record<TaskStage, string> = {
  Submitted: "bg-gray-100 text-gray-700",
  Preparing: "bg-blue-100 text-blue-700",
  Researching: "bg-indigo-100 text-indigo-700",
  Producing: "bg-purple-100 text-purple-700",
  Reviewing: "bg-yellow-100 text-yellow-700",
  Formatting: "bg-orange-100 text-orange-700",
  AwaitingUserDecision: "bg-amber-100 text-amber-800 animate-pulse",
  Completed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

export function StageBadge({ stage }: { stage: TaskStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {stage}
    </span>
  );
}
