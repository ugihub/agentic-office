"use client";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { createBureauClient } from "@/lib/bureau-client";
import { StageBadge } from "@/components/StageBadge";
import type { TaskEnvelope } from "@bureau/sdk";

function fetcher(): Promise<TaskEnvelope[]> {
  return createBureauClient().listTasks({ limit: 50 });
}

export function TaskList() {
  const router = useRouter();
  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 5000 });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-400">Loading tasks…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-600">
          Failed to load tasks — check{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          → API connection.
        </p>
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">No tasks yet.</p>
        <Link
          href="/tasks/new"
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Submit your first task
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Task ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Path
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cost
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => (
            <tr
              key={task.taskId}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => router.push(`/tasks/${task.taskId}`)}
            >
              <td className="px-4 py-3 text-xs font-mono text-gray-600">
                {task.taskId.slice(0, 16)}…
              </td>
              <td className="px-4 py-3">
                <StageBadge stage={task.currentStage} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {task.executionPath}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {task.costUsd !== null ? `$${task.costUsd}` : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(task.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
