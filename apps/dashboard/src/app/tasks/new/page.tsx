import { TaskForm } from "@/components/TaskForm";

export default function NewTaskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Task</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submit a task to the multi-agent system
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <TaskForm />
      </div>
    </div>
  );
}
