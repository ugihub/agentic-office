"use client";
import { useEffect, useState } from "react";

const DIVISIONS = [
  { id: "CEO", label: "CEO", icon: "👔", desc: "Routing & decisions" },
  { id: "HR", label: "HR", icon: "👥", desc: "Agent lifecycle" },
  { id: "Finance", label: "Finance", icon: "💰", desc: "Budget & costs" },
  {
    id: "Compliance",
    label: "Compliance",
    icon: "⚖",
    desc: "Policy enforcement",
  },
  { id: "Production", label: "Production", icon: "⚙", desc: "Task execution" },
  { id: "QA", label: "QA", icon: "✅", desc: "Quality review" },
  {
    id: "Marketing",
    label: "Marketing",
    icon: "📢",
    desc: "Content & reports",
  },
  { id: "IT", label: "IT", icon: "🖥", desc: "Infrastructure" },
] as const;

type DivisionId = (typeof DIVISIONS)[number]["id"];

interface Props {
  activeDivision: string | null;
  divisionMessages: Record<string, string>;
}

function useTypingText(text: string, speed = 25): string {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return displayed;
}

interface CardProps {
  _id: DivisionId;
  label: string;
  icon: string;
  desc: string;
  isActive: boolean;
  message: string | undefined;
}

function DivisionCard({
  _id,
  label,
  icon,
  desc,
  isActive,
  message,
}: CardProps) {
  const typedMessage = useTypingText(isActive && message ? message : "");

  return (
    <div
      className={`relative rounded-xl border p-3 transition-all duration-300 overflow-hidden ${
        isActive
          ? "border-brand-500 bg-surface"
          : "border-border bg-surface opacity-40"
      }`}
      style={
        isActive ? { boxShadow: "0 0 20px rgba(59,130,246,0.25)" } : undefined
      }
    >
      {/* Scan line — active only */}
      {isActive && (
        <div
          className="absolute inset-y-0 w-6 bg-gradient-to-r from-transparent via-brand-400/20 to-transparent animate-scanline pointer-events-none"
          style={{ top: 0, left: 0 }}
        />
      )}

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold truncate ${isActive ? "text-brand-400" : "text-primary"}`}
          >
            {label}
            {isActive && (
              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            )}
          </p>
          <p className="text-xs text-muted truncate">{desc}</p>
        </div>
      </div>

      {/* Progress bar — active only */}
      {isActive && (
        <div className="h-0.5 bg-raised rounded overflow-hidden mb-2">
          <div className="h-full bg-brand-500 animate-progressFill rounded" />
        </div>
      )}

      {/* Typing message */}
      {isActive && typedMessage && (
        <p
          className="text-xs text-primary/70 border-t border-border/50 pt-1 mt-1 font-mono line-clamp-2 min-h-[2rem]"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          &gt; {typedMessage}
          <span className="animate-blink">▋</span>
        </p>
      )}
    </div>
  );
}

export function DivisionCards({ activeDivision, divisionMessages }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {DIVISIONS.map(({ id, label, icon, desc }) => (
        <DivisionCard
          key={id}
          _id={id}
          label={label}
          icon={icon}
          desc={desc}
          isActive={activeDivision === id}
          message={divisionMessages[id]}
        />
      ))}
    </div>
  );
}
