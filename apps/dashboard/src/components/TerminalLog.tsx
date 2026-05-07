"use client";
import { useEffect, useRef } from "react";
import type { BureauSSEEvent } from "@bureau/sdk";

interface TerminalLogProps {
  events: BureauSSEEvent[];
  isStreaming: boolean;
}

interface TerminalEntry {
  index: number;
  time: string;
  division: string;
  message: string;
}

const DIVISION_COLORS: Record<string, string> = {
  CEO: "text-blue-400",
  Finance: "text-yellow-400",
  Production: "text-green-400",
  QA: "text-purple-400",
  HR: "text-pink-400",
  Compliance: "text-orange-400",
  IT: "text-cyan-400",
  Marketing: "text-rose-400",
  SYSTEM: "text-secondary",
};

function formatEvent(e: BureauSSEEvent): { division: string; message: string } {
  switch (e.event) {
    case "task.stage.changed":
      return {
        division: "SYSTEM",
        message: `Stage transition: ${e.from} → ${e.to}`,
      };
    case "division.progress": {
      const msg = (e as { message?: string }).message;
      return {
        division: e.division.toUpperCase(),
        message: msg ?? "Processing…",
      };
    }
    case "decision_required":
      return {
        division: "SYSTEM",
        message: `Decision required: ${e.pendingDecision.reason}`,
      };
    case "task.completed":
      return {
        division: "SYSTEM",
        message: `✓ Task completed — quality: ${e.outputQuality}, cost: $${e.costUsd}`,
      };
    case "task.failed":
      return {
        division: "SYSTEM",
        message: `✗ Task failed after ${e.attempts} attempts: ${e.reason}`,
      };
    default:
      return { division: "SYSTEM", message: JSON.stringify(e) };
  }
}

export function TerminalLog({ events, isStreaming }: TerminalLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const timesRef = useRef<Map<number, string>>(new Map());

  // Record timestamp when new events arrive
  useEffect(() => {
    events.forEach((_, i) => {
      if (!timesRef.current.has(i)) {
        timesRef.current.set(i, new Date().toTimeString().slice(0, 8));
      }
    });
  }, [events]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const entries: TerminalEntry[] = events.map((e, i) => {
    const { division, message } = formatEvent(e);
    return {
      index: i,
      time: timesRef.current.get(i) ?? "--:--:--",
      division,
      message,
    };
  });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-raised border-b border-border">
        <span className="text-xs font-mono font-medium text-secondary">
          ● BUREAU SYSTEM LOG
        </span>
        <span
          className={`text-xs font-mono flex items-center gap-1.5 ${isStreaming ? "text-success" : "text-muted"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isStreaming ? "bg-success animate-pulse" : "bg-muted"}`}
          />
          {isStreaming ? "LIVE" : "DONE"}
        </span>
      </div>

      {/* Log body */}
      <div
        className="max-h-[400px] overflow-y-auto p-3 space-y-0.5 bg-[#0d0d0d]"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        {entries.length === 0 && (
          <p className="text-xs text-muted italic">Waiting for events…</p>
        )}
        {entries.map((entry) => {
          const divisionColor =
            DIVISION_COLORS[entry.division] ?? "text-secondary";
          return (
            <div
              key={entry.index}
              className="flex gap-3 text-xs animate-slideUp"
            >
              <span className="text-muted shrink-0">[{entry.time}]</span>
              <span
                className={`shrink-0 w-12 truncate font-medium ${divisionColor}`}
              >
                {entry.division}
              </span>
              <span className="text-primary/80 break-all">{entry.message}</span>
            </div>
          );
        })}
        {isStreaming && entries.length > 0 && (
          <span className="text-brand-400 text-xs animate-blink">█</span>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
