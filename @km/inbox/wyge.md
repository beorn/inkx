---
id: "@km/inbox/wyge"
aliases:
  - km-wyge
  - "@km/_orphan/wyge"
created_at: 2026-01-22T23:32:01Z
closed_at: 2026-01-23T15:03:43Z
---

# [x] Task-based progress system for km view @km/_orphan #feature #P2

## Problem
`km view` shows "Loading..." for 3s, then nothing for 3s, then board appears.

## Root Causes
1. Top-level imports in index.ts block before command runs
2. Synchronous operations (initBoardState) block event loop, freezing spinner animation

## Solution
Task-based progress system using MultiProgress:

```
✓ Loading modules
✓ Loading vault
⠋ Building view [████░░░░░░] 3/10
○ Starting TUI
```

## Implementation
1. Create `runWithTasks()` wrapper using MultiProgress
2. Convert `initBoardState()` to generator with progress yields
3. Update view.ts to use task-based progress
4. Make index.ts imports lazy

See plan: .claude/plans/lucky-wiggling-matsumoto.md