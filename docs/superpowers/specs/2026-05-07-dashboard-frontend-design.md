# Dashboard Frontend Design

**Date:** 2026-05-07
**Status:** Approved

## Overview

Build a web dashboard for Agentic Office that lets users submit tasks, watch agent divisions work in real-time, and respond to escalations. Connects to the existing Fastify API via `@bureau/sdk`.

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Data fetching:** native `fetch` + SWR for polling + native `EventSource` for SSE
- **SDK:** `@bureau/sdk` (workspace package, already built)
- **Location:** `apps/dashboard/`

## Pages & Routes

| Route         | Purpose                                  |
| ------------- | ---------------------------------------- |
| `/`           | Dashboard home — task list + quick stats |
| `/tasks/new`  | Submit task form                         |
| `/tasks/[id]` | Real-time task detail with SSE stream    |
| `/settings`   | API key + server URL configuration       |

## Key Components

### TaskForm

- Textarea for prompt (required)
- Budget field (optional, IDR)
- Model tier selector: economy / standard / premium
- Submit button with loading state
- Idempotency key auto-generated (UUID)

### TaskList

- Table of recent tasks (taskId, stage badge, cost, created time)
- Color-coded stage badges
- Row click → navigate to `/tasks/[id]`
- Auto-refresh every 5s via SWR

### TaskDetail (real-time)

- Stage progress bar: Submitted → Preparing → Researching → Producing → Reviewing → Formatting → Completed
- Division activity cards (CEO, HR, Finance, Compliance, Production, QA, Marketing) — highlights active division
- SSE event log (raw event feed)
- Final output rendered as Markdown when Completed
- Cancel button (while running)

### DecisionPanel

- Appears when stage = `AwaitingUserDecision`
- Shows: reason, best-effort output preview, escalation cost
- Three action buttons: Approve / Use Best Effort / Cancel
- Countdown timer to expiry

### SettingsPage

- `BUREAU_API_URL` input (default: http://localhost:3001)
- `BUREAU_API_KEY` input (masked)
- Saved to `localStorage`
- Test connection button → hits `/health/ready`

## Data Flow

```
User fills TaskForm
  → POST /tasks (via BureauClient)
  → redirect to /tasks/[id]
  → GET /tasks/:id/stream (SSE EventSource)
  → events update stage progress + division cards
  → if AwaitingUserDecision → show DecisionPanel
  → POST /tasks/:id/decision (approve/best_effort/cancel)
  → SSE continues until Completed/Failed
```

## Configuration

Environment variables in `apps/dashboard/.env.local`:

```
NEXT_PUBLIC_BUREAU_API_URL=http://localhost:3001
NEXT_PUBLIC_BUREAU_API_KEY=bureau_live_...
```

Settings page overrides these with localStorage values.

## Visual Design

- Professional light theme (corporate feel matching "Office" brand)
- Sidebar navigation (Tasks, New Task, Settings)
- Stage progress as horizontal step indicator
- Division cards in a grid (8 cards), pulse animation on active division
- Stage badges: gray=pending, blue=running, green=completed, red=failed, yellow=awaiting

## Constraints

- No server-side auth (API key handled client-side for simulation/demo)
- SSE connection via `EventSource` (browser native, no library)
- No database — all state from API
- `@bureau/sdk` used directly from workspace (not npm install)

## Out of Scope

- User login/auth
- Multi-tenant UI
- Mobile responsive (desktop-first for demo)
- Cost analytics charts
