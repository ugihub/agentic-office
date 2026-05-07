"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "⊞" },
  { href: "/tasks/new", label: "New Task", icon: "▶" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

type HealthStatus = "unknown" | "ok" | "error";

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthStatus>("unknown");

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
    const id = setInterval(() => void check(), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center px-6 border-b border-border">
        <span className="text-lg font-bold text-brand-400">◈ Bureau</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-l-2 border-brand-500 bg-raised text-brand-400 pl-[10px]"
                  : "text-secondary hover:bg-raised hover:text-primary"
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              health === "ok"
                ? "bg-success"
                : health === "error"
                  ? "bg-danger"
                  : "bg-muted"
            }`}
          />
          <p className="text-xs text-secondary">
            {health === "ok"
              ? "API Connected"
              : health === "error"
                ? "API Offline"
                : "Checking…"}
          </p>
        </div>
        <p className="text-xs text-muted">v0.1.0</p>
      </div>
    </aside>
  );
}
