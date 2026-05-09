import type { TaskStage } from "@bureau/sdk";

// Color group → which stages belong to each visual bucket
const STAGE_STYLE: Record<
  TaskStage,
  { ring: string; text: string; dot: string }
> = {
  Submitted: {
    ring: "border-blue-800/60   bg-blue-900/20",
    text: "text-blue-300",
    dot: "bg-blue-400",
  },
  Preparing: {
    ring: "border-blue-800/60   bg-blue-900/20",
    text: "text-blue-300",
    dot: "bg-blue-400",
  },
  Researching: {
    ring: "border-violet-700/60 bg-violet-900/20",
    text: "text-violet-300",
    dot: "bg-violet-400",
  },
  Producing: {
    ring: "border-violet-700/60 bg-violet-900/20",
    text: "text-violet-300",
    dot: "bg-violet-400 shadow-[0_0_4px_#8b5cf6]",
  },
  Reviewing: {
    ring: "border-violet-700/60 bg-violet-900/20",
    text: "text-violet-300",
    dot: "bg-violet-400",
  },
  Formatting: {
    ring: "border-blue-800/60   bg-blue-900/20",
    text: "text-blue-300",
    dot: "bg-blue-400",
  },
  AwaitingUserDecision: {
    ring: "border-amber-700/60  bg-amber-900/20",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  Completed: {
    ring: "border-emerald-700/60 bg-emerald-900/20",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  Failed: {
    ring: "border-red-700/60    bg-red-900/20",
    text: "text-red-300",
    dot: "bg-red-400",
  },
  Cancelled: {
    ring: "border-border        bg-raised",
    text: "text-muted",
    dot: "bg-muted",
  },
};

const STAGE_LABEL: Partial<Record<TaskStage, string>> = {
  AwaitingUserDecision: "Decision",
};

const PULSE_STAGES = new Set<TaskStage>([
  "Producing",
  "Reviewing",
  "AwaitingUserDecision",
]);

export function StageBadge({ stage }: { stage: TaskStage }) {
  const s = STAGE_STYLE[stage];
  const label = STAGE_LABEL[stage] ?? stage;
  const pulse = PULSE_STAGES.has(stage);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.ring} ${s.text}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.dot} ${pulse ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
