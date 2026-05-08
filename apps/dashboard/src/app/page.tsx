import Link from "next/link";
import { TaskList } from "@/components/TaskList";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-secondary mt-1">
            Multi-agent AI task management
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          <span>▶</span> New Task
        </Link>
      </div>
      <TaskList />
    </div>
  );
}
