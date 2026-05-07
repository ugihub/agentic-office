# Dashboard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 dashboard at `apps/dashboard/` that lets users submit tasks, watch agent divisions work in real-time via SSE, and respond to escalations — all connected to the existing Fastify API via `@bureau/sdk`.

**Architecture:** Next.js 15 App Router (client components for SSE/localStorage), Tailwind CSS for styling, `@bureau/sdk` workspace package for all API calls. API key and server URL stored in localStorage (settings page), overrideable via env vars. SSE streaming via `BureauClient.streamTask()` inside a `useEffect` with `AbortController` for cleanup.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 3.4, SWR 2.x, react-markdown, `@bureau/sdk` (workspace:\*)

---

## File Map

```
apps/dashboard/
├── package.json                        CREATE — workspace package config
├── next.config.ts                      CREATE — transpilePackages for @bureau/sdk
├── tsconfig.json                       CREATE — extends base, Next.js paths
├── tailwind.config.ts                  CREATE — Tailwind config
├── postcss.config.mjs                  CREATE — PostCSS config
├── .env.local.example                  CREATE — env template
├── src/
│   ├── app/
│   │   ├── layout.tsx                  CREATE — root layout + sidebar
│   │   ├── page.tsx                    CREATE — home: task list
│   │   ├── globals.css                 CREATE — Tailwind directives + base styles
│   │   ├── tasks/
│   │   │   ├── new/
│   │   │   │   └── page.tsx            CREATE — submit task form
│   │   │   └── [id]/
│   │   │       └── page.tsx            CREATE — task detail realtime
│   │   └── settings/
│   │       └── page.tsx                CREATE — API key + URL config
│   ├── lib/
│   │   └── bureau-client.ts            CREATE — SDK wrapper (reads localStorage)
│   ├── hooks/
│   │   ├── useTaskStream.ts            CREATE — SSE consumer (AsyncGenerator → state)
│   │   └── useSettings.ts             CREATE — localStorage settings hook
│   └── components/
│       ├── Sidebar.tsx                 CREATE — navigation sidebar
│       ├── StageBadge.tsx              CREATE — colored stage badge
│       ├── StageProgress.tsx           CREATE — horizontal step progress
│       ├── DivisionCards.tsx           CREATE — 8 agent division cards
│       ├── DecisionPanel.tsx           CREATE — AwaitingUserDecision UI
│       ├── TaskList.tsx                CREATE — table of tasks with SWR
│       ├── TaskForm.tsx                CREATE — submit form
│       └── EventLog.tsx                CREATE — scrollable SSE event log
```

---

## Task 1: Scaffold package.json and Next.js config

**Files:**

- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/next.config.ts`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/.env.local.example`

- [ ] **Step 1: Create `apps/dashboard/package.json`**

```json
{
  "name": "@bureau/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@bureau/sdk": "workspace:*",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0",
    "swr": "^2.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/dashboard/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@bureau/sdk"],
};

export default nextConfig;
```

- [ ] **Step 3: Create `apps/dashboard/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "composite": false,
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/dashboard/.env.local.example`**

```
NEXT_PUBLIC_BUREAU_API_URL=http://localhost:3001
NEXT_PUBLIC_BUREAU_API_KEY=bureau_live_your_key_here
```

- [ ] **Step 5: Install dependencies**

```bash
cd apps/dashboard
pnpm install
```

Expected: dependencies installed, `node_modules` populated.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/next.config.ts apps/dashboard/tsconfig.json apps/dashboard/.env.local.example
git commit -m "feat(dashboard): scaffold Next.js 15 app package"
```

---

## Task 2: Tailwind CSS + global styles

**Files:**

- Create: `apps/dashboard/tailwind.config.ts`
- Create: `apps/dashboard/postcss.config.mjs`
- Create: `apps/dashboard/src/app/globals.css`

- [ ] **Step 1: Create `apps/dashboard/tailwind.config.ts`**

```typescript
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
        brand: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Create `apps/dashboard/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 3: Create `apps/dashboard/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900 antialiased;
  }
}

@layer utilities {
  .pulse-active {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/tailwind.config.ts apps/dashboard/postcss.config.mjs apps/dashboard/src/app/globals.css
git commit -m "feat(dashboard): add Tailwind CSS config and global styles"
```

---

## Task 3: SDK wrapper + settings hook

**Files:**

- Create: `apps/dashboard/src/lib/bureau-client.ts`
- Create: `apps/dashboard/src/hooks/useSettings.ts`

- [ ] **Step 1: Create `apps/dashboard/src/lib/bureau-client.ts`**

```typescript
import { BureauClient } from "@bureau/sdk";

export function getSettings(): { apiUrl: string; apiKey: string } {
  const defaultUrl =
    process.env["NEXT_PUBLIC_BUREAU_API_URL"] ?? "http://localhost:3001";
  const defaultKey = process.env["NEXT_PUBLIC_BUREAU_API_KEY"] ?? "";

  if (typeof window === "undefined") {
    return { apiUrl: defaultUrl, apiKey: defaultKey };
  }

  return {
    apiUrl: localStorage.getItem("bureau_api_url") ?? defaultUrl,
    apiKey: localStorage.getItem("bureau_api_key") ?? defaultKey,
  };
}

export function createBureauClient(): BureauClient {
  const { apiUrl, apiKey } = getSettings();
  return new BureauClient({ baseUrl: apiUrl, apiKey });
}
```

- [ ] **Step 2: Create `apps/dashboard/src/hooks/useSettings.ts`**

```typescript
"use client";
import { useState, useEffect } from "react";

export interface Settings {
  apiUrl: string;
  apiKey: string;
}

const DEFAULTS: Settings = {
  apiUrl: process.env["NEXT_PUBLIC_BUREAU_API_URL"] ?? "http://localhost:3001",
  apiKey: process.env["NEXT_PUBLIC_BUREAU_API_KEY"] ?? "",
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setSettings({
      apiUrl: localStorage.getItem("bureau_api_url") ?? DEFAULTS.apiUrl,
      apiKey: localStorage.getItem("bureau_api_key") ?? DEFAULTS.apiKey,
    });
  }, []);

  function save(next: Settings) {
    localStorage.setItem("bureau_api_url", next.apiUrl);
    localStorage.setItem("bureau_api_key", next.apiKey);
    setSettings(next);
  }

  return { settings, save };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/ apps/dashboard/src/hooks/useSettings.ts
git commit -m "feat(dashboard): add SDK wrapper and settings hook"
```

---

## Task 4: Sidebar + root layout

**Files:**

- Create: `apps/dashboard/src/components/Sidebar.tsx`
- Create: `apps/dashboard/src/app/layout.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/Sidebar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "⊞" },
  { href: "/tasks/new", label: "New Task", icon: "＋" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <span className="text-lg font-bold text-brand-700">
          🏢 Agentic Office
        </span>
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
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-4">
        <p className="text-xs text-gray-400">Multi-Agent AI Platform</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `apps/dashboard/src/app/layout.tsx`**

```tsx
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
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/Sidebar.tsx apps/dashboard/src/app/layout.tsx
git commit -m "feat(dashboard): add sidebar and root layout"
```

---

## Task 5: Settings page

**Files:**

- Create: `apps/dashboard/src/app/settings/page.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/app/settings/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { createBureauClient } from "@/lib/bureau-client";

export default function SettingsPage() {
  const { settings, save } = useSettings();
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
    save(form);
    setStatus("idle");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Server URL
          </label>
          <input
            type="url"
            value={form.apiUrl}
            onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="http://localhost:3001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="bureau_live_..."
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={status === "testing"}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {status === "testing" ? "Testing…" : "Test Connection"}
          </button>
        </div>
        {status === "ok" && (
          <p className="text-sm text-green-600">✓ Connected successfully</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red-600">
            ✗ Connection failed — check URL and API key
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/app/settings/
git commit -m "feat(dashboard): add settings page with connection test"
```

---

## Task 6: StageBadge + StageProgress components

**Files:**

- Create: `apps/dashboard/src/components/StageBadge.tsx`
- Create: `apps/dashboard/src/components/StageProgress.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/StageBadge.tsx`**

```tsx
import type { TaskStage } from "@bureau/sdk";

const STAGE_STYLES: Record<TaskStage, string> = {
  Submitted: "bg-gray-100 text-gray-700",
  Preparing: "bg-blue-100 text-blue-700",
  Researching: "bg-indigo-100 text-indigo-700",
  Producing: "bg-purple-100 text-purple-700",
  Reviewing: "bg-yellow-100 text-yellow-700",
  Formatting: "bg-orange-100 text-orange-700",
  AwaitingUserDecision: "bg-amber-100 text-amber-800 animate-pulse",
  Completed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

export function StageBadge({ stage }: { stage: TaskStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}
    >
      {stage}
    </span>
  );
}
```

- [ ] **Step 2: Create `apps/dashboard/src/components/StageProgress.tsx`**

```tsx
import type { TaskStage } from "@bureau/sdk";

const STAGES: TaskStage[] = [
  "Submitted",
  "Preparing",
  "Researching",
  "Producing",
  "Reviewing",
  "Formatting",
  "Completed",
];

const STAGE_INDEX: Partial<Record<TaskStage, number>> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
);

export function StageProgress({ current }: { current: TaskStage }) {
  const currentIdx = STAGE_INDEX[current] ?? -1;

  return (
    <div className="w-full">
      <div className="flex items-center">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const pending = idx > currentIdx;

          return (
            <div key={stage} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    done
                      ? "bg-green-500 border-green-500 text-white"
                      : active
                        ? "bg-brand-600 border-brand-600 text-white scale-110"
                        : "bg-white border-gray-300 text-gray-400"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                <span
                  className={`mt-1 text-xs font-medium ${
                    active
                      ? "text-brand-700"
                      : done
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {stage}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1 transition-colors ${
                    done ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {current === "AwaitingUserDecision" && (
        <p className="mt-3 text-center text-sm font-medium text-amber-600">
          ⚠ Agent requires your decision before continuing
        </p>
      )}
      {current === "Failed" && (
        <p className="mt-3 text-center text-sm font-medium text-red-600">
          ✗ Task failed
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/StageBadge.tsx apps/dashboard/src/components/StageProgress.tsx
git commit -m "feat(dashboard): add StageBadge and StageProgress components"
```

---

## Task 7: DivisionCards component

**Files:**

- Create: `apps/dashboard/src/components/DivisionCards.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/DivisionCards.tsx`**

```tsx
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
            className={`rounded-xl border p-3 transition-all ${
              isActive
                ? "border-brand-400 bg-brand-50 shadow-md ring-1 ring-brand-400"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{icon}</span>
              <div>
                <p
                  className={`text-sm font-semibold ${isActive ? "text-brand-700" : "text-gray-800"}`}
                >
                  {label}
                  {isActive && (
                    <span className="ml-1 inline-block h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                  )}
                </p>
                <p className="text-xs text-gray-400">{desc}</p>
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/DivisionCards.tsx
git commit -m "feat(dashboard): add DivisionCards with active pulse animation"
```

---

## Task 8: DecisionPanel + EventLog components

**Files:**

- Create: `apps/dashboard/src/components/DecisionPanel.tsx`
- Create: `apps/dashboard/src/components/EventLog.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/DecisionPanel.tsx`**

```tsx
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
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-amber-900">
            ⚠ Decision Required
          </h3>
          <p className="mt-1 text-sm text-amber-800">{decision.reason}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-amber-600">Expires in</p>
          <p className="text-2xl font-mono font-bold text-amber-800">
            {minutes}:{String(seconds).padStart(2, "0")}
          </p>
        </div>
      </div>

      {decision.bestEffortOutput?.available && (
        <div className="rounded-lg bg-white border border-amber-200 p-3">
          <p className="text-xs font-medium text-gray-500">
            Best-effort quality estimate:{" "}
            <span className="font-bold text-amber-700">
              {Math.round(
                (decision.bestEffortOutput.qualityEstimate ?? 0) * 100,
              )}
              %
            </span>
          </p>
        </div>
      )}

      {decision.escalationOption?.available && (
        <div className="rounded-lg bg-white border border-amber-200 p-3">
          <p className="text-xs text-gray-500">
            Escalate to{" "}
            <span className="font-medium">
              {decision.escalationOption.targetModel}
            </span>{" "}
            — additional cost:{" "}
            <span className="font-bold text-gray-800">
              ${decision.escalationOption.additionalCostUsd}
            </span>
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("add_budget")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting === "add_budget" ? "Approving…" : "Approve & Escalate"}
        </button>
        <button
          onClick={() => handleAction("best_effort")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {submitting === "best_effort" ? "Accepting…" : "Use Best Effort"}
        </button>
        <button
          onClick={() => handleAction("cancel")}
          disabled={submitting !== null}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {submitting === "cancel" ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/dashboard/src/components/EventLog.tsx`**

```tsx
import type { BureauSSEEvent } from "@bureau/sdk";

interface Props {
  events: BureauSSEEvent[];
}

function formatEvent(e: BureauSSEEvent): string {
  switch (e.event) {
    case "task.stage.changed":
      return `Stage: ${e.from} → ${e.to}`;
    case "division.progress":
      return `[${e.division}] ${(e as { message?: string }).message ?? "working…"}`;
    case "decision_required":
      return `Decision required: ${e.pendingDecision.reason}`;
    case "task.completed":
      return "Task completed";
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/DecisionPanel.tsx apps/dashboard/src/components/EventLog.tsx
git commit -m "feat(dashboard): add DecisionPanel with countdown and EventLog"
```

---

## Task 9: useTaskStream hook

**Files:**

- Create: `apps/dashboard/src/hooks/useTaskStream.ts`

- [ ] **Step 1: Create `apps/dashboard/src/hooks/useTaskStream.ts`**

```typescript
"use client";
import { useEffect, useState, useRef } from "react";
import type { BureauSSEEvent, TaskStage, PendingDecision } from "@bureau/sdk";
import { createBureauClient } from "@/lib/bureau-client";

export interface StreamState {
  events: BureauSSEEvent[];
  currentStage: TaskStage | null;
  activeDivision: string | null;
  divisionMessages: Record<string, string>;
  pendingDecision: PendingDecision | null;
  finalOutput: string | null;
  error: string | null;
  done: boolean;
}

const INITIAL: StreamState = {
  events: [],
  currentStage: null,
  activeDivision: null,
  divisionMessages: {},
  pendingDecision: null,
  finalOutput: null,
  error: null,
  done: false,
};

export function useTaskStream(taskId: string, active: boolean): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) return;
    setState(INITIAL);

    const controller = new AbortController();
    abortRef.current = controller;
    const client = createBureauClient();

    async function run() {
      try {
        for await (const event of client.streamTask(
          taskId,
          controller.signal,
        )) {
          setState((prev) => {
            const next: StreamState = {
              ...prev,
              events: [...prev.events, event],
            };

            if (event.event === "task.stage.changed") {
              next.currentStage = event.to;
              if (event.to !== "AwaitingUserDecision") {
                next.pendingDecision = null;
              }
            }

            if (event.event === "division.progress") {
              next.activeDivision = event.division;
              const msg = (event as { message?: string }).message;
              if (msg) {
                next.divisionMessages = {
                  ...prev.divisionMessages,
                  [event.division]: msg,
                };
              }
            }

            if (event.event === "decision_required") {
              next.pendingDecision = event.pendingDecision;
            }

            if (event.event === "task.completed") {
              next.finalOutput = event.output;
              next.done = true;
              next.activeDivision = null;
            }

            if (event.event === "task.failed") {
              next.error = event.reason;
              next.done = true;
              next.activeDivision = null;
            }

            return next;
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Stream error",
          done: true,
        }));
      }
    }

    void run();
    return () => {
      controller.abort();
    };
  }, [taskId, active]);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/hooks/useTaskStream.ts
git commit -m "feat(dashboard): add useTaskStream hook for SSE consumption"
```

---

## Task 10: TaskList component + home page

**Files:**

- Create: `apps/dashboard/src/components/TaskList.tsx`
- Create: `apps/dashboard/src/app/page.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/TaskList.tsx`**

```tsx
"use client";
import useSWR from "swr";
import Link from "next/link";
import { createBureauClient } from "@/lib/bureau-client";
import { StageBadge } from "@/components/StageBadge";
import type { TaskEnvelope } from "@bureau/sdk";

function fetcher() {
  return createBureauClient().listTasks({ limit: 50 });
}

export function TaskList() {
  const {
    data: tasks,
    error,
    isLoading,
  } = useSWR<TaskEnvelope[]>("tasks", fetcher, { refreshInterval: 5000 });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-400">Loading tasks…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-600">
          Failed to load tasks — check Settings → API connection.
        </p>
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">No tasks yet.</p>
        <Link
          href="/tasks/new"
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Submit your first task
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Task ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Path
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cost
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => (
            <tr
              key={task.taskId}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => {
                window.location.href = `/tasks/${task.taskId}`;
              }}
            >
              <td className="px-4 py-3 text-xs font-mono text-gray-600">
                {task.taskId.slice(0, 16)}…
              </td>
              <td className="px-4 py-3">
                <StageBadge stage={task.currentStage} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {task.executionPath}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {task.costUsd ? `$${task.costUsd}` : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(task.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/dashboard/src/app/page.tsx`**

```tsx
import Link from "next/link";
import { TaskList } from "@/components/TaskList";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Multi-agent AI task management
          </p>
        </div>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <span>＋</span> New Task
        </Link>
      </div>
      <TaskList />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/TaskList.tsx apps/dashboard/src/app/page.tsx
git commit -m "feat(dashboard): add TaskList with SWR polling and home page"
```

---

## Task 11: TaskForm + submit page

**Files:**

- Create: `apps/dashboard/src/components/TaskForm.tsx`
- Create: `apps/dashboard/src/app/tasks/new/page.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/components/TaskForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBureauClient } from "@/lib/bureau-client";

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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Task Prompt <span className="text-red-500">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          required
          placeholder="Describe the task you want the AI agents to complete…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        <p className="mt-1 text-xs text-gray-400">{prompt.length} characters</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Budget (USD, optional)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 0.50"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model Tier
          </label>
          <select
            value={tier}
            onChange={(e) =>
              setTier(e.target.value as "economy" | "standard" | "premium")
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="economy">Economy (faster, cheaper)</option>
            <option value="standard">Standard (balanced)</option>
            <option value="premium">Premium (best quality)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !prompt.trim()}
        className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting task…" : "Submit Task to Agents"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `apps/dashboard/src/app/tasks/new/page.tsx`**

```tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/TaskForm.tsx apps/dashboard/src/app/tasks/new/
git commit -m "feat(dashboard): add TaskForm with budget/tier and submit page"
```

---

## Task 12: Task detail page (realtime)

**Files:**

- Create: `apps/dashboard/src/app/tasks/[id]/page.tsx`

- [ ] **Step 1: Create `apps/dashboard/src/app/tasks/[id]/page.tsx`**

```tsx
"use client";
import { use, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { createBureauClient } from "@/lib/bureau-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { StageProgress } from "@/components/StageProgress";
import { DivisionCards } from "@/components/DivisionCards";
import { DecisionPanel } from "@/components/DecisionPanel";
import { EventLog } from "@/components/EventLog";
import { StageBadge } from "@/components/StageBadge";
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

  // Load initial task state
  useEffect(() => {
    createBureauClient()
      .getTask(taskId)
      .then(setTask)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Not found"),
      );
  }, [taskId]);

  const stream = useTaskStream(taskId, streaming);

  // Merge stream state into displayed stage
  const currentStage = stream.currentStage ?? task?.currentStage ?? null;
  const finalOutput = stream.finalOutput ?? task?.finalOutput ?? null;

  // Stop streaming once done
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
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-600">Error: {loadError}</p>
      </div>
    );
  }

  if (!task) {
    return <div className="text-center py-12 text-gray-400">Loading…</div>;
  }

  const isRunning = !stream.done && streaming;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Task Detail</h1>
          <p className="text-xs font-mono text-gray-400 mt-0.5">{taskId}</p>
        </div>
        <div className="flex items-center gap-3">
          {currentStage && <StageBadge stage={currentStage} />}
          {isRunning && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Stage progress */}
      {currentStage && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Progress</h2>
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
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Agent Divisions
          {isRunning && (
            <span className="ml-2 text-xs font-normal text-brand-500">
              ● live
            </span>
          )}
        </h2>
        <DivisionCards
          activeDivision={stream.activeDivision}
          divisionMessages={stream.divisionMessages}
        />
      </div>

      {/* Event log */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Event Log</h2>
        <EventLog events={stream.events} />
      </div>

      {/* Final output */}
      {finalOutput && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h2 className="text-sm font-semibold text-green-800 mb-3">
            ✓ Final Output
          </h2>
          <div className="prose prose-sm max-w-none text-gray-800">
            <ReactMarkdown>{finalOutput}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Stream error */}
      {stream.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">✗ {stream.error}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Check SDK has `getTask` method**

The SDK's `BureauClient` may expose `getTask` or `getTaskStatus`. Check `pillars/sdk/src/client.ts`. If it only has `getTaskStatus`, replace `getTask(taskId)` with `getTaskStatus(taskId)` and adjust the type to `TaskStatus` (import from `@bureau/sdk`).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/app/tasks/
git commit -m "feat(dashboard): add realtime task detail page with SSE stream"
```

---

## Task 13: Wire into Turbo + final integration

**Files:**

- Modify: `apps/dashboard/package.json` — already has scripts
- No turbo.json changes needed (turbo picks up `dev` script automatically)

- [ ] **Step 1: Install and verify the dashboard builds**

```bash
cd apps/dashboard
pnpm install
pnpm run build
```

Expected: Next.js build succeeds with no TypeScript errors.

- [ ] **Step 2: Run dev server**

```bash
pnpm --filter "@bureau/dashboard" dev
```

Expected: dashboard running at `http://localhost:3000`

- [ ] **Step 3: Verify API connection in Settings**

Open `http://localhost:3000/settings`, enter `http://localhost:3001` as API URL, click "Test Connection". Expected: "Connected successfully".

- [ ] **Step 4: Commit package lock**

```bash
git add pnpm-lock.yaml
git commit -m "feat(dashboard): complete Next.js dashboard with realtime agent monitoring"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement             | Task                                |
| ---------------------------- | ----------------------------------- |
| Next.js 15 App Router        | Task 1                              |
| Tailwind CSS                 | Task 2                              |
| `@bureau/sdk` workspace      | Task 1 (transpilePackages) + Task 3 |
| `/` — task list with SWR     | Task 10                             |
| `/tasks/new` — submit form   | Task 11                             |
| `/tasks/[id]` — realtime SSE | Task 9 + Task 12                    |
| `/settings` — API key + URL  | Task 5                              |
| StageProgress component      | Task 6                              |
| DivisionCards with pulse     | Task 7                              |
| DecisionPanel with timer     | Task 8                              |
| EventLog                     | Task 8                              |
| StageBadge                   | Task 6                              |
| Cancel button                | Task 12                             |
| LocalStorage settings        | Task 3 + Task 5                     |

**Placeholder scan:** No TBD/TODO present. All code blocks complete.

**Type consistency:** `TaskStage`, `PendingDecision`, `DecisionAction`, `BureauSSEEvent`, `TaskEnvelope` — all imported from `@bureau/sdk` consistently throughout. `createBureauClient()` called consistently from `@/lib/bureau-client`.

**Edge case noted in Task 12, Step 2:** SDK may expose `getTaskStatus` rather than `getTask` — check at implementation time and adjust import accordingly.
