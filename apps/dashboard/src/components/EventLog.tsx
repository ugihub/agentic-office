import type { BureauSSEEvent } from "@bureau/sdk";

interface Props {
  events: BureauSSEEvent[];
}

function formatEvent(e: BureauSSEEvent): string {
  switch (e.event) {
    case "task.stage.changed":
      return `Stage: ${e.from} → ${e.to}`;
    case "division.progress": {
      const msg = (e as { message?: string }).message;
      return `[${e.division}] ${msg ?? "working…"}`;
    }
    case "decision_required":
      return `Decision required: ${e.pendingDecision.reason}`;
    case "task.completed":
      return "Task completed ✓";
    case "task.failed":
      return `Task failed: ${e.reason}`;
    default:
      return JSON.stringify(e);
  }
}

export function EventLog({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 italic">Waiting for events…</p>;
  }
  return (
    <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg bg-gray-900 p-3">
      {events.map((e, i) => (
        <p key={i} className="text-xs font-mono text-gray-300">
          <span className="text-gray-500 mr-2">
            {String(i + 1).padStart(3, "0")}
          </span>
          {formatEvent(e)}
        </p>
      ))}
    </div>
  );
}
