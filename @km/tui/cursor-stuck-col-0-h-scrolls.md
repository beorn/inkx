---
mentions:
  - km
  - claude
id: "@km/tui/cursor-stuck-col-0-h-scrolls"
aliases:
  - km-tui.cursor-stuck-col-0-h-scrolls
  - km-tui-cursor-stuck-col-0-h-scrolls
created_by: claude:019d032d
created_at: 2026-04-22T20:24:21Z
closed_at: 2026-04-22T20:31:01Z
close_reason: "Fixed via silvery 6df747b6 (useVirtualizer edge-based scroll) +
  km a05888b8e. Root cause: useVirtualizer unconditionally set
  scrollOffset=scrollTo on every cursor move, making the cursor item always
  leftmost-visible. Fix: only update anchor when scrollTo lands outside the
  current visible window. Two regression tests in
  apps/km-tui/tests/scroll-and-cursor.test.tsx. Verified live in TTY MCP."
owner: bjorn@stabell.org
assignee: claude:019d032d
---

# [x] Horizontal nav scrolls board instead of moving cursor across columns @km/tui #bug #P1 @claude:019d032d

User report: 'the board scrolls horizontally whenever cursor moves horizontally - the cursor seems to always be in the first column instead of moving across the board and scrolling at the end'.

Expected: pressing l/h or Right/Left arrow moves the cursor across columns. Board scrolls horizontally only when cursor reaches the off-screen edge.

Observed: cursor never leaves column 0; instead, the board itself scrolls horizontally on each horizontal-nav keypress.

Suspect: recent silvery virtualizer refactor (380e9644 height-aware bootstrap walk delete, b9e9a67a useVirtualizer reactive useScrollState, etc.) may have broken HorizontalVirtualList's cursor-vs-scroll separation.

Repro plan:

1. Create vault with 5+ columns wider than terminal
2. bun km view <vault>
3. Press l (or Right) repeatedly
4. Observe: cursor should move to column 1, 2, 3 ... before board scrolls

Files likely involved:

- vendor/silvery/packages/ag-react/src/ui/HorizontalVirtualList.tsx (or similar)
- apps/@km/tui/src/views/board-layout.ts (uses calcColumnWidth, maxExpandedCols)
- apps/@km/tui/src/board/handle-key.ts → handleHorizontalNav → vnNavigateHorizontal
- apps/@km/tui/src/state/grid-navigator.ts

