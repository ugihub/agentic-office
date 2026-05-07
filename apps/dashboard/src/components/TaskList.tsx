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
  awaiting: "Awaiting Decision",
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

export function TaskList() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 10000 });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-secondary">Loading tasks…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">
          Failed to load tasks — check{" "}
          <Link href="/settings" className="underline text-brand-400">
            Settings
          </Link>{" "}
          → API connection.
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
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-brand-500 text-white"
                : "bg-raised text-secondary border border-border hover:text-primary"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 && allTasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-secondary mb-4">No tasks yet.</p>
          <Link
            href="/tasks/new"
            className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Submit your first task
          </Link>
        </div>
      )}

      {filtered.length === 0 && allTasks.length > 0 && (
        <div className="text-center py-8 text-secondary text-sm">
          No tasks match this filter.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-raised">
              <tr>
                {["Task ID", "Stage", "Path", "Created"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((task) => (
                <tr
                  key={task.taskId}
                  className="hover:bg-raised cursor-pointer transition-colors"
                  onClick={() => router.push(`/tasks/${task.taskId}`)}
                >
                  <td className="px-4 py-3 text-xs font-mono text-secondary">
                    {task.taskId.slice(0, 16)}…
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={task.currentStage} />
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary capitalize">
                    {task.executionPath}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
