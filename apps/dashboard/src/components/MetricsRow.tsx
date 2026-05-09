import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

const ACTIVE_STAGES = new Set<TaskStage>([
  "Submitted", "Preparing", "Researching", "Producing", "Reviewing", "Formatting",
]);

interface MetricsRowProps {
  tasks: TaskEnvelope[];
}

interface MetricConfig {
  label: string;
  value: string | number;
  chip: string;
  chipColor: string;
  valueColor: string;
  glowColor: string;
}

export function MetricsRow({ tasks }: MetricsRowProps) {
  const total = tasks.length;
  const running = tasks.filter((t) => ACTIVE_STAGES.has(t.currentStage)).length;
  const completed = tasks.filter((t) => t.currentStage === "Completed").length;
  const failed = tasks.filter((t) => t.currentStage === "Failed").length;
  const awaiting = tasks.filter((t) => t.currentStage === "AwaitingUserDecision").length;
  const successRate =
    completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null;

  const metrics: MetricConfig[] = [
    {
      label: "Total Tasks",
      value: total,
      chip: total === 0 ? "none yet" : `+${Math.min(total, 99)} today`,
      chipColor: "bg-blue-900/30 text-blue-300 border border-blue-800/50",
      valueColor: "text-blue-300",
      glowColor: "bg-blue-500",
    },
    {
      label: "Running",
      value: running,
      chip: running > 0 ? "● agents active" : "idle",
      chipColor: running > 0
        ? "bg-violet-900/30 text-violet-300 border border-violet-800/50"
        : "bg-raised text-muted border border-border",
      valueColor: "text-violet-300",
      glowColor: "bg-violet-500",
    },
    {
      label: "Completed",
      value: completed,
      chip: successRate !== null ? `${successRate}% success` : "no data",
      chipColor: "bg-emerald-900/30 text-emerald-300 border border-emerald-800/50",
      valueColor: "text-emerald-300",
      glowColor: "bg-emerald-500",
    },
    {
      label: "Awaiting Decision",
      value: awaiting,
      chip: awaiting > 0 ? "action needed" : "all clear",
      chipColor: awaiting > 0
        ? "bg-amber-900/30 text-amber-300 border border-amber-800/50"
        : "bg-raised text-muted border border-border",
      valueColor: awaiting > 0 ? "text-amber-300" : "text-secondary",
      glowColor: "bg-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-4"
        >
          {/* Glow orb top-right */}
          <div
            className={`pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-[0.08] blur-sm ${m.glowColor}`}
          />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            {m.label}
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${m.valueColor}`}>
            {m.value}
          </p>
          <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${m.chipColor}`}>
            {m.chip}
          </span>
        </div>
      ))}
    </div>
  );
}
