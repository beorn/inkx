---
id: "@km/tui/board-split"
aliases:
  - km-tui.board-split
  - km-tui-board-split
created_by: Bjørn Stabell
created_at: 2026-04-09T08:00:39Z
closed_at: 2026-04-09T15:00:04Z
close_reason: Board.tsx 1336→266 LOC (10 useEffects→1). Split into BoardView.tsx
  (637 LOC, pure render) + useBoardController.ts (587 LOC, lifecycle). Work
  found uncommitted on main — committed as 61a745f3a.
---

# [x] Split Board.tsx into BoardView + useBoardController (1336→≤900 LOC) @km/tui #task #P0

## Why

Final gap to reactive tree quality plateau. Bead @km/tui/tree/v4/detail-unify hit ≤12 useEffect target (10) but missed ≤1100 LOC target (1336 actual). Pro review (GPT 5.4 Pro) recommended this split.

## Goal

Split apps/@km/tui/src/views/Board.tsx (1336 LOC) into:
1. **BoardView.tsx** (~400-600 LOC) — pure render, JSX only, takes props
2. **useBoardController.ts** (~600-900 LOC) — all useEffects, signal subscriptions, derived state
3. **Board.tsx** (~50-200 LOC) — thin connector

## Current State

- Board.tsx: 1336 LOC, 10 useEffects (target ≤12 met), prev-tracking refs gone
- All hooks consolidated into render component
- Pro review explicitly recommended split

## Why Deferred

Two background agent attempts (2026-04-09 session) hit API 529 overloaded errors before completing any work. The split is mechanical but takes ~30+ min of focused agent work, and 529 retries are unreliable. Better to do this in a fresh session when API is stable.

## /complete

\`\`\`bash
wc -l apps/km-tui/src/views/Board.tsx  # ≤200
ls apps/km-tui/src/views/BoardView.tsx  # exists
ls apps/km-tui/src/views/useBoardController.ts  # exists
rg '^\s+useEffect\(' apps/km-tui/src/views/Board.tsx | wc -l  # 0
bun run test:fast  # pass
\`\`\`

## Approach

1. Read Board.tsx top to bottom, classify each block: lifecycle/state vs render vs connector
2. Extract all hooks to useBoardController.ts
3. Extract all JSX to BoardView.tsx
4. Board.tsx becomes \`function Board(props) { const c = useBoardController(props); return <BoardView {...c} /> }\`
5. Use a worktree (foundational change to a high-traffic file)