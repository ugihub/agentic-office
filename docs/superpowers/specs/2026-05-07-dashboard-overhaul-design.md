# Dashboard Overhaul — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Scope:** `apps/dashboard` — UI layer only. No changes to hooks, lib, or SDK.

---

## 1. Goals

After this implementation:

- Dashboard runs full dark mode enterprise theme (Vercel/Linear style)
- API Key management fully functional (create, list, revoke) via Settings tab
- LLM Provider key management functional (store, remove) via Settings tab
- Dashboard home shows live metrics (total tasks, running, cost today, success rate)
- Task detail has dramatic agentic animations (terminal log, division glow, stage overlay)

## 2. Non-Goals

- No changes to `useTaskStream`, `useSettings`, `bureau-client.ts`
- No new backend routes
- No authentication flow changes
- No E2E tests in this sprint

---

## 3. Theme & Design Tokens

**Tailwind config** — extend colors:

```ts
// tailwind.config.ts
colors: {
  base:    '#080808',   // body background
  surface: '#111111',   // cards, sidebar
  raised:  '#1a1a1a',   // inputs, hover
  border:  '#262626',   // all borders
  primary: '#ededed',   // primary text
  secondary:'#888888',  // secondary text
  muted:   '#555555',   // disabled/muted text
  brand: {
    400: '#60a5fa',
    500: '#3b82f6',
    glow: 'rgba(59,130,246,0.15)',
  },
  success: '#10b981',
  warning: '#f59e0b',
  error:   '#ef4444',
  running: '#8b5cf6',   // purple for AI active state
}
```

**Typography:**

- Body: Inter (system stack)
- Monospace (terminal log): JetBrains Mono via Google Fonts (added to `globals.css`)

**globals.css base:**

```css
body {
  @apply bg-base text-primary antialiased;
}
```

---

## 4. Layout & Navigation

### Sidebar

- Width: 220px, `bg-surface`, right border `border-border`
- Logo: `◈ Bureau` in brand-400
- Nav items: icon + label, active = blue left border (3px) + `bg-raised`
- Bottom: health status dot (green=connected, red=error) + polling `/health/ready` every 15s
- Version: `v0.1.0` muted text

### Nav items

```
⊞  Dashboard    /
▶  New Task     /tasks/new
───────────────
⚙  Settings    /settings
```

---

## 5. Settings Page — Tab Layout

Three tabs: **Connection | API Keys | Provider Keys**

### Tab: Connection

Existing form (API URL + API Key input + Test Connection button). Dark-styled.

### Tab: API Keys

**List view:**
| Name | Prefix | Permissions | Created | Actions |
|------|--------|-------------|---------|---------|
| default | `bur_li…` | task:read, task:write | 2d ago | Revoke |

- Data: `client.listApiKeys()` via SWR, refresh on focus
- "Revoke" → confirm dialog → `client.revokeApiKey(keyId)` → optimistic remove from list

**Create flow:**

1. `+ Create New Key` button opens inline form: Name (text), Permissions (checkboxes), Expires In Days (optional number)
2. Submit → `client.createApiKey(...)`
3. Modal overlay shows plaintext key ONCE:
   - Key displayed in monospace, full width
   - `Copy to Clipboard` button — auto-dismiss modal after copy
   - Warning: "This key will not be shown again"
   - Close button (after copying)

**Permissions checkboxes:**

- `task:read`, `task:write`, `keys:read`, `keys:write`, `provider-keys:write`

### Tab: Provider Keys

Six providers: `anthropic | google | openai | deepseek | mistral | qwen`

Each row:

```
[Provider Logo/Icon]  [Provider Name]  [Status: ••••ab12 | Not stored]  [Add Key / Remove]
```

- "Add Key" → inline input (password type) + Save button → `client.storeProviderKey(provider, plaintext)`
- "Remove" → confirm → `client.removeProviderKey(provider)`
- Status shows `keyPreview` (last 4 chars) from API response when stored
- No GET endpoint for provider keys exists — status tracked in component state after add/remove actions

**Note on provider key state:** Backend has no `GET /auth/provider-keys` endpoint. Track stored state in localStorage keyed by `bureau_provider_keys_status` as `{ anthropic: boolean, gemini: boolean, ... }`. Update on add/remove success.

---

## 6. Dashboard Home — Metrics

### MetricsRow component

Four stat cards above TaskList, computed from `listTasks({ limit: 100 })`:

| Card         | Value                                | Sub              |
| ------------ | ------------------------------------ | ---------------- |
| Total Tasks  | count                                | "↑ +N today"     |
| Running      | count of stage=Running/Preparing/etc | purple pulse dot |
| Cost Today   | sum costUsd where createdAt=today    | "$X/hr estimate" |
| Success Rate | completed/(completed+failed) %       | "N/N tasks"      |

SWR key: `"tasks"` (shared dengan TaskList — zero double-fetch), refreshInterval: 10000ms.

### TaskList redesign

- Dark table: `bg-surface` header, `bg-base` rows, hover `bg-raised`
- `prompt` tidak ada di `TaskEnvelope` — kolom **Path** (executionPath: fast/standard/full) dipertahankan
- Stage filter pills above table: `All | Running | Completed | Failed | Awaiting Decision`
- Stage badges color-coded:
  - Running/Preparing/Researching/Producing/Reviewing/Formatting → purple
  - Completed → green
  - Failed → red
  - AwaitingUserDecision → amber
  - Submitted → blue

---

## 7. Task Detail — Agentic Animations

### StageOverlay component

- Triggered on `stream.currentStage` change
- Full viewport overlay: `bg-black/85`, centered content
- Shows: stage name (large, brand-400), subtitle ("Division activated")
- Auto-dismiss after 1200ms with fade-out transition
- Not shown for initial load — only on stage transitions

### Division Cards redesign

- Grid 4 cols, dark cards `bg-surface border-border`
- **Active card:** `border-brand-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]` pulse animation
- **Inactive cards:** `opacity-40`
- Active card extras:
  - Horizontal scan line: CSS `@keyframes scanline` sweeping left-to-right
  - Message text: typing effect (reveal char-by-char at 30ms/char)
  - Fake progress bar: animated width 0→80% over 3s, holds until division changes

### AgentThinkingDots component

```
◈  ◈  ◈  BUREAU AGENTS PROCESSING
```

Three `◈` icons animated sequentially (staggered 200ms delay each), `text-brand-400` with `filter: drop-shadow(0 0 4px #60a5fa)`. Shown when `isRunning && activeDivision !== null`.

### TerminalLog component (replaces EventLog)

- Dark container `bg-[#0d0d0d] border border-border rounded-xl`
- Header bar: `● BUREAU SYSTEM LOG` left, `● LIVE` right (green dot, pulse when streaming)
- Font: `JetBrains Mono` 12px
- Each entry: `[HH:MM:SS]  DIVISION   message`
- Division color coding:
  - CEO → `text-blue-400`
  - Finance → `text-yellow-400`
  - Production → `text-green-400`
  - QA → `text-purple-400`
  - HR → `text-pink-400`
  - Compliance → `text-orange-400`
  - SYSTEM → `text-secondary`
- New entries: slide-up + fade-in (`@keyframes slideUp`)
- Auto-scroll to bottom on new entry (via `useEffect` + `scrollIntoView`)
- Blinking cursor `█` at end of last entry
- Max height 400px, overflow-y scroll

### StageProgress redesign

Horizontal segmented bar replacing circles:

- Segments separated by `›` arrows
- Done segments: `bg-success`
- Active segment: animated shimmer (`@keyframes shimmer`) + `bg-brand-500`
- Pending: `bg-raised`
- Labels below each segment

---

## 8. Component Map

### New files

```
src/components/
├── MetricsRow.tsx
├── StageOverlay.tsx
├── TerminalLog.tsx
├── AgentThinkingDots.tsx
└── settings/
    ├── ConnectionTab.tsx
    ├── ApiKeysTab.tsx
    └── ProviderKeysTab.tsx
```

### Modified files

```
tailwind.config.ts
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/settings/page.tsx
src/app/tasks/[id]/page.tsx
src/app/tasks/new/page.tsx
src/components/Sidebar.tsx
src/components/TaskList.tsx
src/components/StageBadge.tsx
src/components/StageProgress.tsx
src/components/DivisionCards.tsx
src/components/DecisionPanel.tsx
src/components/EventLog.tsx        ← replaced by TerminalLog, kept for compat
```

### Unchanged files

```
src/hooks/useTaskStream.ts
src/hooks/useSettings.ts
src/lib/bureau-client.ts
```

---

## 9. Data Flow Notes

- `MetricsRow`: reads same SWR cache as `TaskList` — no extra API call if keys aligned
- `ApiKeysTab`: needs API key with `keys:read` + `keys:write` permissions. If current key lacks permission, show "Insufficient permissions" state
- `ProviderKeysTab`: stored state in localStorage (no backend GET). Cleared on settings reset
- `StageOverlay`: purely reactive to `useTaskStream` state — no new data fetching
- `TerminalLog`: receives `events: BureauSSEEvent[]` from parent (same as EventLog) — drop-in replacement

---

## 10. Animation Performance Notes

- All animations use CSS `@keyframes` — no JS animation libraries
- `StageOverlay` uses `pointer-events-none` when invisible
- Typing effect uses `useState` + `useEffect` with `setInterval` — cancelled on cleanup
- Scan line is pure CSS, no JS
- `will-change: transform` on animated elements to hint GPU compositing
