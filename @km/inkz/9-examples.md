---
id: "@km/inkz/9-examples"
aliases:
  - km-inkz.9-examples
  - km-inkz-9-examples
created_at: 2026-01-19T12:01:56Z
closed_at: 2026-01-19T14:35:47Z
---

# [x] InkZ: Fix example apps - dashboard hangs, no text output, border misalignment @km/inkz #bug #P1

## Problem

Visual inspection confirms all three example apps are broken:

### Dashboard
- **Hangs indefinitely** - No output, process doesn't terminate
- Likely stuck in async initialization or infinite render loop

### Task List  
- **Borders render but text is empty** - Blue box with rounded corners visible, but no task text inside
- **useInput crashes** - "Raw mode is not supported on the current process.stdin" error
- After crash, error trace shows useInput trying to call setRawMode without TTY

### Kanban
- **Same text issue** - 3 columns visible with card borders, but card text is empty
- **Same useInput crash** - Crashes after initial render when trying to enable raw mode

## Root Causes Identified

### 1. Text Content Not Rendering (P1)
The pipeline.ts `renderText()` function is called but text content is empty:
- `node.textContent` is likely undefined or not set by reconciler
- Need to verify reconciler is setting textContent property on text nodes
- Check if children are being converted to text properly

### 2. useInput Raw Mode Error (P1)
The useInput hook (line 330) calls `stdinContext.setRawMode(true)` unconditionally:
- When stdin is not a TTY (piped), this throws
- Need to add guard: `if (stdin.isTTY)` before setRawMode
- Or handle the error gracefully

### 3. Dashboard Hang (P2)
Need to debug with logging to identify where it stalls:
- Yoga initialization?
- Reconciler loop?
- Scheduler not triggering render?

## Visual Evidence

```
# Task List (from terminal capture):
╭────────────────────────────╮  ← Blue border renders
│                            │  ← Text area is EMPTY
│                            │
╰────────────────────────────╯
┌────────────────────────────┐  ← Help bar border
└────────────────────────────┘  ← Also empty

# Kanban (from terminal capture):
┌───────────┐ ┌────────────┐ ┌───────────┐  ← Column borders
│ ╭───────╮ │ │ ╭────────╮ │ │ ╭───────╮ │  ← Card borders
│ ╰───────╯ │ │ │        │ │ │ ╰───────╯ │  ← No text content
└───────────┘ └────────────┘ └───────────┘
```

## Acceptance Criteria

- [ ] Text content renders inside boxes (not empty)
- [ ] useInput works in TTY, degrades gracefully without TTY
- [ ] Dashboard doesn't hang - renders within 2 seconds
- [ ] All examples exit cleanly with q or Ctrl+C
