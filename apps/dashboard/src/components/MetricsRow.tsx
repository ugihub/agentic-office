import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

const ACTIVE_STAGES = new Set<TaskStage>([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "AwaitingUserDecision",
]);

interface MetricsRowProps {
  tasks: TaskEnvelope[];
}

interface Metric {
  label: string;
  value: string;
  sub: string;
  accent: string;
  dot?: boolean;
}

export function MetricsRow({ tasks }: MetricsRowProps) {
  const total = tasks.length;
  const running = tasks.filter((t) => ACTIVE_STAGES.has(t.currentStage)).length;
  const completed = tasks.filter((t) => t.currentStage === "Completed").length;
  const failed = tasks.filter((t) => t.currentStage === "Failed").length;
  const successRate =
    completed + failed > 0
      ? Math.round((completed / (completed + failed)) * 100)
      : null;

  const metrics: Metric[] = [
    {
      label: "Total Tasks",
      value: String(total),
      sub: total === 0 ? "No tasks yet" : `${completed} completed`,
      accent: "text-primary",
    },
    {
      label: "Running",
      value: String(running),
      sub: running > 0 ? "agents active" : "idle",
      accent: running > 0 ? "text-running" : "text-secondary",
      dot: running > 0,
    },
    {
      label: "Completed",
      value: String(completed),
      sub: `${failed} failed`,
      accent: "text-success",
    },
    {
      label: "Success Rate",
      value: successRate !== null ? `${successRate}%` : "—",
      sub: `${completed}/${completed + failed} tasks`,
      accent:
        successRate !== null && successRate >= 80
          ? "text-success"
          : "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-xs font-medium text-secondary uppercase tracking-wider">
            {m.label}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <p className={`text-2xl font-bold ${m.accent}`}>{m.value}</p>
            {m.dot && (
              <span className="h-2 w-2 rounded-full bg-running animate-pulse" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{m.sub}</p>
        </div>
      ))}
    </div>
  );
}
