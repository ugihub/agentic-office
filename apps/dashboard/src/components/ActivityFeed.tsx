import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

interface ActivityFeedProps {
  tasks: TaskEnvelope[];
}

interface ActivityItem {
  id: string;
  icon: string;
  iconCls: string;
  verb: string;
  preview: string;
  time: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const STAGE_EVENT: Partial<
  Record<TaskStage, { icon: string; iconCls: string; verb: string }>
> = {
  Completed: {
    icon: "✓",
    iconCls: "bg-emerald-900/40 text-emerald-400",
    verb: "completed",
  },
  Failed: { icon: "✗", iconCls: "bg-red-900/40 text-red-400", verb: "failed" },
  AwaitingUserDecision: {
    icon: "⚠",
    iconCls: "bg-amber-900/40 text-amber-400",
    verb: "needs decision",
  },
  Producing: {
    icon: "⚙",
    iconCls: "bg-violet-900/40 text-violet-400",
    verb: "producing",
  },
  Submitted: {
    icon: "▶",
    iconCls: "bg-blue-900/40 text-blue-400",
    verb: "submitted",
  },
};

export function ActivityFeed({ tasks }: ActivityFeedProps) {
  const items: ActivityItem[] = tasks.slice(0, 6).map((task) => {
    const meta = STAGE_EVENT[task.currentStage] ?? STAGE_EVENT["Submitted"]!;
    const preview = task.promptPreview
      ? task.promptPreview.slice(0, 45)
      : task.taskId.slice(0, 20) + "…";
    return {
      id: task.taskId,
      icon: meta.icon,
      iconCls: meta.iconCls,
      verb: meta.verb,
      preview,
      time: timeAgo(task.submittedAt ?? task.createdAt),
    };
  });

  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted">No recent activity.</p>
    );
  }

  return (
    <ul className="divide-y divide-[#141414]">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span
            className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${item.iconCls}`}
          >
            {item.icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-secondary leading-relaxed">
              <strong className="font-medium text-primary/90">
                Task {item.verb}
              </strong>
              {" — "}
              {item.preview}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">{item.time}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
