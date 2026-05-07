"use client";
import { useEffect, useRef, useState } from "react";
import type { TaskStage } from "@bureau/sdk";

interface StageOverlayProps {
  currentStage: TaskStage | null;
}

const STAGE_SUBTITLES: Partial<Record<TaskStage, string>> = {
  Preparing: "Initializing agent division",
  Researching: "Research division activated",
  Producing: "Production division activated",
  Reviewing: "QA division activated",
  Formatting: "Formatting division activated",
  Completed: "Task complete",
  Failed: "Task failed",
  AwaitingUserDecision: "Awaiting your decision",
};

export function StageOverlay({ currentStage }: StageOverlayProps) {
  const prevStageRef = useRef<TaskStage | null>(null);
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [displayStage, setDisplayStage] = useState<TaskStage | null>(null);

  useEffect(() => {
    if (currentStage === null) return;

    // Only trigger on changes, not initial mount
    if (
      prevStageRef.current !== null &&
      currentStage !== prevStageRef.current
    ) {
      setDisplayStage(currentStage);
      setFadingOut(false);
      setVisible(true);

      const fadeTimer = setTimeout(() => setFadingOut(true), 800);
      const hideTimer = setTimeout(() => setVisible(false), 1200);

      prevStageRef.current = currentStage;
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }

    prevStageRef.current = currentStage;
  }, [currentStage]);

  if (!visible || displayStage === null) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none ${
        fadingOut ? "animate-overlayFadeOut" : ""
      }`}
      style={{ background: "rgba(0,0,0,0.85)" }}
    >
      <div className="text-center space-y-2 px-8 py-6 rounded-2xl border border-brand-500/40 bg-surface/80 backdrop-blur-sm">
        <p className="text-4xl font-bold text-brand-400 tracking-tight">
          {displayStage}
        </p>
        <p className="text-sm text-secondary">
          {STAGE_SUBTITLES[displayStage] ?? "Stage transition"}
        </p>
      </div>
    </div>
  );
}
