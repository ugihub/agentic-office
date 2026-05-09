"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: "⊞", exact: true },
      { href: "/tasks", label: "All Tasks", icon: "≡", exact: true },
      { href: "/tasks/new", label: "New Task", icon: "▶", exact: true },
    ],
  },
  {
    section: "Management",
    items: [{ href: "/settings", label: "Settings", icon: "⚙" }],
  },
];

type Health = "unknown" | "ok" | "error";

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health>("unknown");

  useEffect(() => {
    const apiUrl =
      localStorage.getItem("bureau_api_url") ?? "http://localhost:3001";

    async function check() {
      try {
        const res = await fetch(`${apiUrl}/health/ready`);
        setHealth(res.ok ? "ok" : "error");
      } catch {
        setHealth("error");
      }
    }

    void check();
    const id = setInterval(() => void check(), 15_000);
    return () => clearInterval(id);
  }, []);

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r border-border bg-[#0e0e0e] flex-shrink-0">
      {/* Logo */}
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-gradient-to-br from-blue-500 to-violet-600 text-[11px] font-bold text-white">
            ◈
          </div>
          <span className="text-[17px] font-bold tracking-tight text-primary">
            Bureau
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted">Agentic Office v0.1</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map(({ section, items }) => (
          <div key={section} className="mb-2">
            <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-widest text-[#333]">
              {section}
            </p>
            {items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-l-2 border-blue-500 bg-blue-950/30 pl-[9px] text-blue-300"
                      : "text-[#666] hover:bg-[#1a1a1a] hover:text-primary"
                  }`}
                >
                  <span className="w-4 text-center text-[13px]">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`h-[7px] w-[7px] rounded-full flex-shrink-0 ${
              health === "ok"
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.6)]"
                : health === "error"
                  ? "bg-red-400"
                  : "bg-[#444]"
            }`}
          />
          <span className="text-[11px] text-[#555]">
            {health === "ok"
              ? "API Connected"
              : health === "error"
                ? "API Offline"
                : "Checking…"}
          </span>
        </div>
        {health === "ok" && (
          <p className="text-[10px] text-[#333]">Redis · Mongo · Jaeger</p>
        )}
      </div>
    </aside>
  );
}
