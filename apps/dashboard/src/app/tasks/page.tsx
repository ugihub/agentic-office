import { TaskList } from "@/components/TaskList";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary tracking-tight">
          All Tasks
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Filter, search, and manage all submitted tasks
        </p>
      </div>
      <TaskList />
    </div>
  );
}
