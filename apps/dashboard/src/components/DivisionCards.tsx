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
  {
    id: "Production",
    label: "Production",
    icon: "⚙",
    desc: "Task execution",
  },
  { id: "QA", label: "QA", icon: "✅", desc: "Quality review" },
  {
    id: "Marketing",
    label: "Marketing",
    icon: "📢",
    desc: "Content & reports",
  },
  { id: "IT", label: "IT", icon: "🖥", desc: "Infrastructure" },
] as const;

interface Props {
  activeDivision: string | null;
  divisionMessages: Record<string, string>;
}

export function DivisionCards({ activeDivision, divisionMessages }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {DIVISIONS.map(({ id, label, icon, desc }) => {
        const isActive = activeDivision === id;
        const message = divisionMessages[id];
        return (
          <div
            key={id}
            className={`rounded-xl border p-3 transition-all duration-300 ${
              isActive
                ? "border-brand-400 bg-brand-50 shadow-md ring-1 ring-brand-400"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{icon}</span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold truncate ${isActive ? "text-brand-700" : "text-gray-800"}`}
                >
                  {label}
                  {isActive && (
                    <span className="ml-1 inline-block h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                  )}
                </p>
                <p className="text-xs text-gray-400 truncate">{desc}</p>
              </div>
            </div>
            {message && (
              <p className="mt-1 text-xs text-gray-600 line-clamp-2 border-t border-gray-100 pt-1">
                {message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
