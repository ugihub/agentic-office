import Link from "next/link";

interface Action {
  href: string;
  icon: string;
  iconCls: string;
  title: string;
  sub: string;
}

const ACTIONS: Action[] = [
  {
    href: "/tasks/new",
    icon: "▶",
    iconCls: "bg-blue-900/30 border border-blue-800/50 text-blue-300",
    title: "Submit New Task",
    sub: "Route to multi-agent pipeline",
  },
  {
    href: "/settings",
    icon: "🔑",
    iconCls: "bg-emerald-900/30 border border-emerald-800/50 text-emerald-300",
    title: "Generate API Key",
    sub: "bureau_live_… for external callers",
  },
  {
    href: "/settings",
    icon: "🤖",
    iconCls: "bg-violet-900/30 border border-violet-800/50 text-violet-300",
    title: "Configure LLM Providers",
    sub: "Anthropic · Gemini · OpenAI",
  },
];

export function QuickActions() {
  return (
    <ul className="flex flex-col gap-2">
      {ACTIONS.map((a) => (
        <li key={a.title}>
          <Link
            href={a.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-[#141414] px-4 py-3 transition-colors hover:border-zinc-600 hover:bg-[#191919]"
          >
            <span
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base ${a.iconCls}`}
            >
              {a.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">{a.title}</p>
              <p className="text-xs text-muted mt-0.5">{a.sub}</p>
            </div>
            <span className="text-muted text-lg">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
