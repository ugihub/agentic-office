"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { createBureauClient } from "@/lib/bureau-client";
import { StageBadge } from "@/components/StageBadge";
import { MetricsRow } from "@/components/MetricsRow";
import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

type Filter = "all" | "running" | "completed" | "failed" | "awaiting";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  awaiting: "Decision",
};

const RUNNING_STAGES = new Set<TaskStage>([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
]);

function matchesFilter(task: TaskEnvelope, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "running") return RUNNING_STAGES.has(task.currentStage);
  if (filter === "completed") return task.currentStage === "Completed";
  if (filter === "failed") return task.currentStage === "Failed";
  if (filter === "awaiting")
    return task.currentStage === "AwaitingUserDecision";
  return true;
}

function fetcher(): Promise<TaskEnvelope[]> {
  return createBureauClient().listTasks({ limit: 100 });
}

/** Path tier badge */
function PathBadge({ path }: { path: string }) {
  const styles: Record<string, string> = {
    fast: "bg-emerald-900/20 text-emerald-300 border-emerald-800/40",
    standard: "bg-blue-900/20 text-blue-300 border-blue-800/40",
    full: "bg-violet-900/20 text-violet-300 border-violet-800/40",
  };
  const cls = styles[path] ?? "bg-raised text-muted border-border";
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {path}
    </span>
  );
}

export function TaskList() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 8000 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-border bg-surface animate-pulse"
            />
          ))}
        </div>
        <div className="h-48 rounded-xl border border-border bg-surface animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4">
        <p className="text-sm text-red-400">
          Failed to load tasks — check{" "}
          <Link href="/settings" className="underline text-blue-400">
            Settings
          </Link>{" "}
          → Connection tab.
        </p>
      </div>
    );
  }

  const allTasks = tasks ?? [];
  const filtered = allTasks.filter((t) => matchesFilter(t, filter));

  return (
    <div className="space-y-4">
      <MetricsRow tasks={allTasks} />

      {/* Filter pills */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-raised text-secondary border border-border hover:text-primary hover:border-zinc-600"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 && allTasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-secondary mb-4 text-sm">No tasks yet.</p>
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            ▶ Submit your first task
          </Link>
        </div>
      )}

      {filtered.length === 0 && allTasks.length > 0 && (
        <div className="rounded-xl border border-border py-10 text-center text-sm text-muted">
          No tasks match this filter.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Table header */}
          <div className="grid grid-cols-[2.2fr_1.1fr_.9fr_.7fr_.7fr] border-b border-border bg-[#141414] px-4 py-2.5">
            {["Task", "Stage", "Path", "Cost", "Submitted"].map((h) => (
              <div
                key={h}
                className="text-[10px] font-semibold uppercase tracking-widest text-muted"
              >
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((task) => (
            <div
              key={task.taskId}
              className="grid grid-cols-[2.2fr_1.1fr_.9fr_.7fr_.7fr] items-center border-b border-[#141414] px-4 py-3 last:border-b-0 hover:bg-[#141414] cursor-pointer transition-colors"
              onClick={() => router.push(`/tasks/${task.taskId}`)}
            >
              <div className="min-w-0 pr-4">
                <p className="text-[11px] font-mono text-blue-400 truncate">
                  {task.taskId}
                </p>
                {task.promptPreview && (
                  <p className="mt-0.5 text-xs text-secondary truncate">
                    {task.promptPreview}
                  </p>
                )}
              </div>
              <div>
                <StageBadge stage={task.currentStage} />
              </div>
              <div>
                <PathBadge path={task.executionPath} />
              </div>
              <div className="text-xs font-mono text-muted">
                {task.costUsd ? `$${parseFloat(task.costUsd).toFixed(3)}` : "—"}
              </div>
              <div className="text-xs text-muted">
                {new Date(
                  task.submittedAt ?? task.createdAt,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
