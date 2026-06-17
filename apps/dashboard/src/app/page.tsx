"use client";
import Link from "next/link";
import useSWR from "swr";
import { createBureauClient } from "@/lib/bureau-client";
import { MetricsRow } from "@/components/MetricsRow";
import { StageBadge } from "@/components/StageBadge";
import { ActivityFeed } from "@/components/ActivityFeed";
import { QuickActions } from "@/components/QuickActions";
import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

const RUNNING_STAGES = new Set<TaskStage>([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
]);

function fetcher(): Promise<TaskEnvelope[]> {
  return createBureauClient().listTasks({ limit: 50 });
}

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

export default function HomePage() {
  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("dashboard-tasks", fetcher, {
    refreshInterval: 8000,
  });

  const allTasks = tasks ?? [];
  const running = allTasks.filter((t) => RUNNING_STAGES.has(t.currentStage));
  const recent = allTasks.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Multi-agent AI task management
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_16px_rgba(59,130,246,.35)] hover:from-blue-400 hover:to-blue-500 transition-all"
        >
          ▶ New Task
        </Link>
      </div>

      {/* Metrics */}
      {!isLoading && !error && <MetricsRow tasks={allTasks} />}
      {isLoading && (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-border bg-surface animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-400">
          Could not reach API —{" "}
          <Link href="/settings" className="underline text-blue-400">
            check Settings
          </Link>
        </div>
      )}

      {/* Running now banner */}
      {running.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-violet-800/40 bg-violet-950/20 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse shadow-[0_0_6px_#8b5cf6]" />
          <span className="text-xs text-violet-300 font-medium">
            {running.length} task{running.length > 1 ? "s" : ""} in progress
          </span>
          <span className="ml-auto text-[10px] text-violet-500">
            {running.map((t) => t.currentStage).join(" · ")}
          </span>
        </div>
      )}

      {/* Recent tasks */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Recent Tasks</h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-800/40 bg-violet-950/20 px-2.5 py-0.5 text-[10px] font-semibold text-violet-400">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              live
            </span>
            <Link
              href="/tasks"
              className="text-[11px] text-muted hover:text-secondary"
            >
              View all →
            </Link>
          </div>
        </div>

        {recent.length === 0 && !isLoading && (
          <div className="rounded-xl border border-dashed border-border py-14 text-center">
            <p className="text-secondary text-sm mb-3">No tasks yet.</p>
            <Link
              href="/tasks/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              ▶ Submit your first task
            </Link>
          </div>
        )}

        {recent.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-[2.2fr_1.1fr_.9fr_.7fr_.7fr] border-b border-border bg-[#141414] px-4 py-2.5">
              {["Task", "Stage", "Path", "Cost", "Time"].map((h) => (
                <div
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted"
                >
                  {h}
                </div>
              ))}
            </div>
            {recent.map((task) => (
              <Link
                key={task.taskId}
                href={`/tasks/${task.taskId}`}
                className="grid grid-cols-[2.2fr_1.1fr_.9fr_.7fr_.7fr] items-center border-b border-[#141414] px-4 py-3 last:border-b-0 hover:bg-[#141414] transition-colors"
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
                  {task.costUsd
                    ? `$${parseFloat(task.costUsd).toFixed(3)}`
                    : "—"}
                </div>
                <div className="text-xs text-muted">
                  {new Date(
                    task.submittedAt ?? task.createdAt,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Bottom 2-col */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-primary">
            Activity Feed
          </h2>
          <ActivityFeed tasks={allTasks} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-primary">
            Quick Actions
          </h2>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
