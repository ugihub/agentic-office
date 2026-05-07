# Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul `apps/dashboard` to dark-mode enterprise UI with API Key management, LLM Provider key management, live metrics, and dramatic agentic animations.

**Architecture:** UI-only layer change — all logic hooks (`useTaskStream`, `useSettings`, `bureau-client`) stay untouched. New Tailwind dark tokens replace light classes across all components. New components added alongside existing ones; Settings page gets tab-based layout.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.4, Tailwind CSS 3.4, SWR 2.2, `@bureau/sdk` BureauClient, JetBrains Mono (Google Fonts), CSS `@keyframes` animations only (no animation libraries).

---

## File Map

### Modified

- `apps/dashboard/tailwind.config.ts` — add dark color tokens
- `apps/dashboard/src/app/globals.css` — dark base + JetBrains Mono + keyframes
- `apps/dashboard/src/app/layout.tsx` — dark body bg
- `apps/dashboard/src/app/page.tsx` — add MetricsRow above TaskList
- `apps/dashboard/src/app/tasks/new/page.tsx` — dark wrapper
- `apps/dashboard/src/app/tasks/[id]/page.tsx` — wire StageOverlay, TerminalLog, AgentThinkingDots
- `apps/dashboard/src/app/settings/page.tsx` — replace with tab layout
- `apps/dashboard/src/components/Sidebar.tsx` — dark + health dot
- `apps/dashboard/src/components/StageBadge.tsx` — dark color scheme
- `apps/dashboard/src/components/StageProgress.tsx` — horizontal shimmer bar
- `apps/dashboard/src/components/DivisionCards.tsx` — glow + scan line + typing effect
- `apps/dashboard/src/components/DecisionPanel.tsx` — dark styling
- `apps/dashboard/src/components/TaskForm.tsx` — dark inputs
- `apps/dashboard/src/components/TaskList.tsx` — dark table + filter pills
- `apps/dashboard/src/components/EventLog.tsx` — kept for compat (unused)

### Created

- `apps/dashboard/src/components/MetricsRow.tsx` — 4 stats cards
- `apps/dashboard/src/components/StageOverlay.tsx` — fullscreen stage transition flash
- `apps/dashboard/src/components/TerminalLog.tsx` — terminal-style event log
- `apps/dashboard/src/components/AgentThinkingDots.tsx` — ◈ ◈ ◈ animated indicator
- `apps/dashboard/src/components/settings/ConnectionTab.tsx` — connection form
- `apps/dashboard/src/components/settings/ApiKeysTab.tsx` — create/list/revoke API keys
- `apps/dashboard/src/components/settings/ProviderKeysTab.tsx` — store/remove provider keys

### Unchanged

- `src/hooks/useTaskStream.ts`
- `src/hooks/useSettings.ts`
- `src/lib/bureau-client.ts`

---

## Task 1: Tailwind Dark Tokens + CSS Keyframes

**Files:**

- Modify: `apps/dashboard/tailwind.config.ts`
- Modify: `apps/dashboard/src/app/globals.css`

- [ ] **Step 1: Replace tailwind.config.ts**

```typescript
// apps/dashboard/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#080808",
        surface: "#111111",
        raised: "#1a1a1a",
        border: "#262626",
        primary: "#ededed",
        secondary: "#888888",
        muted: "#555555",
        brand: {
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        running: "#8b5cf6",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        dotPulse: {
          "0%, 100%": {
            opacity: "0.3",
            filter: "drop-shadow(0 0 2px #60a5fa)",
          },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 8px #60a5fa)" },
        },
        progressFill: {
          "0%": { width: "0%" },
          "100%": { width: "80%" },
        },
        overlayFadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        scanline: "scanline 2s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        slideUp: "slideUp 0.2s ease-out forwards",
        dotPulse: "dotPulse 1.2s ease-in-out infinite",
        progressFill: "progressFill 3s ease-out forwards",
        overlayFadeOut: "overlayFadeOut 0.4s ease-out forwards",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Replace globals.css**

```css
/* apps/dashboard/src/app/globals.css */
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-base text-primary antialiased;
  }
}

@layer utilities {
  .shimmer-bg {
    background: linear-gradient(
      90deg,
      #3b82f6 0%,
      #60a5fa 40%,
      #3b82f6 60%,
      #1d4ed8 100%
    );
    background-size: 200% 100%;
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/tailwind.config.ts apps/dashboard/src/app/globals.css
git commit -m "feat(dashboard): dark mode tokens + animation keyframes"
```

---

## Task 2: Dark Layout + Sidebar

**Files:**

- Modify: `apps/dashboard/src/app/layout.tsx`
- Modify: `apps/dashboard/src/components/Sidebar.tsx`

- [ ] **Step 1: Replace layout.tsx**

```tsx
// apps/dashboard/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Agentic Office",
  description: "Multi-Agent AI Platform Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-base text-primary">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8 bg-base">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace Sidebar.tsx**

```tsx
// apps/dashboard/src/components/Sidebar.tsx
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
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/layout.tsx apps/dashboard/src/components/Sidebar.tsx
git commit -m "feat(dashboard): dark layout + sidebar with health status dot"
```

---

## Task 3: StageBadge Dark Colors

**Files:**

- Modify: `apps/dashboard/src/components/StageBadge.tsx`

- [ ] **Step 1: Replace StageBadge.tsx**

```tsx
// apps/dashboard/src/components/StageBadge.tsx
import type { TaskStage } from "@bureau/sdk";

const STAGE_STYLES: Record<TaskStage, string> = {
  Submitted: "bg-blue-900/40 text-blue-300 border border-blue-800",
  Preparing: "bg-running/20 text-purple-300 border border-running/40",
  Researching: "bg-running/20 text-purple-300 border border-running/40",
  Producing: "bg-running/20 text-purple-300 border border-running/40",
  Reviewing: "bg-running/20 text-purple-300 border border-running/40",
  Formatting: "bg-running/20 text-purple-300 border border-running/40",
  AwaitingUserDecision:
    "bg-warning/20 text-yellow-300 border border-warning/40 animate-pulse",
  Completed: "bg-success/20 text-green-300 border border-success/40",
  Failed: "bg-danger/20 text-red-300 border border-danger/40",
  Cancelled: "bg-raised text-muted border border-border",
};

const STAGE_DOTS: Partial<Record<TaskStage, string>> = {
  Preparing: "●",
  Researching: "●",
  Producing: "●",
  Reviewing: "●",
  Formatting: "●",
  AwaitingUserDecision: "⚠",
  Completed: "✓",
  Failed: "✗",
};

export function StageBadge({ stage }: { stage: TaskStage }) {
  const dot = STAGE_DOTS[stage];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {dot && <span className="text-[10px]">{dot}</span>}
      {stage}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/StageBadge.tsx
git commit -m "feat(dashboard): dark StageBadge with color-coded status"
```

---

## Task 4: MetricsRow Component

**Files:**

- Create: `apps/dashboard/src/components/MetricsRow.tsx`

- [ ] **Step 1: Create MetricsRow.tsx**

```tsx
// apps/dashboard/src/components/MetricsRow.tsx
import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

const ACTIVE_STAGES = new Set<TaskStage>([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "AwaitingUserDecision",
]);

interface MetricsRowProps {
  tasks: TaskEnvelope[];
}

interface Metric {
  label: string;
  value: string;
  sub: string;
  accent: string;
  dot?: boolean;
}

export function MetricsRow({ tasks }: MetricsRowProps) {
  const total = tasks.length;
  const running = tasks.filter((t) => ACTIVE_STAGES.has(t.currentStage)).length;
  const completed = tasks.filter((t) => t.currentStage === "Completed").length;
  const failed = tasks.filter((t) => t.currentStage === "Failed").length;
  const successRate =
    completed + failed > 0
      ? Math.round((completed / (completed + failed)) * 100)
      : null;

  const metrics: Metric[] = [
    {
      label: "Total Tasks",
      value: String(total),
      sub: total === 0 ? "No tasks yet" : `${completed} completed`,
      accent: "text-primary",
    },
    {
      label: "Running",
      value: String(running),
      sub: running > 0 ? "agents active" : "idle",
      accent: running > 0 ? "text-running" : "text-secondary",
      dot: running > 0,
    },
    {
      label: "Completed",
      value: String(completed),
      sub: `${failed} failed`,
      accent: "text-success",
    },
    {
      label: "Success Rate",
      value: successRate !== null ? `${successRate}%` : "—",
      sub: `${completed}/${completed + failed} tasks`,
      accent:
        successRate !== null && successRate >= 80
          ? "text-success"
          : "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-xs font-medium text-secondary uppercase tracking-wider">
            {m.label}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <p className={`text-2xl font-bold ${m.accent}`}>{m.value}</p>
            {m.dot && (
              <span className="h-2 w-2 rounded-full bg-running animate-pulse" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{m.sub}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/MetricsRow.tsx
git commit -m "feat(dashboard): MetricsRow with task stats (total/running/completed/rate)"
```

---

## Task 5: TaskList Dark + Filter Pills

**Files:**

- Modify: `apps/dashboard/src/components/TaskList.tsx`

- [ ] **Step 1: Replace TaskList.tsx**

```tsx
// apps/dashboard/src/components/TaskList.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { createBureauClient } from "@/lib/bureau-client";
import { StageBadge } from "@/components/StageBadge";
import { MetricsRow } from "@/components/MetricsRow";
import type { TaskEnvelope, TaskStage } from "@bureau/sdk";

type Filter = "all" | "running" | "completed" | "failed" | "awaiting";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  awaiting: "Awaiting Decision",
};

const RUNNING_STAGES = new Set<TaskStage>([
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
]);

function matchesFilter(task: TaskEnvelope, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "running") return RUNNING_STAGES.has(task.currentStage);
  if (filter === "completed") return task.currentStage === "Completed";
  if (filter === "failed") return task.currentStage === "Failed";
  if (filter === "awaiting")
    return task.currentStage === "AwaitingUserDecision";
  return true;
}

function fetcher(): Promise<TaskEnvelope[]> {
  return createBureauClient().listTasks({ limit: 100 });
}

export function TaskList() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 10000 });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-secondary">Loading tasks…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">
          Failed to load tasks — check{" "}
          <Link href="/settings" className="underline text-brand-400">
            Settings
          </Link>{" "}
          → API connection.
        </p>
      </div>
    );
  }

  const allTasks = tasks ?? [];
  const filtered = allTasks.filter((t) => matchesFilter(t, filter));

  return (
    <div className="space-y-4">
      <MetricsRow tasks={allTasks} />

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-brand-500 text-white"
                : "bg-raised text-secondary border border-border hover:text-primary"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 && allTasks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-secondary mb-4">No tasks yet.</p>
          <Link
            href="/tasks/new"
            className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Submit your first task
          </Link>
        </div>
      )}

      {filtered.length === 0 && allTasks.length > 0 && (
        <div className="text-center py-8 text-secondary text-sm">
          No tasks match this filter.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-raised">
              <tr>
                {["Task ID", "Stage", "Path", "Created"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((task) => (
                <tr
                  key={task.taskId}
                  className="hover:bg-raised cursor-pointer transition-colors"
                  onClick={() => router.push(`/tasks/${task.taskId}`)}
                >
                  <td className="px-4 py-3 text-xs font-mono text-secondary">
                    {task.taskId.slice(0, 16)}…
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={task.currentStage} />
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary capitalize">
                    {task.executionPath}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/TaskList.tsx
git commit -m "feat(dashboard): dark TaskList with filter pills and MetricsRow integration"
```

---

## Task 6: Home Page

**Files:**

- Modify: `apps/dashboard/src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx**

```tsx
// apps/dashboard/src/app/page.tsx
import Link from "next/link";
import { TaskList } from "@/components/TaskList";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-secondary mt-1">
            Multi-agent AI task management
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          <span>▶</span> New Task
        </Link>
      </div>
      <TaskList />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/page.tsx
git commit -m "feat(dashboard): dark home page heading"
```

---

## Task 7: StageProgress Horizontal Shimmer Bar

**Files:**

- Modify: `apps/dashboard/src/components/StageProgress.tsx`

- [ ] **Step 1: Replace StageProgress.tsx**

```tsx
// apps/dashboard/src/components/StageProgress.tsx
import type { TaskStage } from "@bureau/sdk";

const FLOW_STAGES: TaskStage[] = [
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "Completed",
];

const STAGE_INDEX = new Map<TaskStage, number>(
  FLOW_STAGES.map((s, i) => [s, i]),
);

export function StageProgress({ current }: { current: TaskStage }) {
  const currentIdx = STAGE_INDEX.get(current) ?? -1;

  return (
    <div className="w-full space-y-3">
      {/* Side-state banners */}
      {current === "AwaitingUserDecision" && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-center text-xs font-medium text-yellow-300 animate-pulse">
          ⚠ Agent requires your decision before continuing
        </div>
      )}
      {current === "Failed" && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-center text-xs font-medium text-red-300">
          ✗ Task failed
        </div>
      )}
      {current === "Cancelled" && (
        <div className="rounded-lg bg-raised border border-border px-3 py-2 text-center text-xs font-medium text-muted">
          Task cancelled
        </div>
      )}

      {/* Segmented bar */}
      <div className="flex items-stretch gap-0.5">
        {FLOW_STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const pending = idx > currentIdx;

          return (
            <div key={stage} className="flex-1 flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-sm overflow-hidden ${
                  done
                    ? "bg-success"
                    : active
                      ? "shimmer-bg animate-shimmer"
                      : "bg-raised"
                }`}
              />
              <p
                className={`text-[10px] text-center truncate ${
                  active
                    ? "text-brand-400 font-medium"
                    : done
                      ? "text-success"
                      : pending
                        ? "text-muted"
                        : "text-muted"
                }`}
              >
                {stage}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/StageProgress.tsx
git commit -m "feat(dashboard): horizontal shimmer StageProgress bar"
```

---

## Task 8: AgentThinkingDots Component

**Files:**

- Create: `apps/dashboard/src/components/AgentThinkingDots.tsx`

- [ ] **Step 1: Create AgentThinkingDots.tsx**

```tsx
// apps/dashboard/src/components/AgentThinkingDots.tsx
export function AgentThinkingDots() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="text-brand-400 text-lg animate-dotPulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          >
            ◈
          </span>
        ))}
      </div>
      <span className="text-xs font-mono font-medium text-secondary tracking-widest uppercase">
        Bureau Agents Processing
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/AgentThinkingDots.tsx
git commit -m "feat(dashboard): AgentThinkingDots animated indicator"
```

---

## Task 9: StageOverlay Component

**Files:**

- Create: `apps/dashboard/src/components/StageOverlay.tsx`

- [ ] **Step 1: Create StageOverlay.tsx**

```tsx
// apps/dashboard/src/components/StageOverlay.tsx
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/StageOverlay.tsx
git commit -m "feat(dashboard): StageOverlay fullscreen transition flash"
```

---

## Task 10: TerminalLog Component

**Files:**

- Create: `apps/dashboard/src/components/TerminalLog.tsx`

- [ ] **Step 1: Create TerminalLog.tsx**

```tsx
// apps/dashboard/src/components/TerminalLog.tsx
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/TerminalLog.tsx
git commit -m "feat(dashboard): TerminalLog with division color-coding + auto-scroll"
```

---

## Task 11: DivisionCards Dark + Glow + Typing + Scan Line

**Files:**

- Modify: `apps/dashboard/src/components/DivisionCards.tsx`

- [ ] **Step 1: Replace DivisionCards.tsx**

```tsx
// apps/dashboard/src/components/DivisionCards.tsx
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
  id: DivisionId;
  label: string;
  icon: string;
  desc: string;
  isActive: boolean;
  message: string | undefined;
}

function DivisionCard({ id, label, icon, desc, isActive, message }: CardProps) {
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
          id={id}
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/DivisionCards.tsx
git commit -m "feat(dashboard): DivisionCards with glow, scan line, typing effect, progress bar"
```

---

## Task 12: DecisionPanel + TaskForm Dark

**Files:**

- Modify: `apps/dashboard/src/components/DecisionPanel.tsx`
- Modify: `apps/dashboard/src/components/TaskForm.tsx`
- Modify: `apps/dashboard/src/app/tasks/new/page.tsx`

- [ ] **Step 1: Replace DecisionPanel.tsx**

```tsx
// apps/dashboard/src/components/DecisionPanel.tsx
"use client";
import { useState, useEffect } from "react";
import type { PendingDecision, DecisionAction } from "@bureau/sdk";

interface Props {
  taskId: string;
  decision: PendingDecision;
  onSubmit: (action: DecisionAction) => Promise<void>;
}

export function DecisionPanel({ taskId: _taskId, decision, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState<DecisionAction | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const expiresAt = new Date(decision.expiresAt).getTime();
    function tick() {
      setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [decision.expiresAt]);

  async function handleAction(action: DecisionAction) {
    setSubmitting(action);
    try {
      await onSubmit(action);
    } finally {
      setSubmitting(null);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="rounded-xl border-2 border-warning/50 bg-warning/5 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 mr-4">
          <h3 className="text-lg font-bold text-yellow-300">
            ⚠ Decision Required
          </h3>
          <p className="mt-1 text-sm text-secondary">{decision.reason}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted">Expires in</p>
          <p className="text-2xl font-mono font-bold text-yellow-300">
            {minutes}:{String(seconds).padStart(2, "0")}
          </p>
        </div>
      </div>

      {decision.bestEffortOutput?.available === true && (
        <div className="rounded-lg bg-raised border border-border p-3">
          <p className="text-xs text-secondary">
            Best-effort quality estimate:{" "}
            <span className="font-bold text-primary">
              {Math.round(
                (decision.bestEffortOutput.qualityEstimate ?? 0) * 100,
              )}
              %
            </span>
          </p>
        </div>
      )}

      {decision.escalationOption?.available === true && (
        <div className="rounded-lg bg-raised border border-border p-3">
          <p className="text-xs text-secondary">
            Escalate to{" "}
            <span className="font-medium text-primary">
              {decision.escalationOption.targetModel}
            </span>{" "}
            — additional cost:{" "}
            <span className="font-bold text-yellow-300">
              ${decision.escalationOption.additionalCostUsd}
            </span>
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("add_budget")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting === "add_budget" ? "Approving…" : "Approve & Escalate"}
        </button>
        <button
          onClick={() => handleAction("best_effort")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-raised disabled:opacity-50"
        >
          {submitting === "best_effort" ? "Accepting…" : "Use Best Effort"}
        </button>
        <button
          onClick={() => handleAction("cancel")}
          disabled={submitting !== null}
          className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-red-400 hover:bg-danger/10 disabled:opacity-50"
        >
          {submitting === "cancel" ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace TaskForm.tsx**

```tsx
// apps/dashboard/src/components/TaskForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBureauClient } from "@/lib/bureau-client";

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500";

export function TaskForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("");
  const [tier, setTier] = useState<"economy" | "standard" | "premium">(
    "standard",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const client = createBureauClient();
      const task = await client.submitTask({
        prompt: prompt.trim(),
        constraints: {
          ...(budget ? { maxCostUsd: budget } : {}),
          preferredModelTier: tier,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/tasks/${task.taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit task");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">
          Task Prompt <span className="text-danger">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          required
          placeholder="Describe the task you want the AI agents to complete…"
          className={`${inputCls} resize-none`}
        />
        <p className="mt-1 text-xs text-muted">{prompt.length} characters</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">
            Max Budget (USD, optional)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 0.50"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">
            Model Tier
          </label>
          <select
            value={tier}
            onChange={(e) =>
              setTier(e.target.value as "economy" | "standard" | "premium")
            }
            className={inputCls}
          >
            <option value="economy">Economy (faster, cheaper)</option>
            <option value="standard">Standard (balanced)</option>
            <option value="premium">Premium (best quality)</option>
          </select>
        </div>
      </div>

      {error !== null && (
        <div className="rounded-lg bg-danger/10 border border-danger/30 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !prompt.trim()}
        className="w-full rounded-lg bg-brand-500 px-6 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Submitting task…" : "Submit Task to Agents"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Replace tasks/new/page.tsx**

```tsx
// apps/dashboard/src/app/tasks/new/page.tsx
import { TaskForm } from "@/components/TaskForm";

export default function NewTaskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">New Task</h1>
        <p className="text-sm text-secondary mt-1">
          Submit a task to the multi-agent system
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <TaskForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/DecisionPanel.tsx apps/dashboard/src/components/TaskForm.tsx apps/dashboard/src/app/tasks/new/page.tsx
git commit -m "feat(dashboard): dark DecisionPanel, TaskForm, and new-task page"
```

---

## Task 13: Task Detail Page — Wire All Animation Components

**Files:**

- Modify: `apps/dashboard/src/app/tasks/[id]/page.tsx`

- [ ] **Step 1: Replace tasks/[id]/page.tsx**

```tsx
// apps/dashboard/src/app/tasks/[id]/page.tsx
"use client";
import { use, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { createBureauClient } from "@/lib/bureau-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { StageProgress } from "@/components/StageProgress";
import { DivisionCards } from "@/components/DivisionCards";
import { DecisionPanel } from "@/components/DecisionPanel";
import { TerminalLog } from "@/components/TerminalLog";
import { StageBadge } from "@/components/StageBadge";
import { StageOverlay } from "@/components/StageOverlay";
import { AgentThinkingDots } from "@/components/AgentThinkingDots";
import type { TaskEnvelope, DecisionAction } from "@bureau/sdk";

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: taskId } = use(params);
  const [task, setTask] = useState<TaskEnvelope | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    createBureauClient()
      .getTask(taskId)
      .then(setTask)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Not found"),
      );
  }, [taskId]);

  const stream = useTaskStream(taskId, streaming);

  const currentStage = stream.currentStage ?? task?.currentStage ?? null;
  const finalOutput = stream.finalOutput ?? task?.finalOutput ?? null;

  useEffect(() => {
    if (stream.done) setStreaming(false);
  }, [stream.done]);

  async function handleDecision(action: DecisionAction) {
    await createBureauClient().submitDecision(taskId, action);
  }

  async function handleCancel() {
    await createBureauClient().cancelTask(taskId);
    setStreaming(false);
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">Error: {loadError}</p>
      </div>
    );
  }

  if (!task) {
    return <div className="text-center py-12 text-secondary">Loading…</div>;
  }

  const isRunning = !stream.done && streaming;

  return (
    <>
      <StageOverlay currentStage={currentStage} />

      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">Task Detail</h1>
            <p className="text-xs font-mono text-muted mt-0.5">{taskId}</p>
          </div>
          <div className="flex items-center gap-3">
            {currentStage && <StageBadge stage={currentStage} />}
            {isRunning && (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-danger/10"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Agent thinking indicator */}
        {isRunning && stream.activeDivision !== null && <AgentThinkingDots />}

        {/* Stage progress */}
        {currentStage && (
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-secondary mb-4">
              Progress
            </h2>
            <StageProgress current={currentStage} />
          </div>
        )}

        {/* Decision panel */}
        {currentStage === "AwaitingUserDecision" && stream.pendingDecision && (
          <DecisionPanel
            taskId={taskId}
            decision={stream.pendingDecision}
            onSubmit={handleDecision}
          />
        )}

        {/* Division cards */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-secondary mb-4">
            Agent Divisions
            {isRunning && (
              <span className="ml-2 text-xs font-normal text-brand-400">
                ● live
              </span>
            )}
          </h2>
          <DivisionCards
            activeDivision={stream.activeDivision}
            divisionMessages={stream.divisionMessages}
          />
        </div>

        {/* Terminal log */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">
            System Log
          </h2>
          <TerminalLog events={stream.events} isStreaming={isRunning} />
        </div>

        {/* Final output */}
        {finalOutput && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-6">
            <h2 className="text-sm font-semibold text-green-300 mb-3">
              ✓ Final Output
            </h2>
            <div className="prose prose-sm prose-invert max-w-none text-primary/80">
              <ReactMarkdown>{finalOutput}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Error */}
        {stream.error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
            <p className="text-sm text-red-400">✗ {stream.error}</p>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/tasks/[id]/page.tsx
git commit -m "feat(dashboard): task detail dark UI with StageOverlay, TerminalLog, AgentThinkingDots"
```

---

## Task 14: Settings — ConnectionTab

**Files:**

- Create: `apps/dashboard/src/components/settings/ConnectionTab.tsx`

- [ ] **Step 1: Create ConnectionTab.tsx**

```tsx
// apps/dashboard/src/components/settings/ConnectionTab.tsx
"use client";
import { useState } from "react";
import type { Settings } from "@/hooks/useSettings";

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500";

interface ConnectionTabProps {
  settings: Settings;
  onSave: (s: Settings) => void;
}

export function ConnectionTab({ settings, onSave }: ConnectionTabProps) {
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">(
    "idle",
  );

  async function testConnection() {
    setStatus("testing");
    try {
      const res = await fetch(`${form.apiUrl}/health/ready`);
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
    setStatus("idle");
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-secondary mb-1">
          API Server URL
        </label>
        <input
          type="url"
          value={form.apiUrl}
          onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
          className={inputCls}
          placeholder="http://localhost:3001"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-secondary mb-1">
          API Key
        </label>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          className={inputCls}
          placeholder="bureau_live_..."
        />
        <p className="mt-1 text-xs text-muted">
          Requires <code className="text-brand-400">task:read</code> permission
          minimum. For API key management, also needs{" "}
          <code className="text-brand-400">keys:read</code> and{" "}
          <code className="text-brand-400">keys:write</code>.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          Save Settings
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={status === "testing"}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-primary hover:bg-raised disabled:opacity-50 transition-colors"
        >
          {status === "testing" ? "Testing…" : "Test Connection"}
        </button>
      </div>
      {status === "ok" && (
        <p className="text-sm text-success">✓ Connected successfully</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-400">
          ✗ Connection failed — check URL and API key
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/settings/ConnectionTab.tsx
git commit -m "feat(dashboard): ConnectionTab dark form"
```

---

## Task 15: Settings — ApiKeysTab

**Files:**

- Create: `apps/dashboard/src/components/settings/ApiKeysTab.tsx`

- [ ] **Step 1: Create ApiKeysTab.tsx**

```tsx
// apps/dashboard/src/components/settings/ApiKeysTab.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import { createBureauClient } from "@/lib/bureau-client";
import type { ApiKey, CreateApiKeyResult } from "@bureau/sdk";

const PERMISSIONS = [
  "task:read",
  "task:write",
  "keys:read",
  "keys:write",
  "provider-keys:write",
];

const inputCls =
  "w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500";

function fetcher(): Promise<ApiKey[]> {
  return createBureauClient().listApiKeys();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ApiKeysTab() {
  const {
    data: keys,
    error,
    mutate,
  } = useSWR<ApiKey[]>("api-keys", fetcher, {
    revalidateOnFocus: true,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([
    "task:read",
    "task:write",
  ]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Plaintext modal
  const [newKey, setNewKey] = useState<CreateApiKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || permissions.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createBureauClient().createApiKey({
        name: name.trim(),
        permissions,
        expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
      });
      setNewKey(result);
      setShowCreate(false);
      setName("");
      setExpiresInDays("");
      setPermissions(["task:read", "task:write"]);
      await mutate();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create key",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    setRevoking(keyId);
    try {
      await createBureauClient().revokeApiKey(keyId);
      await mutate();
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setNewKey(null);
    }, 1500);
  }

  function togglePermission(perm: string) {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger/10 border border-danger/30 p-4">
        <p className="text-sm text-red-400">
          Failed to load API keys — your current key may lack{" "}
          <code className="text-brand-400">keys:read</code> permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Plaintext modal */}
      {newKey !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-base font-bold text-primary">
              API Key Created
            </h3>
            <div className="rounded-lg bg-raised border border-border p-3">
              <p
                className="text-xs font-mono text-brand-400 break-all"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {newKey.plaintext}
              </p>
            </div>
            <p className="text-xs text-warning">
              ⚠ This key will not be shown again. Copy it now.
            </p>
            <button
              onClick={() => handleCopy(newKey.plaintext)}
              className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              {copied ? "✓ Copied!" : "Copy to Clipboard"}
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm text-secondary hover:text-primary"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-secondary">API Keys</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
        >
          {showCreate ? "Cancel" : "+ Create New Key"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-raised p-4 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Key Name <span className="text-danger">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. production-app"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-2">
              Permissions <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PERMISSIONS.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={() => togglePermission(p)}
                    className="rounded border-border bg-raised accent-brand-500"
                  />
                  <span className="text-xs font-mono text-secondary">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Expires In Days (optional)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="e.g. 90"
              className={inputCls}
            />
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || permissions.length === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Key"}
          </button>
        </form>
      )}

      {/* Keys table */}
      {!keys && !error && (
        <p className="text-sm text-secondary">Loading keys…</p>
      )}
      {keys && keys.length === 0 && (
        <p className="text-sm text-muted">No API keys yet.</p>
      )}
      {keys && keys.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-raised">
              <tr>
                {["Name", "Prefix", "Permissions", "Created", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {keys.map((key) => (
                <tr key={key.keyId}>
                  <td className="px-3 py-2.5 text-xs text-primary">
                    {key.name}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-secondary">
                    {key.keyPrefix}…
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {key.permissions.join(", ")}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    {timeAgo(key.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleRevoke(key.keyId)}
                      disabled={revoking === key.keyId}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {revoking === key.keyId ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/settings/ApiKeysTab.tsx
git commit -m "feat(dashboard): ApiKeysTab with create/list/revoke + plaintext modal"
```

---

## Task 16: Settings — ProviderKeysTab

**Files:**

- Create: `apps/dashboard/src/components/settings/ProviderKeysTab.tsx`

- [ ] **Step 1: Create ProviderKeysTab.tsx**

```tsx
// apps/dashboard/src/components/settings/ProviderKeysTab.tsx
"use client";
import { useState, useEffect } from "react";
import { createBureauClient } from "@/lib/bureau-client";

type Provider =
  | "anthropic"
  | "google"
  | "openai"
  | "deepseek"
  | "mistral"
  | "qwen";

interface ProviderConfig {
  id: Provider;
  label: string;
  placeholder: string;
  icon: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    icon: "🤖",
  },
  { id: "google", label: "Google Gemini", placeholder: "AIza...", icon: "🔷" },
  { id: "openai", label: "OpenAI", placeholder: "sk-...", icon: "🟢" },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-...", icon: "🔵" },
  { id: "mistral", label: "Mistral", placeholder: "...", icon: "🔸" },
  { id: "qwen", label: "Qwen", placeholder: "...", icon: "🟠" },
];

type ProviderStatus = Record<
  Provider,
  { stored: boolean; preview: string | null }
>;

const STORAGE_KEY = "bureau_provider_keys_status";

function loadStatus(): ProviderStatus {
  if (typeof window === "undefined") {
    return Object.fromEntries(
      PROVIDERS.map((p) => [p.id, { stored: false, preview: null }]),
    ) as ProviderStatus;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderStatus;
  } catch {
    // ignore
  }
  return Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { stored: false, preview: null }]),
  ) as ProviderStatus;
}

function saveStatus(status: ProviderStatus) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

export function ProviderKeysTab() {
  const [status, setStatus] = useState<ProviderStatus>(loadStatus);
  const [inputs, setInputs] = useState<Partial<Record<Provider, string>>>({});
  const [saving, setSaving] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Provider, string>>>({});

  useEffect(() => {
    setStatus(loadStatus());
  }, []);

  async function handleSave(provider: Provider) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving(provider);
    setErrors((prev) => ({ ...prev, [provider]: undefined }));
    try {
      await createBureauClient().storeProviderKey(provider, key);
      const preview = key.slice(-4);
      const next: ProviderStatus = {
        ...status,
        [provider]: { stored: true, preview },
      };
      setStatus(next);
      saveStatus(next);
      setInputs((prev) => ({ ...prev, [provider]: "" }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [provider]: err instanceof Error ? err.message : "Failed to store key",
      }));
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(provider: Provider) {
    if (!confirm(`Remove ${provider} key? It will be deleted from the server.`))
      return;
    setRemoving(provider);
    try {
      await createBureauClient().removeProviderKey(provider);
      const next: ProviderStatus = {
        ...status,
        [provider]: { stored: false, preview: null },
      };
      setStatus(next);
      saveStatus(next);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [provider]: err instanceof Error ? err.message : "Failed to remove key",
      }));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-3 max-w-lg">
      <p className="text-xs text-muted mb-4">
        Provider keys are encrypted server-side (AES-256-GCM). They cannot be
        retrieved after storage.
      </p>
      {PROVIDERS.map(({ id, label, placeholder, icon }) => {
        const s = status[id];
        const inputValue = inputs[id] ?? "";
        const isSaving = saving === id;
        const isRemoving = removing === id;
        const errMsg = errors[id];

        return (
          <div
            key={id}
            className="rounded-xl border border-border bg-surface p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className="text-sm font-medium text-primary">
                  {label}
                </span>
              </div>
              {s.stored ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">
                    ••••{s.preview}
                  </span>
                  <button
                    onClick={() => handleRemove(id)}
                    disabled={isRemoving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {isRemoving ? "Removing…" : "Remove"}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted">Not stored</span>
              )}
            </div>

            {!s.stored && (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [id]: e.target.value }))
                  }
                  placeholder={placeholder}
                  className="flex-1 rounded-lg border border-border bg-raised px-3 py-1.5 text-xs text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  onClick={() => handleSave(id)}
                  disabled={isSaving || !inputValue.trim()}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Add Key"}
                </button>
              </div>
            )}

            {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/settings/ProviderKeysTab.tsx
git commit -m "feat(dashboard): ProviderKeysTab with localStorage status + encrypted key storage"
```

---

## Task 17: Settings Page — Tab Layout

**Files:**

- Modify: `apps/dashboard/src/app/settings/page.tsx`

- [ ] **Step 1: Replace settings/page.tsx**

```tsx
// apps/dashboard/src/app/settings/page.tsx
"use client";
import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { ConnectionTab } from "@/components/settings/ConnectionTab";
import { ApiKeysTab } from "@/components/settings/ApiKeysTab";
import { ProviderKeysTab } from "@/components/settings/ProviderKeysTab";

type Tab = "connection" | "api-keys" | "provider-keys";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "api-keys", label: "API Keys" },
  { id: "provider-keys", label: "Provider Keys" },
];

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>("connection");

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "connection" && (
          <ConnectionTab settings={settings} onSave={save} />
        )}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "provider-keys" && <ProviderKeysTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: `0 errors`

- [ ] **Step 3: Full build check**

```bash
cd apps/dashboard && pnpm build
```

Expected: Build completes with route table showing all pages. No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/settings/page.tsx
git commit -m "feat(dashboard): Settings tab layout (Connection | API Keys | Provider Keys)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                                                           | Task    |
| ------------------------------------------------------------------------------------------ | ------- |
| Dark mode tokens (base, surface, raised, border, brand, success, warning, danger, running) | Task 1  |
| JetBrains Mono + CSS keyframes                                                             | Task 1  |
| Sidebar dark + health dot                                                                  | Task 2  |
| StageBadge dark colors                                                                     | Task 3  |
| MetricsRow (total, running, completed, success rate)                                       | Task 4  |
| TaskList dark + filter pills                                                               | Task 5  |
| Home page dark heading                                                                     | Task 6  |
| StageProgress horizontal shimmer bar                                                       | Task 7  |
| AgentThinkingDots ◈◈◈                                                                      | Task 8  |
| StageOverlay fullscreen transition                                                         | Task 9  |
| TerminalLog terminal-style + auto-scroll                                                   | Task 10 |
| DivisionCards glow + scan line + typing + progress                                         | Task 11 |
| DecisionPanel dark                                                                         | Task 12 |
| TaskForm dark                                                                              | Task 12 |
| New task page dark                                                                         | Task 12 |
| Task detail wires all animation components                                                 | Task 13 |
| ConnectionTab extracted                                                                    | Task 14 |
| ApiKeysTab create/list/revoke                                                              | Task 15 |
| ProviderKeysTab store/remove                                                               | Task 16 |
| Settings tab layout                                                                        | Task 17 |

All spec requirements covered.

**Type consistency check:**

- `MetricsRow` receives `tasks: TaskEnvelope[]` ✓
- `TerminalLog` receives `events: BureauSSEEvent[], isStreaming: boolean` ✓
- `StageOverlay` receives `currentStage: TaskStage | null` ✓
- `AgentThinkingDots` has no props ✓
- `ConnectionTab` receives `settings: Settings, onSave: (s: Settings) => void` ✓
- `ApiKeysTab` / `ProviderKeysTab` have no props ✓
- `DivisionCard` (internal) receives `id, label, icon, desc, isActive, message` ✓
- `useTypingText` takes `string, speed?: number` returns `string` ✓

**Placeholder scan:** No TBD, no TODO. Every step has code. ✓
